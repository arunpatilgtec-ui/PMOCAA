import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays, sequenceTasks } from '@/lib/date-utils'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'

type Ctx = { params: Promise<{ id: string }> }

// Re-sequences ALL task dates in a project from project.startDate, following template order and durations.
// Repairs projects corrupted by any prior "fix timeline" operations.
// Per-product tasks (Brand Model — Subsystem): all products' tasks for the same subsystem
// share the same dates (different teams work in parallel on the same subsystem).
// CANCELLED tasks are skipped and do not consume schedule time.
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        category: true,
        startDate: true,
        workstreams: {
          orderBy: { order: 'asc' },
          include: {
            tasks: {
              orderBy: { order: 'asc' },
              select: { id: true, name: true, description: true, status: true },
            },
          },
        },
      },
    })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!project.startDate) return Response.json({ error: 'Project has no start date' }, { status: 400 })

    const template = project.category ? CATEGORY_TEMPLATES[project.category] : undefined
    if (!template) return Response.json({ error: `No template found for category "${project.category}"` }, { status: 400 })

    // Walk workstreams in template order. cursor advances across workstreams so that
    // workstream N+1 starts the working day after workstream N ends.
    let cursor = new Date(project.startDate)
    let updated = 0

    for (const wsTemplate of template) {
      const dbWs = project.workstreams.find((w) => w.name === wsTemplate.name)
      if (!dbWs) {
        // Workstream not in DB — consume its template slots so cursor stays aligned
        const slots = sequenceTasks(wsTemplate.tasks, cursor)
        if (slots.length > 0) cursor = addWorkingDays(slots[slots.length - 1].endDate, 1)
        continue
      }

      const activeTasks = dbWs.tasks.filter((t) => t.status !== 'CANCELLED')
      const hasPerProductTasks = activeTasks.some((t) => t.description?.includes('__productTask:'))

      // Compute dates for each template slot from current cursor, with half-day packing
      const slots = sequenceTasks(wsTemplate.tasks, cursor)

      if (hasPerProductTasks) {
        // All products' tasks for the same subsystem share the same slot dates
        for (let i = 0; i < wsTemplate.tasks.length; i++) {
          const tmplTask = wsTemplate.tasks[i]
          const { startDate: taskStart, endDate: taskEnd } = slots[i]

          const matchingTasks = activeTasks.filter((t) => {
            const subsystem = t.name.includes(' — ')
              ? t.name.split(' — ').slice(1).join(' — ')
              : t.name
            return subsystem === tmplTask.name
          })

          for (const task of matchingTasks) {
            await prisma.task.update({
              where: { id: task.id },
              data: { startDate: taskStart, endDate: taskEnd },
            })
            updated++
          }
        }
      } else {
        // Regular tasks: sequence in DB order, using each task's template duration
        const tasksWithDurations = activeTasks.map((t) => ({
          id: t.id,
          durationDays: wsTemplate.tasks.find((tt) => tt.name === t.name)?.durationDays ?? 1,
        }))
        const taskSlots = sequenceTasks(tasksWithDurations, cursor)

        for (let i = 0; i < tasksWithDurations.length; i++) {
          const { startDate: taskStart, endDate: taskEnd } = taskSlots[i]
          await prisma.task.update({
            where: { id: tasksWithDurations[i].id },
            data: { startDate: taskStart, endDate: taskEnd },
          })
          updated++
        }

        if (taskSlots.length > 0) {
          cursor = addWorkingDays(taskSlots[taskSlots.length - 1].endDate, 1)
          continue // cursor already set, skip the slot-based advance below
        }
      }

      // Advance cursor past the last template slot (per-product path, or no tasks in DB)
      if (slots.length > 0) cursor = addWorkingDays(slots[slots.length - 1].endDate, 1)
    }

    return Response.json({ updated })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[REPAIR-TIMELINE]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
