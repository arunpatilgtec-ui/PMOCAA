import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/cost-refresh'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    if (!['ADMIN', 'PLANNER', 'MANAGER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { enable } = await req.json() as { enable: boolean }

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        costRefreshOffset: true,
        workstreams: {
          select: {
            id: true,
            name: true,
            tasks: {
              select: { id: true, status: true, description: true, startDate: true, endDate: true },
            },
          },
        },
      },
    })

    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const teardownWs = project.workstreams.filter((ws) => ws.name === 'Tear Down')
    const otherWs    = project.workstreams.filter((ws) => ws.name !== 'Tear Down')

    if (enable) {
      const tdTasks     = teardownWs.flatMap((ws) => ws.tasks)
      const tdWithDates = tdTasks.filter((t) => t.startDate && t.endDate)

      // Offset = gap from teardown start to first non-teardown task start
      // This ensures costing lands exactly where teardown would have started,
      // regardless of any buffer days between the two workstreams.
      let offsetDays = 0
      const otherTasksWithDates = otherWs.flatMap((ws) => ws.tasks).filter((t) => t.startDate)
      if (tdWithDates.length > 0 && otherTasksWithDates.length > 0) {
        const tdStartMs    = Math.min(...tdWithDates.map((t) => new Date(t.startDate!).getTime()))
        const otherStartMs = Math.min(...otherTasksWithDates.map((t) => new Date(t.startDate!).getTime()))
        if (otherStartMs > tdStartMs) {
          offsetDays = Math.round((otherStartMs - tdStartMs) / 86_400_000)
        }
      }

      await prisma.$transaction(async (tx) => {
        // Cancel teardown tasks
        for (const ws of teardownWs) {
          for (const task of ws.tasks) {
            if (task.status === 'CANCELLED') continue
            await tx.task.update({
              where: { id: task.id },
              data: {
                status: 'CANCELLED',
                description: `[CR]${task.description ?? ''}`,
              },
            })
          }
        }

        // Shift non-teardown tasks backward
        if (offsetDays > 0) {
          for (const ws of otherWs) {
            for (const task of ws.tasks) {
              if (!task.startDate) continue
              await tx.task.update({
                where: { id: task.id },
                data: {
                  startDate: addDays(task.startDate, -offsetDays),
                  ...(task.endDate ? { endDate: addDays(task.endDate, -offsetDays) } : {}),
                },
              })
            }
          }
        }

        await tx.project.update({
          where: { id },
          data: { costRefresh: true, costRefreshOffset: offsetDays },
        })
      })

      return Response.json({ ok: true, offsetDays })
    } else {
      const offsetDays = project.costRefreshOffset

      await prisma.$transaction(async (tx) => {
        // Restore CR-cancelled teardown tasks
        for (const ws of teardownWs) {
          for (const task of ws.tasks) {
            if (!task.description?.startsWith('[CR]')) continue
            await tx.task.update({
              where: { id: task.id },
              data: {
                status: 'PLANNED',
                description: task.description.slice(4) || null,
              },
            })
          }
        }

        // Shift non-teardown tasks forward — only those that were actually shifted back
        // (i.e. their current startDate is before the teardown start date, meaning CR moved them).
        // Tasks that weren't shifted (dates still after teardown window) are left alone.
        if (offsetDays > 0) {
          const tdDates = teardownWs.flatMap((ws) => ws.tasks).filter((t) => t.startDate)
          const tdStartMs = tdDates.length > 0
            ? Math.min(...tdDates.map((t) => new Date(t.startDate!).getTime()))
            : null

          for (const ws of otherWs) {
            for (const task of ws.tasks) {
              if (!task.startDate) continue
              const taskStartMs = new Date(task.startDate).getTime()
              // Only shift if the task currently starts before teardown start (i.e. was shifted by CR)
              if (tdStartMs !== null && taskStartMs >= tdStartMs) continue
              await tx.task.update({
                where: { id: task.id },
                data: {
                  startDate: addDays(task.startDate, offsetDays),
                  ...(task.endDate ? { endDate: addDays(task.endDate, offsetDays) } : {}),
                },
              })
            }
          }
        }

        await tx.project.update({
          where: { id },
          data: { costRefresh: false, costRefreshOffset: 0 },
        })
      })

      return Response.json({ ok: true })
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[COST_REFRESH]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
