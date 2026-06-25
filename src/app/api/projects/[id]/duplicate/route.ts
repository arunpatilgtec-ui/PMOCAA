import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays } from '@/lib/date-utils'

type Ctx = { params: Promise<{ id: string }> }

const DW_BOB_OFFSET = 12
const DW_BOB_DURATION = 2

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, startDate } = await req.json()
    if (!name?.trim() || !startDate) {
      return Response.json({ error: 'name and startDate are required' }, { status: 400 })
    }

    // Fetch original project with everything needed
    const original = await prisma.project.findUnique({
      where: { id },
      include: {
        workstreams: { include: { tasks: true }, orderBy: { order: 'asc' } },
        products: {
          include: { resources: true },
          orderBy: { order: 'asc' },
        },
        allocations: true,
      },
    })
    if (!original) return Response.json({ error: 'Not found' }, { status: 404 })

    const origStart = original.startDate ? new Date(original.startDate) : null
    const newStart = new Date(startDate)
    const offsetMs = origStart ? newStart.getTime() - origStart.getTime() : 0

    function shiftDate(d: Date | null): Date | null {
      if (!d) return null
      return new Date(d.getTime() + offsetMs)
    }

    // Create the new project (reset status, keep all other metadata)
    const newProject = await prisma.project.create({
      data: {
        name: name.trim(),
        description: original.description,
        type: original.type,
        status: 'PLANNING',
        priority: original.priority,
        startDate: newStart,
        endDate: shiftDate(original.endDate) ?? newStart,
        leadId: original.leadId,
        plannerId: original.plannerId,
        editAccessGranted: original.editAccessGranted,
        planStatus: 'DRAFT',
        category: original.category,
        productType: original.productType,
        projectClassification: original.projectClassification,
        numberOfProducts: original.numberOfProducts,
      },
    })

    // Copy workstreams and tasks (skip auto-generated per-product tasks)
    const wsIdMap = new Map<string, string>() // oldWsId → newWsId
    for (const ws of original.workstreams) {
      const newWs = await prisma.workstream.create({
        data: {
          projectId: newProject.id,
          name: ws.name,
          order: ws.order,
          leadId: ws.leadId,
          status: 'NOT_STARTED',
        },
      })
      wsIdMap.set(ws.id, newWs.id)

      // Copy tasks — skip auto-generated per-product tasks, reset all progress
      const manualTasks = ws.tasks.filter(
        (t) => !t.description?.includes('__productTask:')
      )
      if (manualTasks.length > 0) {
        await prisma.task.createMany({
          data: manualTasks.map((t) => ({
            workstreamId: newWs.id,
            name: t.name,
            description: t.description,
            status: 'BACKLOG',
            priority: t.priority,
            startDate: shiftDate(t.startDate),
            endDate: shiftDate(t.endDate),
            estimatedHours: t.estimatedHours,
            effortHours: 0,
            pctComplete: 0,
            ownerId: t.ownerId,
            assignedById: t.assignedById,
            tags: t.tags,
            order: t.order,
          })),
        })
      }
    }

    // Copy products → new IDs, then regenerate per-product tasks
    const newProjectForTasks = { startDate: newStart, endDate: shiftDate(original.endDate) }

    // Find or create Costing and BOB workstreams (created above via workstream copy)
    const newCostingWs = await prisma.workstream.findFirst({
      where: { projectId: newProject.id, name: { in: ['Costing', 'Product Costing'] } },
    })
    const newBobWs = await prisma.workstream.findFirst({
      where: { projectId: newProject.id, name: 'BOB & A2Mac1' },
    })

    for (const product of original.products) {
      const newProduct = await prisma.product.create({
        data: {
          projectId: newProject.id,
          brand: product.brand,
          modelNo: product.modelNo,
          leadId: product.leadId,
          resourceCount: product.resourceCount,
          order: product.order,
        },
      })

      // Copy product resource assignments
      if (product.resources.length > 0) {
        await prisma.productResource.createMany({
          data: product.resources.map((r) => ({
            productId: newProduct.id,
            userId: r.userId,
            subsystems: r.subsystems,
            costingTypes: r.costingTypes,
          })),
        })
      }

      const productLabel = `${product.brand}${product.modelNo ? ` ${product.modelNo}` : ''}`

      // Regenerate BOB & A2Mac1 tasks
      if (newBobWs) {
        const bobStart = newProjectForTasks.startDate
          ? addWorkingDays(new Date(newProjectForTasks.startDate), DW_BOB_OFFSET)
          : null
        const bobEnd = newProjectForTasks.startDate
          ? addWorkingDays(new Date(newProjectForTasks.startDate), DW_BOB_OFFSET + DW_BOB_DURATION - 1)
          : null
        const productLead = product.leadId ?? null
        await prisma.task.createMany({
          data: [
            {
              workstreamId: newBobWs.id,
              name: `${productLabel} — A2Mac1`,
              description: `__productTask:${newProduct.id}:a2mac1__`,
              ownerId: productLead,
              startDate: bobStart,
              endDate: bobEnd,
              estimatedHours: 16,
              effortHours: 0,
            },
            {
              workstreamId: newBobWs.id,
              name: `${productLabel} — BOB`,
              description: `__productTask:${newProduct.id}:bob__`,
              ownerId: productLead,
              startDate: bobStart,
              endDate: bobEnd,
              estimatedHours: 16,
              effortHours: 0,
            },
          ],
        })
      }

      // Regenerate costing tasks (one per user × costingType)
      if (newCostingWs) {
        const costingRows = product.resources.flatMap((r) =>
          r.costingTypes.map((ct) => ({
            workstreamId: newCostingWs.id,
            name: `${productLabel} — ${ct}`,
            description: `__productTask:${newProduct.id}:costing:${ct}__`,
            ownerId: r.userId,
            startDate: newProjectForTasks.startDate,
            endDate: newProjectForTasks.endDate,
            estimatedHours: 8,
            effortHours: 0,
          }))
        )
        if (costingRows.length > 0) {
          await prisma.task.createMany({ data: costingRows })
        }
      }
    }

    // Copy resource allocations (shift dates)
    if (original.allocations.length > 0) {
      await prisma.resourceAllocation.createMany({
        data: original.allocations.map((a) => ({
          projectId: newProject.id,
          userId: a.userId,
          allocationPct: a.allocationPct,
          startDate: shiftDate(a.startDate) ?? newStart,
          endDate: shiftDate(a.endDate) ?? (shiftDate(original.endDate) ?? newStart),
        })),
      })
    }

    // Return new project with products for the rename dialog
    const result = await prisma.project.findUnique({
      where: { id: newProject.id },
      include: {
        products: { orderBy: { order: 'asc' } },
      },
    })

    return Response.json(result, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PROJECT DUPLICATE]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
