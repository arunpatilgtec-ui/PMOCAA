export interface TaskTemplate {
  name: string
  durationDays: number
  estimatedHours: number
}

export interface WorkstreamTemplate {
  name: string
  tasks: TaskTemplate[]
}

export interface CategoryTemplate {
  category: string
  workstreams: WorkstreamTemplate[]
}

// Helper to build a task with durationDays and hours = durationDays * 8
function t(name: string, durationDays: number): TaskTemplate {
  return { name, durationDays, estimatedHours: durationDays * 8 }
}

// Report deliverables for Refrigeration (project-level checklist, no scheduling)
const REFRIGERATION_DELIVERABLES: TaskTemplate[] = [
  t('Report', 17),
  t('Excel CG Files', 1),
  t('BOB Preparation', 1),
  t('BOB Verification', 2),
  t('Product Overview', 1),
  t('Best of Best Slide', 1),
  t('Subsystem Deep Dive', 2),
  t('Foam Thickness', 1),
  t('Stakeholder Asks', 3),
  t('FMOT', 1),
  t('Re-used parts', 1),
  t('Supply Chain Footprint', 2),
  t('Category - Sub-system', 1),
  t("Cost element - Material, Process, Margin, etc'", 1),
  t('Market Placement', 1),
  t('Project results summary', 1),
  t('SME Review', 1),
  t('Internal Review', 1),
  t('Report Out', 1),
  t('Feedback Form', 1),
  t('Project Close Signoff', 1),
]

// Report deliverables for other categories (project-level checklist, no scheduling)
const SIMPLE_DELIVERABLES: TaskTemplate[] = [
  t('Report', 17),
  t('Excel CG Files', 1),
  t('BOB Preparation', 1),
  t('BOB Verification', 1),
  t('Project results summary', 1),
  t('Market Placement', 1),
  t('Category - Sub-system', 1),
  t("Cost element - Material, Process, Margin, etc'", 1),
  t('Product Overview', 1),
  t('Best of Best', 1),
  t('Technology Analysis', 1),
  t('Supply Chain Footprint', 1),
  t('Re-used parts', 1),
  t('FMOT', 1),
  t('MVT', 1),
  t('GAME', 1),
  t('Project Close Signoff', 1),
  t('SME Review', 1),
  t('Internal Review', 1),
  t('Report Out', 1),
  t('Feedback Form', 1),
]

// Full Refrigeration template (from Template-Ref sheet, sequential)
const REFRIGERATION_TEMPLATE: WorkstreamTemplate[] = [
  {
    name: 'Planning',
    tasks: [
      t('Project Kickoff', 1),
      t('Collect Deliverables', 4),
    ],
  },
  {
    name: 'Tear Down',
    tasks: [
      t('Packaging', 1),
      t('Literature & Labels', 1),
      t('Interior Features', 2),
      t('Exterior Features', 2),
      t('Freezer Door', 2),
      t('Refrigerator Door', 2),
      t('Ice And Water', 2),
      t('Cabinet', 4),
      t('Cooling System', 4),
      t('Control System', 1),
      t('Pre-Costing', 1),
      t('Labeling', 1),
      t('Bulk Load', 1),
    ],
  },
  {
    name: 'Costing',
    tasks: [
      t('Cabinet', 1),
      t('Freezer Door', 1),
      t('Refrigerator Door', 1),
      t('Exterior Features', 1),
      t('Interior Features', 2),
      t('Packaging', 1),
      t('Literature & Labels', 1),
      t('Ice And Water', 1),
      t('Cooling System', 2),
      t('Control System', 3),
      t('PCB', 2),
      t('Harness', 2),
    ],
  },
  {
    name: 'Deliverables',
    tasks: REFRIGERATION_DELIVERABLES,
  },
]

// Full Dishwasher template (from DW CSV, sequential)
const DISHWASHER_TEMPLATE: WorkstreamTemplate[] = [
  {
    name: 'Planning',
    tasks: [
      t('Project Kickoff', 1),
      t('Collect Deliverables', 1),
    ],
  },
  {
    name: 'Tear Down',
    tasks: [
      t('Packaging & Lit.', 0.5),
      t('Racks', 0.5),
      t('Water Delivery System', 1),
      t('Door & Aesthetics, Dry System', 0.5),
      t('Control System', 0.5),
      t('Wash System', 1),
      t('Tub & Chassis System', 1),
    ],
  },
  {
    name: 'Costing',
    tasks: [
      t('Packaging', 0.5),
      t('Racks', 0.5),
      t('Water Delivery System', 1),
      t('Door & Aesthetics', 0.5),
      t('Control System', 0.5),
      t('Wash System', 1),
      t('Tub & Chassis System', 1),
    ],
  },
  {
    name: 'BOB & A2Mac1',
    tasks: [
      t('BOB & A2Mac1', 2),
    ],
  },
  {
    name: 'Reports & Report-out',
    tasks: [
      t('Reports & Report-out', 5),
    ],
  },
]

// Builds simple workstreams for categories that don't yet have detailed hour data.
// All tasks default to 1 day until a detailed template is added.
function simpleTemplate(tearDownTasks: string[]): WorkstreamTemplate[] {
  return [
    {
      name: 'Planning',
      tasks: [t('Project Kickoff', 1), t('Collect Deliverables', 1)],
    },
    {
      name: 'Tear Down',
      tasks: tearDownTasks.map((name) => t(name, 1)),
    },
    {
      name: 'Costing',
      tasks: tearDownTasks.map((name) => t(name, 1)),
    },
    {
      name: 'Deliverables',
      tasks: SIMPLE_DELIVERABLES,
    },
  ]
}

export const CATEGORY_TEMPLATES: Record<string, WorkstreamTemplate[]> = {
  Refrigeration: REFRIGERATION_TEMPLATE,
  Dishwasher: DISHWASHER_TEMPLATE,
  Cooking: simpleTemplate(['Documentation', 'Chassis', 'Cooktop', 'Accessories', 'Cavity', 'Controls', 'Drawer', 'UI Console', 'Door']),
  Laundry: simpleTemplate(['Aesthetics', 'Structures', 'Performance Enablers', 'SES']),
  KASA: simpleTemplate(['Packaging', 'Steam & Milk Frother Asm', 'Aesthetics & Cabinet', 'Brewing System', 'Grinding System', 'Heating System', 'Filling & Distribution System', 'Controls']),
  'Food Disposer': simpleTemplate(['Packaging and Literature', 'Accessories', 'Aesthetic', 'Structure', 'Water and heating', 'Control']),
}

export const CATEGORY_TYPES: Record<string, string[]> = {
  Refrigeration: ['BM', 'TM', 'IM', 'FD', 'SD', 'CF', 'UF', 'SS', 'AC', 'Other'],
  Cooking: ['WO', 'MB', 'CT', 'MW', 'FS', 'HD', 'Other'],
  Laundry: ['VA', 'HA', 'DR', 'CL', 'Other'],
  Dishwasher: ['DW', 'Other'],
  KASA: ['KASA', 'Other'],
  'Food Disposer': ['Food Disposer', 'Other'],
}

export const CATEGORY_TYPE_LABELS: Record<string, Record<string, string>> = {
  Refrigeration: {
    BM: 'BM - Bottom Mount',
    TM: 'TM - Top Mount',
    IM: 'IM - Inline Mount',
    FD: 'FD - French Door',
    SD: 'SD - Side by Side',
    CF: 'CF - Counter Frequency',
    UF: 'UF - Under Counter/Freezer',
    SS: 'SS - Side by Side',
    AC: 'AC - French Door 4-Door',
    Other: 'Other',
  },
  Cooking: {
    WO: 'WO - Wall Oven',
    MB: 'MB - Built-in MWO',
    CT: 'CT - Countertop MWO',
    MW: 'MW - MWO Hood Combo',
    FS: 'FS - Free Standing',
    HD: 'HD - Hood',
    Other: 'Other',
  },
  Laundry: {
    VA: 'VA',
    HA: 'HA',
    DR: 'DR',
    CL: 'CL',
    Other: 'Other',
  },
  Dishwasher: { DW: 'DW - Dishwasher', Other: 'Other' },
  KASA: { KASA: 'KASA', Other: 'Other' },
  'Food Disposer': { 'Food Disposer': 'Food Disposer', Other: 'Other' },
}

export const ALL_CATEGORIES = ['Refrigeration', 'Cooking', 'Dishwasher', 'Laundry', 'KASA', 'Food Disposer', 'Other']

// Total working days for a category template
export function templateTotalDays(category: string): number {
  const ws = CATEGORY_TEMPLATES[category]
  if (!ws) return 0
  return ws.reduce((sum, w) => sum + w.tasks.reduce((s, task) => s + task.durationDays, 0), 0)
}
