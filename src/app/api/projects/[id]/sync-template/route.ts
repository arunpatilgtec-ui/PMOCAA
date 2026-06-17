import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'
import { addWorkingDays } from '@/lib/date-utils'

const CHECKLIST_WS = new Set(['Planning', 'Deliverables'])

// Adds missing template tasks to existing workstreams — non-destructive (never deletes).
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
    if (!wsTemplates) return Response.json({ added: 0 })

    const leadId: string | null = project.leadId || null
    let totalAdded = 0

    await prisma.$transaction(async (tx) => {
      for (const wsTemplate of wsTemplates) {
        const existingWs = project.workstreams.find((w) => w.name === wsTemplate.name)
        if (!existingWs) continue // workstream doesn't exist yet — skip (setup handles creation)

        const existingNames = new Set(existingWs.tasks.map((t) => t.name))
        const missingTasks = wsTemplate.tasks.filter((t) => !existingNames.has(t.name))
        if (missingTasks.length === 0) continue

        const isChecklist = CHECKLIST_WS.has(wsTemplate.name)
        let nextOrder = existingWs.tasks.length

        // For scheduled workstreams, new tasks go after the last existing task
        const lastTask = existingWs.tasks[existingWs.tasks.length - 1]
        let cursor: Date | null = lastTask?.endDate
          ? addWorkingDays(new Date(lastTask.endDate), 1)
          : null

        for (const taskTemplate of missingTasks) {
          const taskStart = !isChecklist && cursor ? new Date(cursor) : undefined
          const taskEnd = !isChecklist && cursor
            ? addWorkingDays(new Date(cursor), taskTemplate.durationDays - 1)
            : undefined

          await tx.task.create({
            data: {
              name: taskTemplate.name,
              workstreamId: existingWs.id,
              status: 'BACKLOG',
              priority: 'MEDIUM',
              order: nextOrder++,
              ...(taskStart ? { startDate: taskStart } : {}),
              ...(taskEnd ? { endDate: taskEnd } : {}),
              estimatedHours: taskTemplate.estimatedHours,
              // Deliverables default to project lead; others unassigned
              ...(wsTemplate.name === 'Deliverables' && leadId ? { ownerId: leadId } : {}),
            },
          })

          if (cursor && taskEnd) cursor = addWorkingDays(taskEnd, 1)
          totalAdded++
        }
      }
    })

    return Response.json({ added: totalAdded })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[SYNC-TEMPLATE POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
