import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const products = await prisma.product.findMany({
      where: { projectId: id },
      orderBy: { order: 'asc' },
      include: {
        lead: { select: { id: true, name: true, role: true } },
        resources: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    return Response.json(products)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    const project = await prisma.project.findUnique({ where: { id }, select: { leadId: true } })
    const canManage =
      ['ADMIN', 'PLANNER', 'MANAGER'].includes(session.role) ||
      project?.leadId === session.id
    if (!canManage) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const data = await req.json()
    const count = await prisma.product.count({ where: { projectId: id } })

    const resources: Array<{ userId: string; subsystems?: string[]; costingTypes?: string[] }> =
      Array.isArray(data.resources) ? data.resources.filter((r: { userId: string }) => r.userId) : []

    const product = await prisma.product.create({
      data: {
        projectId: id,
        brand: data.brand || '',
        modelNo: data.modelNo || '',
        leadId: data.leadId || null,
        resourceCount: data.resourceCount ? parseInt(String(data.resourceCount), 10) : null,
        order: count,
        resources: {
          create: resources.map((r) => ({
            userId: r.userId,
            subsystems: r.subsystems || [],
            costingTypes: r.costingTypes || [],
          })),
        },
      },
      include: {
        lead: { select: { id: true, name: true, role: true } },
        resources: { include: { user: { select: { id: true, name: true, role: true } } } },
      },
    })

    // Write history
    await prisma.productHistory.createMany({
      data: [
        {
          productId: product.id,
          action: 'PRODUCT_CREATED',
          changedById: session.id,
          data: { brand: product.brand, modelNo: product.modelNo },
        },
        ...product.resources.map((r) => ({
          productId: product.id,
          action: 'RESOURCE_ADDED',
          targetUserId: r.userId,
          changedById: session.id,
          data: {
            userName: r.user.name,
            subsystems: r.subsystems,
            costingTypes: r.costingTypes,
          },
        })),
        ...(product.lead && data.leadId
          ? [{
              productId: product.id,
              action: 'LEAD_ASSIGNED',
              changedById: session.id,
              data: { toId: product.lead.id, toName: product.lead.name },
            }]
          : []),
      ],
    })

    return Response.json(product, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PRODUCTS POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
