/**
 * One-time backfill: copies the current hardcoded category/template/subsystem/
 * costing-type data (from src/lib/project-templates.ts and the old
 * SUBSYSTEMS_BY_CATEGORY/COSTING_TYPES constants in products-panel.tsx) into
 * the new database-backed TemplateCategory/TemplateWorkstream/TemplateTask/
 * TemplateSubsystem/TemplateCostingType tables, so the admin config screen
 * starts out identical to what the app already does today.
 *
 * Safe to re-run: uses upsert, so it won't duplicate rows.
 *
 * Usage:
 *   npx tsx prisma/seed-templates.ts
 */
import { PrismaClient } from '../src/generated/prisma'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

function t(name: string, durationDays: number) {
  return { name, durationDays, estimatedHours: durationDays * 8 }
}

const REFRIGERATION_DELIVERABLES = [
  t('Report', 17), t('Excel CG Files', 1), t('BOB Preparation', 1), t('BOB Verification', 2),
  t('Product Overview', 1), t('Best of Best Slide', 1), t('Subsystem Deep Dive', 2),
  t('Foam Thickness', 1), t('Stakeholder Asks', 3), t('FMOT', 1), t('Re-used parts', 1),
  t('Supply Chain Footprint', 2), t('Category - Sub-system', 1),
  t("Cost element - Material, Process, Margin, etc'", 1), t('Market Placement', 1),
  t('Project results summary', 1), t('SME Review', 1), t('Internal Review', 1),
  t('Report Out', 1), t('Feedback Form', 1), t('Project Close Signoff', 1),
]

const SIMPLE_DELIVERABLES = [
  t('Report', 17), t('Excel CG Files', 1), t('BOB Preparation', 1), t('BOB Verification', 1),
  t('Project results summary', 1), t('Market Placement', 1), t('Category - Sub-system', 1),
  t("Cost element - Material, Process, Margin, etc'", 1), t('Product Overview', 1),
  t('Best of Best', 1), t('Technology Analysis', 1), t('Supply Chain Footprint', 1),
  t('Re-used parts', 1), t('FMOT', 1), t('MVT', 1), t('GAME', 1),
  t('Project Close Signoff', 1), t('SME Review', 1), t('Internal Review', 1),
  t('Report Out', 1), t('Feedback Form', 1),
]

const REFRIGERATION_TEMPLATE = [
  { name: 'Planning', tasks: [t('Project Kickoff', 1), t('Collect Deliverables', 4)] },
  {
    name: 'Tear Down',
    tasks: [
      t('Packaging', 1), t('Literature & Labels', 1), t('Interior Features', 2),
      t('Exterior Features', 2), t('Freezer Door', 2), t('Refrigerator Door', 2),
      t('Ice And Water', 2), t('Cabinet', 4), t('Cooling System', 4),
      t('Control System', 1), t('Pre-Costing', 1), t('Labeling', 1), t('Bulk Load', 1),
    ],
  },
  {
    name: 'Costing',
    tasks: [
      t('Cabinet', 1), t('Freezer Door', 1), t('Refrigerator Door', 1),
      t('Exterior Features', 1), t('Interior Features', 2), t('Packaging', 1),
      t('Literature & Labels', 1), t('Ice And Water', 1), t('Cooling System', 2),
      t('Control System', 3), t('PCB', 2), t('Harness', 2),
    ],
  },
  { name: 'Deliverables', tasks: REFRIGERATION_DELIVERABLES },
]

const DISHWASHER_TEMPLATE = [
  { name: 'Planning', tasks: [t('Project Kickoff', 1), t('Collect Deliverables', 1)] },
  {
    name: 'Tear Down',
    tasks: [
      t('Packaging & Lit.', 0.5), t('Racks', 0.5), t('Water Delivery System', 1),
      t('Door & Aesthetics, Dry System', 0.5), t('Control System', 0.5),
      t('Wash System', 1), t('Tub & Chassis System', 1),
    ],
  },
  {
    name: 'Costing',
    tasks: [
      t('Packaging', 0.5), t('Racks', 0.5), t('Water Delivery System', 1),
      t('Door & Aesthetics', 0.5), t('Control System', 0.5), t('Wash System', 1),
      t('Tub & Chassis System', 1), t('PCB', 1), t('Harness', 1),
    ],
  },
  { name: 'BOB & A2Mac1', tasks: [t('BOB & A2Mac1', 2)] },
  { name: 'Reports & Report-out', tasks: [t('Reports & Report-out', 5)] },
]

function simpleTemplate(tearDownTasks: string[]) {
  return [
    { name: 'Planning', tasks: [t('Project Kickoff', 1), t('Collect Deliverables', 1)] },
    { name: 'Tear Down', tasks: tearDownTasks.map((name) => t(name, 1)) },
    { name: 'Costing', tasks: tearDownTasks.map((name) => t(name, 1)) },
    { name: 'Deliverables', tasks: SIMPLE_DELIVERABLES },
  ]
}

const CATEGORY_TEMPLATES: Record<string, { name: string; tasks: { name: string; durationDays: number; estimatedHours: number }[] }[]> = {
  Refrigeration: REFRIGERATION_TEMPLATE,
  Dishwasher: DISHWASHER_TEMPLATE,
  Cooking: simpleTemplate(['Documentation', 'Chassis', 'Cooktop', 'Accessories', 'Cavity', 'Controls', 'Drawer', 'UI Console', 'Door']),
  Laundry: simpleTemplate(['Aesthetics', 'Structures', 'Performance Enablers', 'SES']),
  KASA: simpleTemplate(['Packaging', 'Steam & Milk Frother Asm', 'Aesthetics & Cabinet', 'Brewing System', 'Grinding System', 'Heating System', 'Filling & Distribution System', 'Controls']),
  'Food Disposer': simpleTemplate(['Packaging and Literature', 'Accessories', 'Aesthetic', 'Structure', 'Water and heating', 'Control']),
}

const CATEGORY_TYPES: Record<string, string[]> = {
  Refrigeration: ['BM', 'TM', 'IM', 'FD', 'SD', 'CF', 'UF', 'SS', 'AC', 'Other'],
  Cooking: ['WO', 'MB', 'CT', 'MW', 'FS', 'HD', 'Other'],
  Laundry: ['VA', 'HA', 'DR', 'CL', 'Other'],
  Dishwasher: ['DW', 'Other'],
  KASA: ['KASA', 'Other'],
  'Food Disposer': ['Food Disposer', 'Other'],
}

const CATEGORY_TYPE_LABELS: Record<string, Record<string, string>> = {
  Refrigeration: {
    BM: 'BM - Bottom Mount', TM: 'TM - Top Mount', IM: 'IM - Inline Mount', FD: 'FD - French Door',
    SD: 'SD - Side by Side', CF: 'CF - Counter Frequency', UF: 'UF - Under Counter/Freezer',
    SS: 'SS - Side by Side', AC: 'AC - French Door 4-Door', Other: 'Other',
  },
  Cooking: {
    WO: 'WO - Wall Oven', MB: 'MB - Built-in MWO', CT: 'CT - Countertop MWO',
    MW: 'MW - MWO Hood Combo', FS: 'FS - Free Standing', HD: 'HD - Hood', Other: 'Other',
  },
  Laundry: { VA: 'VA', HA: 'HA', DR: 'DR', CL: 'CL', Other: 'Other' },
  Dishwasher: { DW: 'DW - Dishwasher', Other: 'Other' },
  KASA: { KASA: 'KASA', Other: 'Other' },
  'Food Disposer': { 'Food Disposer': 'Food Disposer', Other: 'Other' },
}

// 'Other' has no template, no model types, just needs to exist as a selectable category.
const ALL_CATEGORIES = ['Refrigeration', 'Cooking', 'Dishwasher', 'Laundry', 'KASA', 'Food Disposer', 'Other']

const SUBSYSTEMS_BY_CATEGORY: Record<string, string[]> = {
  Refrigeration: ['Cabinet', 'Compressor', 'Evaporator', 'Condenser', 'Liner', 'Door', 'Harness', 'PCB', 'Foam', 'Thermoformed Parts', 'Motors', 'Lighting'],
  Cooking: ['Chassis', 'Cooktop', 'Accessories', 'Cavity', 'Controls', 'Drawer', 'UI Console', 'Door'],
  Dishwasher: ['Packaging & Lit.', 'Racks', 'Water Delivery', 'Door & Aesthetics', 'Control System', 'Wash System', 'Tub & Chassis'],
  Laundry: ['Aesthetics', 'Structures', 'Performance Enablers', 'SES'],
  KASA: ['Packaging', 'Steam & Milk Frother Asm', 'Aesthetics & Cabinet', 'Brewing System', 'Grinding System', 'Heating System', 'Filling & Distribution System', 'Controls'],
  'Food Disposer': ['Accessories', 'Aesthetic', 'Structure', 'Water & Heating', 'Control'],
}

const COSTING_TYPES: Array<{ code: string; label: string }> = [
  { code: 'MECHANICAL', label: 'Mechanical' },
  { code: 'HARNESS', label: 'Harness' },
  { code: 'PCB', label: 'PCB' },
]

const PROJECT_TYPES = ['DTV', 'NPI', 'Architecture', 'Cost Improvement', 'Cost Avoidance', 'Teardown']

async function main() {
  for (let ci = 0; ci < ALL_CATEGORIES.length; ci++) {
    const name = ALL_CATEGORIES[ci]
    const category = await prisma.templateCategory.upsert({
      where: { name },
      update: {},
      create: { name, order: ci },
    })
    console.log(`Category: ${name}`)

    const types = CATEGORY_TYPES[name] ?? []
    const labels = CATEGORY_TYPE_LABELS[name] ?? {}
    for (let ti = 0; ti < types.length; ti++) {
      const code = types[ti]
      await prisma.templateModelType.upsert({
        where: { categoryId_code: { categoryId: category.id, code } },
        update: { label: labels[code] || code, order: ti },
        create: { categoryId: category.id, code, label: labels[code] || code, order: ti },
      })
    }

    const subsystems = SUBSYSTEMS_BY_CATEGORY[name] ?? []
    for (let si = 0; si < subsystems.length; si++) {
      const sname = subsystems[si]
      await prisma.templateSubsystem.upsert({
        where: { categoryId_name: { categoryId: category.id, name: sname } },
        update: { order: si },
        create: { categoryId: category.id, name: sname, order: si },
      })
    }

    const workstreams = CATEGORY_TEMPLATES[name] ?? []
    for (let wi = 0; wi < workstreams.length; wi++) {
      const w = workstreams[wi]
      const existingWs = await prisma.templateWorkstream.findFirst({
        where: { categoryId: category.id, name: w.name },
      })
      const ws = existingWs
        ? await prisma.templateWorkstream.update({ where: { id: existingWs.id }, data: { order: wi } })
        : await prisma.templateWorkstream.create({ data: { categoryId: category.id, name: w.name, order: wi } })

      const existingTaskCount = await prisma.templateTask.count({ where: { workstreamId: ws.id } })
      if (existingTaskCount === 0) {
        await prisma.templateTask.createMany({
          data: w.tasks.map((task, ti) => ({
            workstreamId: ws.id,
            name: task.name,
            durationDays: task.durationDays,
            estimatedHours: task.estimatedHours,
            order: ti,
          })),
        })
      }
    }
  }

  for (let i = 0; i < COSTING_TYPES.length; i++) {
    const c = COSTING_TYPES[i]
    await prisma.templateCostingType.upsert({
      where: { code: c.code },
      update: { label: c.label, order: i },
      create: { code: c.code, label: c.label, order: i },
    })
  }

  for (let i = 0; i < PROJECT_TYPES.length; i++) {
    const name = PROJECT_TYPES[i]
    await prisma.templateProjectType.upsert({
      where: { name },
      update: { order: i },
      create: { name, order: i },
    })
  }

  await prisma.dashboardBanner.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', title: '2026 CAA Project Plan', imagePath: '/caa-project-plan-2026.png' },
  })

  console.log('\nDone backfilling template config tables.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
