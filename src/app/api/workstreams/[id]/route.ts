import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/workstreams/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    const data = await req.json()

    const workstream = await prisma.workstream.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.leadId !== undefined && { leadId: data.leadId }),
        ...(data.order !== undefined && { order: data.order }),
      },
    })
    return Response.json(workstream)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/workstreams/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.workstream.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
