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

    // Fetch current state for diffing
    const current = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        lead: { select: { id: true, name: true } },
        resources: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    })
    if (!current) return Response.json({ error: 'Not found' }, { status: 404 })

    const historyEntries: Array<{
      productId: string
      action: string
      targetUserId?: string
      changedById: string
      data: Record<string, string | string[] | null>
    }> = []

    // Diff resources
    if (data.resources !== undefined) {
      const oldMap = new Map(current.resources.map((r) => [r.userId, r]))
      const newResources: Array<{ userId: string; subsystems?: string[]; costingTypes?: string[] }> =
        Array.isArray(data.resources) ? data.resources.filter((r: { userId: string }) => r.userId) : []
      const newMap = new Map(newResources.map((r) => [r.userId, r]))

      // Removed
      for (const old of current.resources) {
        if (!newMap.has(old.userId)) {
          historyEntries.push({
            productId,
            action: 'RESOURCE_REMOVED',
            targetUserId: old.userId,
            changedById: session.id,
            data: { userName: old.user.name, subsystems: old.subsystems, costingTypes: old.costingTypes },
          })
        }
      }

      // Added
      for (const nr of newResources) {
        if (!oldMap.has(nr.userId)) {
          const u = await prisma.user.findUnique({ where: { id: nr.userId }, select: { name: true } })
          historyEntries.push({
            productId,
            action: 'RESOURCE_ADDED',
            targetUserId: nr.userId,
            changedById: session.id,
            data: {
              userName: u?.name ?? nr.userId,
              subsystems: nr.subsystems ?? [],
              costingTypes: nr.costingTypes ?? [],
            },
          })
        } else {
          // Changed subsystems or costing
          const old = oldMap.get(nr.userId)!
          const oldSubs = [...old.subsystems].sort().join(',')
          const newSubs = [...(nr.subsystems ?? [])].sort().join(',')
          if (oldSubs !== newSubs) {
            historyEntries.push({
              productId,
              action: 'SUBSYSTEMS_CHANGED',
              targetUserId: nr.userId,
              changedById: session.id,
              data: { userName: old.user.name, from: old.subsystems, to: nr.subsystems ?? [] },
            })
          }
          const oldCts = [...old.costingTypes].sort().join(',')
          const newCts = [...(nr.costingTypes ?? [])].sort().join(',')
          if (oldCts !== newCts) {
            historyEntries.push({
              productId,
              action: 'COSTING_CHANGED',
              targetUserId: nr.userId,
              changedById: session.id,
              data: { userName: old.user.name, from: old.costingTypes, to: nr.costingTypes ?? [] },
            })
          }
        }
      }

      await prisma.productResource.deleteMany({ where: { productId } })
      if (newResources.length > 0) {
        await prisma.productResource.createMany({
          data: newResources.map((r) => ({
            productId,
            userId: r.userId,
            subsystems: r.subsystems || [],
            costingTypes: r.costingTypes || [],
          })),
        })
      }
    }

    // Diff lead
    if (data.leadId !== undefined) {
      const oldLeadId = current.leadId ?? null
      const newLeadId = data.leadId || null
      if (oldLeadId !== newLeadId) {
        let toName: string | null = null
        if (newLeadId) {
          const u = await prisma.user.findUnique({ where: { id: newLeadId }, select: { name: true } })
          toName = u?.name ?? null
        }
        historyEntries.push({
          productId,
          action: 'LEAD_CHANGED',
          changedById: session.id,
          data: {
            fromId: oldLeadId,
            fromName: current.lead?.name ?? null,
            toId: newLeadId,
            toName,
          },
        })
      }
    }

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(data.brand !== undefined && { brand: data.brand }),
        ...(data.modelNo !== undefined && { modelNo: data.modelNo }),
        ...(data.leadId !== undefined && { leadId: data.leadId || null }),
        ...(data.resourceCount !== undefined && {
          resourceCount: data.resourceCount ? parseInt(String(data.resourceCount), 10) : null,
        }),
        ...(data.order !== undefined && { order: data.order }),
      },
      include: {
        lead: { select: { id: true, name: true, role: true } },
        resources: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (historyEntries.length > 0) {
      await prisma.productHistory.createMany({ data: historyEntries })
    }

    return Response.json(product)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PRODUCT PATCH]', err)
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
