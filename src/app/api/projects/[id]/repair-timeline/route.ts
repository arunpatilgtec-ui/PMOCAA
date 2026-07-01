import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays } from '@/lib/date-utils'
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

    let cursor = new Date(project.startDate)
    let updated = 0

    // Walk workstreams in template order
    for (const wsTemplate of template) {
      const dbWs = project.workstreams.find((w) => w.name === wsTemplate.name)
      if (!dbWs) continue

      const activeTasks = dbWs.tasks.filter((t) => t.status !== 'CANCELLED')

      // Detect whether this workstream uses per-product tasks
      const hasPerProductTasks = activeTasks.some((t) => t.description?.includes('__productTask:'))

      if (hasPerProductTasks) {
        // Per-product tasks: walk template subsystems in order.
        // All products' tasks for the same subsystem get the same dates.
        for (const tmplTask of wsTemplate.tasks) {
          const duration = Math.max(1, Math.ceil(tmplTask.durationDays))
          const taskStart = new Date(cursor)
          const taskEnd = addWorkingDays(new Date(cursor), duration - 1)

          // Match tasks whose name ends with " — <subsystem>" (product prefix before the em-dash)
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

          // Always advance cursor by the template slot, even if no matching tasks found
          cursor = addWorkingDays(taskEnd, 1)
        }
      } else {
        // Regular tasks: sequential by order, look up duration from template
        for (const task of activeTasks) {
          const tmplTask = wsTemplate.tasks.find((t) => t.name === task.name)
          const duration = Math.max(1, Math.ceil(tmplTask?.durationDays ?? 1))
          const taskStart = new Date(cursor)
          const taskEnd = addWorkingDays(new Date(cursor), duration - 1)

          await prisma.task.update({
            where: { id: task.id },
            data: { startDate: taskStart, endDate: taskEnd },
          })
          updated++
          cursor = addWorkingDays(taskEnd, 1)
        }
      }
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
