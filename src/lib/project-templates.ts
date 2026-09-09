import { prisma } from '@/lib/prisma'
import { templateScheduleDays } from '@/lib/date-utils'

export interface TaskTemplate {
  name: string
  durationDays: number
  estimatedHours: number
  parallelGroup: string | null
}

export interface WorkstreamTemplate {
  name: string
  tasks: TaskTemplate[]
}

// Server-side, database-backed replacements for what used to be hardcoded
// constants. Values are edited via the admin "Templates" settings page
// (src/app/(app)/settings/templates) and stored in the TemplateCategory /
// TemplateWorkstream / TemplateTask / TemplateModelType / TemplateSubsystem /
// TemplateCostingType tables.

export async function getAllCategories(): Promise<string[]> {
  const rows = await prisma.templateCategory.findMany({
    where: { isActive: true },
    orderBy: { order: 'asc' },
    select: { name: true },
  })
  return rows.map((r) => r.name)
}

export async function getCategoryTemplate(category: string | null | undefined, productType?: string | null): Promise<WorkstreamTemplate[] | undefined> {
  if (!category) return undefined
  const workstreams = await prisma.templateWorkstream.findMany({
    where: {
      category: { name: category },
      ...(productType
        ? { OR: [{ modelTypeId: null }, { modelType: { code: productType } }] }
        : { modelTypeId: null }),
    },
    orderBy: { order: 'asc' },
    include: { tasks: { orderBy: { order: 'asc' } } },
  })
  if (workstreams.length === 0) return undefined
  return workstreams.map((ws) => ({
    name: ws.name,
    tasks: ws.tasks.map((t) => ({
      name: t.name, durationDays: t.durationDays, estimatedHours: t.estimatedHours, parallelGroup: t.parallelGroup,
    })),
  }))
}

export async function getCategoryTypes(category: string | null | undefined): Promise<string[]> {
  if (!category) return []
  const rows = await prisma.templateModelType.findMany({
    where: { category: { name: category } },
    orderBy: { order: 'asc' },
    select: { code: true },
  })
  return rows.map((r) => r.code)
}

export async function getCategoryTypeLabels(category: string | null | undefined): Promise<Record<string, string>> {
  if (!category) return {}
  const rows = await prisma.templateModelType.findMany({
    where: { category: { name: category } },
    select: { code: true, label: true },
  })
  return Object.fromEntries(rows.map((r) => [r.code, r.label]))
}

export async function getSubsystems(category: string | null | undefined): Promise<string[]> {
  if (!category) return []
  const rows = await prisma.templateSubsystem.findMany({
    where: { category: { name: category } },
    orderBy: { order: 'asc' },
    select: { name: true },
  })
  return rows.map((r) => r.name)
}

export async function getCostingTypes(): Promise<Array<{ code: string; label: string }>> {
  const rows = await prisma.templateCostingType.findMany({
    orderBy: { order: 'asc' },
    select: { code: true, label: true },
  })
  return rows
}

// Total working days for a category template, accounting for tasks sharing
// a parallelGroup (they overlap rather than stack in series).
export async function getTemplateTotalDays(category: string | null | undefined, productType?: string | null): Promise<number> {
  const ws = await getCategoryTemplate(category, productType)
  if (!ws) return 0
  return templateScheduleDays(ws.flatMap((w) => w.tasks))
}
