import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const allocation = await prisma.resourceAllocation.upsert({
      where: { userId_projectId: { userId: data.userId, projectId: data.projectId } },
      update: {
        allocationPct: data.allocationPct,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
      create: {
        userId: data.userId,
        projectId: data.projectId,
        allocationPct: data.allocationPct,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
      },
      include: {
        user: { select: { id: true, name: true, capacityPct: true } },
        project: { select: { id: true, name: true } },
      },
    })
    // Notify the allocated user (if it's not the planner allocating themselves)
    if (data.userId !== session.id) {
      const project = await prisma.project.findUnique({
        where: { id: data.projectId },
        select: { name: true },
      })
      await prisma.notification.create({
        data: {
          userId: data.userId,
          senderId: session.id,
          type: 'TASK_ASSIGNED',
          title: 'Added to Project',
          message: `${session.name} added you to project "${project?.name}"`,
          actionUrl: `/projects/${data.projectId}`,
        },
      }).catch(() => {})
    }

    return Response.json(allocation, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { userId, projectId } = await req.json()
    await prisma.resourceAllocation.delete({
      where: { userId_projectId: { userId, projectId } },
    })
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
