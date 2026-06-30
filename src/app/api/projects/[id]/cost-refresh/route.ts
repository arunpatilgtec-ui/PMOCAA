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
        costRefresh: true,
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
    const otherWs = project.workstreams.filter((ws) => ws.name !== 'Tear Down')

    if (enable) {
      const tdTasks = teardownWs.flatMap((ws) => ws.tasks)
      const tdWithDates = tdTasks.filter((t) => t.startDate && t.endDate)

      let offsetDays = 0
      if (tdWithDates.length > 0) {
        const tdStartMs = Math.min(...tdWithDates.map((t) => new Date(t.startDate!).getTime()))
        const tdEndMs   = Math.max(...tdWithDates.map((t) => new Date(t.endDate!).getTime()))
        offsetDays = Math.round((tdEndMs - tdStartMs) / 86_400_000) + 1
      }

      const ops: ReturnType<typeof prisma.task.update>[] = []

      // Cancel teardown tasks and mark them
      for (const ws of teardownWs) {
        for (const task of ws.tasks) {
          if (task.status === 'CANCELLED') continue
          ops.push(
            prisma.task.update({
              where: { id: task.id },
              data: {
                status: 'CANCELLED',
                description: `[CR]${task.description ?? ''}`,
              },
            })
          )
        }
      }

      // Shift non-teardown tasks backward
      if (offsetDays > 0) {
        for (const ws of otherWs) {
          for (const task of ws.tasks) {
            if (!task.startDate) continue
            ops.push(
              prisma.task.update({
                where: { id: task.id },
                data: {
                  startDate: addDays(task.startDate, -offsetDays),
                  ...(task.endDate ? { endDate: addDays(task.endDate, -offsetDays) } : {}),
                },
              })
            )
          }
        }
      }

      await prisma.$transaction([
        ...ops,
        prisma.project.update({ where: { id }, data: { costRefresh: true, costRefreshOffset: offsetDays } }),
      ])
    } else {
      const offsetDays = project.costRefreshOffset

      const ops: ReturnType<typeof prisma.task.update>[] = []

      // Restore teardown tasks that were CR-cancelled
      for (const ws of teardownWs) {
        for (const task of ws.tasks) {
          if (!task.description?.startsWith('[CR]')) continue
          const restoredDesc = task.description.slice(4) || null
          ops.push(
            prisma.task.update({
              where: { id: task.id },
              data: { status: 'PLANNED', description: restoredDesc },
            })
          )
        }
      }

      // Shift non-teardown tasks forward
      if (offsetDays > 0) {
        for (const ws of otherWs) {
          for (const task of ws.tasks) {
            if (!task.startDate) continue
            ops.push(
              prisma.task.update({
                where: { id: task.id },
                data: {
                  startDate: addDays(task.startDate, offsetDays),
                  ...(task.endDate ? { endDate: addDays(task.endDate, offsetDays) } : {}),
                },
              })
            )
          }
        }
      }

      await prisma.$transaction([
        ...ops,
        prisma.project.update({ where: { id }, data: { costRefresh: false, costRefreshOffset: 0 } }),
      ])
    }

    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[COST_REFRESH]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
