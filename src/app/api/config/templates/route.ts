import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

// Read-only, authenticated-user-facing view of the admin-editable template
// configuration (project categories, model types, workstream/task templates,
// subsystems, costing types). Any signed-in user can read this — it's the
// same data that used to be hardcoded in src/lib/project-templates.ts and
// src/components/projects/products-panel.tsx. Editing happens through the
// ADMIN-only /api/admin/template-config/* routes.
export async function GET() {
  try {
    await requireAuth()

    const categories = await prisma.templateCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        modelTypes: { orderBy: { order: 'asc' } },
        workstreams: {
          orderBy: { order: 'asc' },
          include: { tasks: { orderBy: { order: 'asc' } } },
        },
      },
    })

    const costingTypes = await prisma.templateCostingType.findMany({
      orderBy: { order: 'asc' },
    })

    const projectTypes = await prisma.templateProjectType.findMany({
      orderBy: { order: 'asc' },
    })

    return Response.json({
      // Subsystems shown in the Products tab (see useTemplateConfig.getSubsystems)
      // are derived client-side from each category's Tear Down workstream task
      // names, scoped per model type -- that's what actually generates the
      // per-product teardown/costing tasks shown in Timeline/Gantt, so the two
      // can never drift apart, and a product never sees another model type's
      // subsystems mixed in.
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        modelTypes: c.modelTypes.map((m) => ({ id: m.id, code: m.code, label: m.label })),
        workstreams: c.workstreams.map((w) => ({
          id: w.id,
          name: w.name,
          modelTypeId: w.modelTypeId,
          tasks: w.tasks.map((t) => ({
            id: t.id, name: t.name, durationDays: t.durationDays, estimatedHours: t.estimatedHours,
            parallelGroup: t.parallelGroup,
          })),
        })),
      })),
      costingTypes: costingTypes.map((c) => ({ id: c.id, code: c.code, label: c.label })),
      projectTypes: projectTypes.map((p) => ({ id: p.id, name: p.name })),
    })
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
