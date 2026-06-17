import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'
import { addWorkingDays } from '@/lib/date-utils'

// Adds missing template tasks AND fills in dates for existing undated tasks.
// Never deletes or modifies tasks that already have dates.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'PLANNER', 'PROJECT_LEAD'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        workstreams: {
          include: { tasks: { orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        },
      },
    })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const wsTemplates = project.category ? CATEGORY_TEMPLATES[project.category] : undefined
    if (!wsTemplates) return Response.json({ added: 0, updated: 0 })

    const leadId: string | null = project.leadId || null
    let totalAdded = 0
    let totalUpdated = 0

    await prisma.$transaction(async (tx) => {
      // cursor tracks the next available date as we sequence workstreams in template order
      let cursor = new Date(project.startDate)
      cursor.setHours(0, 0, 0, 0)

      for (const wsTemplate of wsTemplates) {
        const existingWs = project.workstreams.find((w) => w.name === wsTemplate.name)

        if (!existingWs) {
          // Workstream missing entirely — advance cursor by template duration so later
          // workstreams still land in the right position
          for (const tmpl of wsTemplate.tasks) {
            const end = addWorkingDays(new Date(cursor), tmpl.durationDays - 1)
            cursor = addWorkingDays(end, 1)
          }
          continue
        }

        const existingNames = new Set(existingWs.tasks.map((t) => t.name))
        const datedTasks = existingWs.tasks.filter((t) => t.startDate && t.endDate)

        if (datedTasks.length > 0) {
          // Workstream already has dated tasks — lock them in place, advance cursor past the last one
          const maxEnd = new Date(Math.max(...datedTasks.map((t) => new Date(t.endDate!).getTime())))
          cursor = addWorkingDays(maxEnd, 1)

          // Still create any missing tasks at the tail of this workstream
          const missingTasks = wsTemplate.tasks.filter((t) => !existingNames.has(t.name))
          let nextOrder = existingWs.tasks.length
          for (const tmpl of missingTasks) {
            const taskStart = new Date(cursor)
            const taskEnd = addWorkingDays(new Date(cursor), tmpl.durationDays - 1)
            await tx.task.create({
              data: {
                name: tmpl.name,
                workstreamId: existingWs.id,
                status: 'BACKLOG',
                priority: 'MEDIUM',
                order: nextOrder++,
                startDate: taskStart,
                endDate: taskEnd,
                estimatedHours: tmpl.estimatedHours,
                ...((wsTemplate.name === 'Tear Down' || wsTemplate.name === 'Deliverables') && leadId
                  ? { ownerId: leadId }
                  : {}),
              },
            })
            cursor = addWorkingDays(taskEnd, 1)
            totalAdded++
          }
        } else {
          // Workstream has NO dated tasks — fill in dates for every existing task from cursor
          let taskCursor = new Date(cursor)
          for (const task of existingWs.tasks) {
            const tmpl = wsTemplate.tasks.find((t) => t.name === task.name)
            const duration = tmpl?.durationDays ?? 1
            const taskStart = new Date(taskCursor)
            const taskEnd = addWorkingDays(taskStart, duration - 1)
            await tx.task.update({
              where: { id: task.id },
              data: { startDate: taskStart, endDate: taskEnd },
            })
            taskCursor = addWorkingDays(taskEnd, 1)
            totalUpdated++
          }

          // Also create any missing tasks right after the updated ones
          const missingTasks = wsTemplate.tasks.filter((t) => !existingNames.has(t.name))
          let nextOrder = existingWs.tasks.length
          for (const tmpl of missingTasks) {
            const taskStart = new Date(taskCursor)
            const taskEnd = addWorkingDays(taskStart, tmpl.durationDays - 1)
            await tx.task.create({
              data: {
                name: tmpl.name,
                workstreamId: existingWs.id,
                status: 'BACKLOG',
                priority: 'MEDIUM',
                order: nextOrder++,
                startDate: taskStart,
                endDate: taskEnd,
                estimatedHours: tmpl.estimatedHours,
                ...((wsTemplate.name === 'Tear Down' || wsTemplate.name === 'Deliverables') && leadId
                  ? { ownerId: leadId }
                  : {}),
              },
            })
            taskCursor = addWorkingDays(taskEnd, 1)
            totalAdded++
          }

          cursor = taskCursor
        }
      }
    })

    return Response.json({ added: totalAdded, updated: totalUpdated })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[SYNC-TEMPLATE POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
