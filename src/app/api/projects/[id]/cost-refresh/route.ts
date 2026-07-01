import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays, sequenceTasks } from '@/lib/date-utils'
import { CATEGORY_TEMPLATES, WorkstreamTemplate } from '@/lib/project-templates'

type Ctx = { params: Promise<{ id: string }> }

// Resequences workstreams from startDate using template order + half-day packing.
// skipNames: workstreams whose cursor slot is collapsed to zero (next ws starts here).
async function applySequence(
  tx: Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  workstreams: Array<{
    name: string
    tasks: Array<{ id: string; name: string; status: string; description: string | null }>
  }>,
  template: WorkstreamTemplate[],
  startDate: Date,
  skipNames: string[]
) {
  let cursor = new Date(startDate)

  for (const wsTemplate of template) {
    if (skipNames.includes(wsTemplate.name)) continue // cursor stays — next ws fills this slot

    const dbWs = workstreams.find((w) => w.name === wsTemplate.name)
    if (!dbWs) {
      // Workstream not in DB — consume template slots to stay aligned
      const slots = sequenceTasks(wsTemplate.tasks, cursor)
      if (slots.length > 0) cursor = addWorkingDays(slots[slots.length - 1].endDate, 1)
      continue
    }

    const activeTasks = dbWs.tasks.filter((t) => t.status !== 'CANCELLED')
    const hasPerProduct = activeTasks.some((t) => t.description?.includes('__productTask:'))
    const slots = sequenceTasks(wsTemplate.tasks, cursor)

    if (hasPerProduct) {
      for (let i = 0; i < wsTemplate.tasks.length; i++) {
        const tmplTask = wsTemplate.tasks[i]
        const { startDate: s, endDate: e } = slots[i]
        const matching = activeTasks.filter((t) => {
          const sub = t.name.includes(' — ') ? t.name.split(' — ').slice(1).join(' — ') : t.name
          return sub === tmplTask.name
        })
        for (const task of matching) {
          await tx.task.update({ where: { id: task.id }, data: { startDate: s, endDate: e } })
        }
      }
      if (slots.length > 0) cursor = addWorkingDays(slots[slots.length - 1].endDate, 1)
    } else {
      const items = activeTasks.map((t) => ({
        id: t.id,
        durationDays: wsTemplate.tasks.find((tt) => tt.name === t.name)?.durationDays ?? 1,
      }))
      const taskSlots = sequenceTasks(items, cursor)
      for (let i = 0; i < items.length; i++) {
        const { startDate: s, endDate: e } = taskSlots[i]
        await tx.task.update({ where: { id: items[i].id }, data: { startDate: s, endDate: e } })
      }
      if (taskSlots.length > 0) cursor = addWorkingDays(taskSlots[taskSlots.length - 1].endDate, 1)
    }
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    if (!['ADMIN', 'PLANNER', 'MANAGER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { enable } = (await req.json()) as { enable: boolean }

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        category: true,
        startDate: true,
        workstreams: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' },
              select: { id: true, name: true, status: true, description: true },
            },
          },
        },
      },
    })

    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const template = project.category ? CATEGORY_TEMPLATES[project.category] : undefined
    const teardownWs = project.workstreams.filter((ws) => ws.name === 'Tear Down')

    await prisma.$transaction(async (tx) => {
      if (enable) {
        // Cancel all active Tear Down tasks
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

        // Re-sequence: skip Tear Down so Costing lands where TD would have started
        if (template && project.startDate) {
          await applySequence(tx, project.workstreams, template, new Date(project.startDate), ['Tear Down'])
        }

        await tx.project.update({ where: { id }, data: { costRefresh: true, costRefreshOffset: 0 } })
      } else {
        // Restore CR-cancelled Tear Down tasks
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

        // Re-fetch workstreams so Tear Down tasks reflect their just-restored status
        if (template && project.startDate) {
          const freshWorkstreams = await tx.workstream.findMany({
            where: { projectId: id },
            orderBy: { order: 'asc' },
            include: {
              tasks: {
                orderBy: { order: 'asc' },
                select: { id: true, name: true, status: true, description: true },
              },
            },
          })

          await applySequence(tx, freshWorkstreams, template, new Date(project.startDate), [])
        }

        await tx.project.update({ where: { id }, data: { costRefresh: false, costRefreshOffset: 0 } })
      }
    })

    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[COST_REFRESH]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
