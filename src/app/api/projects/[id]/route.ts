import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]'>) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, avatarUrl: true, email: true } },
        planner: { select: { id: true, name: true, avatarUrl: true, email: true } },
        workstreams: {
          orderBy: { order: 'asc' },
          include: {
            lead: { select: { id: true, name: true } },
            tasks: {
              orderBy: { order: 'asc' },
              include: { owner: { select: { id: true, name: true, avatarUrl: true } } },
            },
          },
        },
        milestones: { orderBy: { dueDate: 'asc' } },
        allocations: {
          include: { user: { select: { id: true, name: true, avatarUrl: true, role: true } } },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
          include: { uploader: { select: { id: true, name: true } } },
        },
        scheduleChanges: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          include: { requester: { select: { id: true, name: true } } },
        },
      },
    })

    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(project)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PROJECT GET]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/projects/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: new Date(data.endDate) }),
        ...(data.leadId !== undefined && { leadId: data.leadId }),
        ...(data.plannerId !== undefined && { plannerId: data.plannerId }),
      },
    })
    return Response.json(project)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    if (!['ADMIN', 'MANAGER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.project.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
