import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

const DIRECT_WORK_PROJECT_NAME = '__direct_assignments__'

async function getOrCreateDirectWorkstream(assignerId: string) {
  const existing = await prisma.project.findFirst({
    where: { name: DIRECT_WORK_PROJECT_NAME },
    include: { workstreams: { take: 1 } },
  })

  if (existing) {
    if (existing.workstreams.length > 0) return existing.workstreams[0]
    // Project exists but no workstream — create one
    return prisma.workstream.create({
      data: { projectId: existing.id, name: 'Direct Assignments', status: 'IN_PROGRESS' },
    })
  }

  // Create project + workstream together, then fetch the workstream
  const created = await prisma.project.create({
    data: {
      name: DIRECT_WORK_PROJECT_NAME,
      description: 'System project for direct work assignments',
      type: 'OTHER',
      status: 'ACTIVE',
      priority: 'MEDIUM',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2099-12-31'),
      plannerId: assignerId,
      workstreams: {
        create: {
          name: 'Direct Assignments',
          status: 'IN_PROGRESS',
        },
      },
    },
    include: { workstreams: { take: 1 } },
  })
  return created.workstreams[0]
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')

    const where: Record<string, unknown> = {
      workstream: { project: { name: DIRECT_WORK_PROJECT_NAME } },
    }
    if (userId) where.ownerId = userId

    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      where.ownerId = session.id
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true, role: true } },
        workstream: {
          include: { project: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'desc' }],
    })

    return Response.json(tasks)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role))
      return Response.json({ error: 'Forbidden' }, { status: 403 })

    const data = await req.json()
    const { name, description, ownerId, estimatedHours, startDate, endDate, priority } = data

    if (!name || !ownerId)
      return Response.json({ error: 'name and ownerId are required' }, { status: 400 })

    const workstream = await getOrCreateDirectWorkstream(session.id)

    const task = await prisma.task.create({
      data: {
        name,
        description: description || null,
        workstreamId: workstream.id,
        ownerId,
        priority: priority || 'MEDIUM',
        status: 'PLANNED',
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : 0,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
      },
    })

    // Notify the assignee
    if (ownerId !== session.id) {
      await prisma.notification.create({
        data: {
          userId: ownerId,
          senderId: session.id,
          type: 'TASK_ASSIGNED',
          title: 'Work Assigned to You',
          message: `${session.name} assigned you: "${name}"${estimatedHours ? ` (${estimatedHours}h estimated)` : ''}${endDate ? ` · due ${new Date(endDate).toLocaleDateString()}` : ''}`,
          actionUrl: '/kanban',
        },
      })
    }

    return Response.json(task, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
