import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyTaskAssigned } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const workstreamId = searchParams.get('workstreamId')
    const ownerId = searchParams.get('ownerId')
    const projectId = searchParams.get('projectId')

    const tasks = await prisma.task.findMany({
      where: {
        ...(workstreamId ? { workstreamId } : {}),
        ...(ownerId ? { ownerId } : {}),
        ...(projectId
          ? {
              workstream: { projectId },
            }
          : {}),
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        workstream: {
          select: { id: true, name: true, project: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ order: 'asc' }, { priority: 'asc' }],
    })

    return Response.json(tasks)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const data = await req.json()

    const task = await prisma.task.create({
      data: {
        name: data.name,
        description: data.description,
        workstreamId: data.workstreamId,
        ownerId: data.ownerId || null,
        status: data.status || 'BACKLOG',
        priority: data.priority || 'MEDIUM',
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        effortHours: data.effortHours || 0,
        estimatedHours: data.estimatedHours || 0,
        tags: data.tags || [],
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        workstream: {
          include: { project: { select: { id: true, name: true } } },
        },
      },
    })

    if (task.ownerId && task.ownerId !== session.id) {
      await notifyTaskAssigned(
        task.id,
        task.ownerId,
        session.id,
        task.workstream.project.id
      ).catch(console.error)
    }

    return Response.json(task, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[TASKS POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
