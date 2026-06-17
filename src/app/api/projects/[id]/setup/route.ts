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
    // The lead who gets default ownership of Tear Down and Report tasks
    const leadId: string | null = data.leadId || project.leadId || null

    // Pre-compute teardown midpoint offset (working days from teardown start)
    const tdTemplate = wsTemplates?.find((w) => w.name === 'Tear Down')
    const tdTotalDays = tdTemplate
      ? tdTemplate.tasks.reduce((s, t) => s + t.durationDays, 0)
      : 0
    const tdMidOffset = Math.floor(tdTotalDays / 2)

    // Compute end date: sequential except Report which starts at teardown midpoint
    let endDate: Date
    if (wsTemplates) {
      let cursor = new Date(startDate)
      cursor.setHours(0, 0, 0, 0)
      let tdMidDate: Date | null = null
      let maxEnd = new Date(cursor)

      for (const ws of wsTemplates) {
        if (ws.name === 'Deliverables' || ws.name === 'Planning') continue // No scheduling — created as checklist
        if (ws.name === 'Report') {
          let rc = tdMidDate ? new Date(tdMidDate) : new Date(cursor)
          for (const task of ws.tasks) {
            const end = addWorkingDays(new Date(rc), task.durationDays - 1)
            if (end > maxEnd) maxEnd = new Date(end)
            rc = addWorkingDays(end, 1)
          }
        } else {
          if (ws.name === 'Tear Down') {
            tdMidDate = addWorkingDays(new Date(cursor), tdMidOffset)
          }
          for (const task of ws.tasks) {
            const end = addWorkingDays(new Date(cursor), task.durationDays - 1)
            if (end > maxEnd) maxEnd = new Date(end)
            cursor = addWorkingDays(end, 1)
          }
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
        let tdMidDate: Date | null = null
        let wsOrder = 0

        for (const wsTemplate of wsTemplates) {
          const ws = await tx.workstream.create({
            data: { name: wsTemplate.name, projectId: id, order: wsOrder++ },
          })

          if (wsTemplate.name === 'Deliverables' || wsTemplate.name === 'Planning') {
            // Checklist tasks — no scheduling, no dates
            // Deliverables default owner = project lead; Planning stays unassigned
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
          } else if (wsTemplate.name === 'Report') {
            // Report starts at teardown midpoint (parallel with second half of teardown)
            let rc = tdMidDate ? new Date(tdMidDate) : new Date(cursor)
            let taskOrder = 0
            for (const taskTemplate of wsTemplate.tasks) {
              const taskStart = new Date(rc)
              const taskEnd = addWorkingDays(new Date(rc), taskTemplate.durationDays - 1)
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
                  // Report defaults to project lead
                  ...(leadId ? { ownerId: leadId } : {}),
                },
              })
              rc = addWorkingDays(taskEnd, 1)
            }
          } else {
            if (wsTemplate.name === 'Tear Down') {
              tdMidDate = addWorkingDays(new Date(cursor), tdMidOffset)
            }

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
                  // Tear Down defaults to project lead; Planning and Costing stay unassigned
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
