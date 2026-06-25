import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    const data = await req.json()

    const existing = await prisma.strategicRequest.findUnique({ where: { id }, select: { submitterId: true } })
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

    const canEdit = existing.submitterId === session.id || ['ADMIN', 'PLANNER'].includes(session.role)
    if (!canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const sr = await prisma.strategicRequest.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description || null }),
        ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
        ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: {
        submitter: { select: { id: true, name: true } },
        tasks: { include: { assignee: { select: { id: true, name: true } } } },
      },
    })
    return Response.json(sr)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    const existing = await prisma.strategicRequest.findUnique({ where: { id }, select: { submitterId: true } })
    if (!existing) return Response.json({ error: 'Not found' }, { status: 404 })

    const canDelete = existing.submitterId === session.id || ['ADMIN', 'PLANNER'].includes(session.role)
    if (!canDelete) return Response.json({ error: 'Forbidden' }, { status: 403 })

    await prisma.strategicRequest.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
