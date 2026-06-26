import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { addWorkingDays } from '@/lib/date-utils'
import { CATEGORY_TEMPLATES } from '@/lib/project-templates'

type Ctx = { params: Promise<{ id: string }> }

// Generates per-product teardown tasks for any existing products that don't have them.
// Safe to call repeatedly — skips products that already have per-product teardown tasks.
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
          where: { name: 'Tear Down' },
          include: { tasks: { select: { id: true, description: true } } },
        },
      },
    })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
    if (!project.products.length) return Response.json({ migrated: 0 })

    const template = project.category ? CATEGORY_TEMPLATES[project.category] : undefined
    const tdTaskTemplates = template?.find((ws) => ws.name === 'Tear Down')?.tasks ?? []
    if (!tdTaskTemplates.length) return Response.json({ migrated: 0 })

    // Teardown window: working days 3–7 after project start (after 2 planning days)
    const tdStart = project.startDate ? addWorkingDays(new Date(project.startDate), 2) : null
    const tdEnd = project.startDate ? addWorkingDays(new Date(project.startDate), 6) : null

    let tearDownWs = project.workstreams[0] ?? null
    let migrated = 0

    for (const product of project.products) {
      // Skip if this product already has per-product teardown tasks
      const alreadyMigrated = tearDownWs?.tasks.some((t) =>
        t.description?.includes(`__productTask:${product.id}:teardown`)
      )
      if (alreadyMigrated) continue

      // Create the workstream if it doesn't exist yet
      if (!tearDownWs) {
        const order = await prisma.workstream.count({ where: { projectId: id } })
        tearDownWs = await prisma.workstream.create({
          data: { projectId: id, name: 'Tear Down', order },
          include: { tasks: { select: { id: true, description: true } } },
        }) as typeof tearDownWs
      }

      const productLabel = `${product.brand}${product.modelNo ? ` ${product.modelNo}` : ''}`
      await prisma.task.createMany({
        data: tdTaskTemplates.map((task) => ({
          workstreamId: tearDownWs!.id,
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

    return Response.json({ migrated })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[SYNC-PRODUCT-TEARDOWN]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
