import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'
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

    const wsTemplates = data.category && CATEGORY_TEMPLATES[data.category]
    const startDate = new Date(project.startDate)

    // Compute end date: from template if available, else from body, else keep existing
    let endDate: Date
    if (wsTemplates) {
      let cursor = new Date(startDate)
      for (const ws of wsTemplates) {
        for (const task of ws.tasks) {
          cursor = addWorkingDays(cursor, task.durationDays)
        }
      }
      endDate = cursor
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
          ...(data.priority ? { priority: data.priority } : {}),
          ...(data.leadId !== undefined ? { leadId: data.leadId || null } : {}),
          ...(data.category !== undefined ? { category: data.category || null } : {}),
          ...(data.productType !== undefined ? { productType: data.productType || null } : {}),
          ...(data.projectLinks !== undefined ? { projectLinks: data.projectLinks } : {}),
        },
      })

      if (wsTemplates) {
        let cursor = new Date(startDate)
        cursor.setHours(0, 0, 0, 0)
        let wsOrder = 0

        for (const wsTemplate of wsTemplates) {
          const ws = await tx.workstream.create({
            data: {
              name: wsTemplate.name,
              projectId: id,
              order: wsOrder++,
            },
          })

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
              },
            })

            cursor = addWorkingDays(taskEnd, 1)
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
