import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string; productId: string }> }

async function canManageProduct(session: { id: string; role: string }, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { leadId: true } })
  return (
    ['ADMIN', 'PLANNER', 'MANAGER'].includes(session.role) ||
    project?.leadId === session.id
  )
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id, productId } = await ctx.params
    if (!(await canManageProduct(session, id))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()

    if (data.resources !== undefined) {
      await prisma.productResource.deleteMany({ where: { productId } })
      if (Array.isArray(data.resources) && data.resources.length > 0) {
        await prisma.productResource.createMany({
          data: data.resources.map((r: { userId: string; subsystems?: string[]; costingTypes?: string[] }) => ({
            productId,
            userId: r.userId,
            subsystems: r.subsystems || [],
            costingTypes: r.costingTypes || [],
          })),
        })
      }
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(data.brand !== undefined && { brand: data.brand }),
        ...(data.modelNo !== undefined && { modelNo: data.modelNo }),
        ...(data.leadId !== undefined && { leadId: data.leadId || null }),
        ...(data.order !== undefined && { order: data.order }),
      },
      include: {
        lead: { select: { id: true, name: true, role: true } },
        resources: { include: { user: { select: { id: true, name: true, role: true } } } },
      },
    })
    return Response.json(product)
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
    const { id, productId } = await ctx.params
    if (!(await canManageProduct(session, id))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    await prisma.product.delete({ where: { id: productId } })
    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
