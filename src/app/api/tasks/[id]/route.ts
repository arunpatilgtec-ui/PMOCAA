import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyTaskAssigned } from '@/lib/notifications'

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/tasks/[id]'>) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true, email: true } },
        workstream: { include: { project: true, lead: { select: { id: true, name: true } } } },
        documents: { include: { uploader: { select: { id: true, name: true } } } },
      },
    })
    if (!task) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(task)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/tasks/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    const data = await req.json()

    const existing = await prisma.task.findUniqueOrThrow({ where: { id } })
    const ownerChanged = data.ownerId && data.ownerId !== existing.ownerId

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.startDate !== undefined && {
          startDate: data.startDate ? new Date(data.startDate) : null,
        }),
        ...(data.endDate !== undefined && {
          endDate: data.endDate ? new Date(data.endDate) : null,
        }),
        ...(data.effortHours !== undefined && { effortHours: data.effortHours }),
        ...(data.estimatedHours !== undefined && { estimatedHours: data.estimatedHours }),
        ...(data.ownerId !== undefined && { ownerId: data.ownerId }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
      include: {
        owner: { select: { id: true, name: true, avatarUrl: true } },
        workstream: { include: { project: { select: { id: true, name: true } } } },
      },
    })

    if (ownerChanged && task.ownerId && task.ownerId !== session.id) {
      await notifyTaskAssigned(
        task.id,
        task.ownerId,
        session.id,
        task.workstream.project.id
      ).catch(console.error)
    }

    return Response.json(task)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/tasks/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    if (!['ADMIN', 'MANAGER', 'PLANNER', 'WORKSTREAM_LEAD'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.task.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
