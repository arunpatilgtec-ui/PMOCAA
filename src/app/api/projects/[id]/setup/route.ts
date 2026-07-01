import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CATEGORY_TEMPLATES, WorkstreamTemplate } from '@/lib/project-templates'
import { sequenceTasks } from '@/lib/date-utils'

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

    // Pre-compute all task dates: all workstreams scheduled sequentially with half-day packing
    const allTemplateTasks = wsTemplates ? wsTemplates.flatMap((ws) => ws.tasks) : []
    const anchor = new Date(startDate)
    anchor.setHours(0, 0, 0, 0)
    const allDates = wsTemplates ? sequenceTasks(allTemplateTasks, anchor) : []

    let endDate: Date
    if (wsTemplates && allDates.length > 0) {
      endDate = allDates[allDates.length - 1].endDate
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
        let dateIdx = 0
        let wsOrder = 0

        for (const wsTemplate of wsTemplates) {
          const ws = await tx.workstream.create({
            data: { name: wsTemplate.name, projectId: id, order: wsOrder++ },
          })

          let taskOrder = 0
          for (const taskTemplate of wsTemplate.tasks) {
            const { startDate: taskStart, endDate: taskEnd } = allDates[dateIdx++]
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
                // Tear Down + Deliverables default to project lead
                ...((wsTemplate.name === 'Tear Down' || wsTemplate.name === 'Deliverables') && leadId
                  ? { ownerId: leadId }
                  : {}),
              },
            })
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
