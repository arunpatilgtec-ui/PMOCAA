import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays } from '@/lib/date-utils'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'

type Ctx = { params: Promise<{ id: string }> }

// Generates per-product teardown AND costing tasks for existing products that don't have them.
// Safe to call repeatedly — skips products that already have per-product tasks.
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        category: true,
        startDate: true,
        products: {
          select: { id: true, brand: true, modelNo: true, leadId: true },
          orderBy: { order: 'asc' },
        },
        workstreams: {
          where: { name: { in: ['Tear Down', 'Costing'] } },
          include: { tasks: { select: { id: true, description: true } } },
        },
      },
    })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!project.products.length) return Response.json({ migrated: 0 })

    const template = project.category ? CATEGORY_TEMPLATES[project.category] : undefined
    if (!template) return Response.json({ migrated: 0 })

    const tdTaskTemplates = template.find((ws) => ws.name === 'Tear Down')?.tasks ?? []
    const costTaskTemplates = template.find((ws) => ws.name === 'Costing')?.tasks ?? []

    // Date windows relative to project start
    // Teardown: working days 3–7 (after 2 planning days)
    const tdStart = project.startDate ? addWorkingDays(new Date(project.startDate), 2) : null
    const tdEnd = project.startDate ? addWorkingDays(new Date(project.startDate), 6) : null
    // Costing: working days 8–12 (after teardown)
    const costStart = project.startDate ? addWorkingDays(new Date(project.startDate), 7) : null
    const costEnd = project.startDate ? addWorkingDays(new Date(project.startDate), 11) : null

    let tdWs = project.workstreams.find((w) => w.name === 'Tear Down') ?? null
    let costWs = project.workstreams.find((w) => w.name === 'Costing') ?? null
    let migrated = 0

    for (const product of project.products) {
      const productLabel = `${product.brand}${product.modelNo ? ` ${product.modelNo}` : ''}`
      const hasTd = tdWs?.tasks.some((t) => t.description?.includes(`__productTask:${product.id}:teardown`))
      const hasCost = costWs?.tasks.some((t) => t.description?.includes(`__productTask:${product.id}:costing`))

      // Migrate Tear Down
      if (!hasTd && tdTaskTemplates.length > 0) {
        if (!tdWs) {
          const order = await prisma.workstream.count({ where: { projectId: id } })
          const created = await prisma.workstream.create({
            data: { projectId: id, name: 'Tear Down', order },
            include: { tasks: { select: { id: true, description: true } } },
          })
          tdWs = created
        }
        await prisma.task.createMany({
          data: tdTaskTemplates.map((task) => ({
            workstreamId: tdWs!.id,
            name: `${productLabel} — ${task.name}`,
            description: `__productTask:${product.id}:teardown__`,
            ownerId: product.leadId ?? null,
            startDate: tdStart,
            endDate: tdEnd,
            estimatedHours: task.estimatedHours,
            effortHours: 0,
          })),
        })
        migrated++
      }

      // Migrate Costing (template sub-system tasks only — user×costingType tasks are managed separately)
      if (!hasCost && costTaskTemplates.length > 0) {
        if (!costWs) {
          const order = await prisma.workstream.count({ where: { projectId: id } })
          const created = await prisma.workstream.create({
            data: { projectId: id, name: 'Costing', order },
            include: { tasks: { select: { id: true, description: true } } },
          })
          costWs = created
        }
        await prisma.task.createMany({
          data: costTaskTemplates.map((task) => ({
            workstreamId: costWs!.id,
            name: `${productLabel} — ${task.name}`,
            description: `__productTask:${product.id}:costing__`,
            ownerId: product.leadId ?? null,
            startDate: costStart,
            endDate: costEnd,
            estimatedHours: task.estimatedHours,
            effortHours: 0,
          })),
        })
        migrated++
      }
    }

    return Response.json({ migrated })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[SYNC-PRODUCT-TEARDOWN]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
