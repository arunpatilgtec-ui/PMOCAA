import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CATEGORY_TEMPLATES, WorkstreamTemplate } from '@/lib/project-templates'
import { addWorkingDays } from '@/lib/date-utils'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'PLANNER', 'PROJECT_LEAD'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const data = await req.json()

    const project = await prisma.project.findUnique({ where: { id } })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const wsTemplates: WorkstreamTemplate[] | undefined =
      data.category && CATEGORY_TEMPLATES[data.category]
        ? CATEGORY_TEMPLATES[data.category]
        : undefined

    const startDate = new Date(project.startDate)
    const leadId: string | null = data.leadId || project.leadId || null

    const CHECKLIST_WS = new Set(['Planning', 'Deliverables', 'Report'])

    // Compute end date: sequential through scheduled workstreams (Planning/Deliverables/Report are checklists)
    let endDate: Date
    if (wsTemplates) {
      let cursor = new Date(startDate)
      cursor.setHours(0, 0, 0, 0)
      let maxEnd = new Date(cursor)

      for (const ws of wsTemplates) {
        if (CHECKLIST_WS.has(ws.name)) continue
        for (const task of ws.tasks) {
          const end = addWorkingDays(new Date(cursor), task.durationDays - 1)
          if (end > maxEnd) maxEnd = new Date(end)
          cursor = addWorkingDays(end, 1)
        }
      }
      endDate = maxEnd
    } else if (data.endDate) {
      endDate = new Date(data.endDate)
    } else {
      endDate = new Date(project.endDate)
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          endDate,
          ...(data.leadId !== undefined ? { leadId: data.leadId || null } : {}),
          ...(data.category !== undefined ? { category: data.category || null } : {}),
          ...(data.productType !== undefined ? { productType: data.productType || null } : {}),
          ...(data.projectLinks !== undefined ? { projectLinks: data.projectLinks } : {}),
        },
      })

      // Clear existing workstreams (cascades to tasks) before regenerating
      await tx.workstream.deleteMany({ where: { projectId: id } })

      if (wsTemplates) {
        let cursor = new Date(startDate)
        cursor.setHours(0, 0, 0, 0)
        let wsOrder = 0

        for (const wsTemplate of wsTemplates) {
          const ws = await tx.workstream.create({
            data: { name: wsTemplate.name, projectId: id, order: wsOrder++ },
          })

          if (CHECKLIST_WS.has(wsTemplate.name)) {
            // Checklist tasks — no scheduling, no dates
            // Deliverables default owner = project lead; others unassigned
            let taskOrder = 0
            for (const taskTemplate of wsTemplate.tasks) {
              await tx.task.create({
                data: {
                  name: taskTemplate.name,
                  workstreamId: ws.id,
                  status: 'BACKLOG',
                  priority: 'MEDIUM',
                  order: taskOrder++,
                  ...(wsTemplate.name === 'Deliverables' && leadId ? { ownerId: leadId } : {}),
                },
              })
            }
          } else {
            let taskOrder = 0
            for (const taskTemplate of wsTemplate.tasks) {
              const taskStart = new Date(cursor)
              const taskEnd = addWorkingDays(new Date(cursor), taskTemplate.durationDays - 1)
              await tx.task.create({
                data: {
                  name: taskTemplate.name,
                  workstreamId: ws.id,
                  status: 'BACKLOG',
                  priority: 'MEDIUM',
                  startDate: taskStart,
                  endDate: taskEnd,
                  estimatedHours: taskTemplate.estimatedHours,
                  order: taskOrder++,
                  // Tear Down defaults to project lead; Costing stays unassigned
                  ...(wsTemplate.name === 'Tear Down' && leadId ? { ownerId: leadId } : {}),
                },
              })
              cursor = addWorkingDays(taskEnd, 1)
            }
          }
        }
      }
    })

    const updated = await prisma.project.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true } },
        workstreams: {
          include: { tasks: { select: { id: true, name: true, status: true } } },
          orderBy: { order: 'asc' },
        },
      },
    })

    return Response.json(updated)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[SETUP POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
