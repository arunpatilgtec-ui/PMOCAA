import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { getCategoryTemplate } from '@/lib/project-templates'
import { sequenceTasks } from '@/lib/date-utils'

interface ImportRow {
  name?: string
  category?: string
  productType?: string
  projectType?: string
  startDate?: string
  priority?: string
  quarter?: string
  numberOfProducts?: string
  status?: string
  region?: string
}

interface RowResult {
  row: number
  name: string
  status: 'created' | 'error'
  error?: string
  projectId?: string
}

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
const VALID_QUARTERS = new Set(['Q1', 'Q2', 'Q3', 'Q4'])
const VALID_REGIONS = new Set(['ASIA', 'LAR', 'NAR', 'EMEA', 'OTHER'])
const VALID_STATUSES = new Set(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
// A couple of common spellings people naturally type that don't match the enum literally.
const STATUS_ALIASES: Record<string, string> = { 'IN_PROGRESS': 'ACTIVE', 'ONHOLD': 'ON_HOLD' }

// Bulk version of the create-project + setup two-step flow (POST /api/projects
// then POST /api/projects/[id]/setup) -- each CSV row goes through both so it
// lands fully scheduled, not just a bare DRAFT shell. Rows are processed
// independently: one bad row reports its own error without failing the batch.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'MANAGER', 'PLANNER', 'PROJECT_LEAD'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : []
    if (rows.length === 0) return Response.json({ error: 'No rows to import' }, { status: 400 })
    if (rows.length > 200) return Response.json({ error: 'Import is limited to 200 rows at a time' }, { status: 400 })

    const [categories, projectTypes] = await Promise.all([
      prisma.templateCategory.findMany({ include: { modelTypes: true } }),
      prisma.templateProjectType.findMany(),
    ])
    const categoryByLower = new Map(categories.map((c) => [c.name.toLowerCase(), c]))
    const projectTypeByLower = new Map(projectTypes.map((t) => [t.name.toLowerCase(), t.name]))

    const results: RowResult[] = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const rowNum = i + 2 // +1 for 0-index, +1 for the header row
      const name = (r.name || '').trim()
      try {
        if (!name) throw new Error('Project Name is required')

        const categoryInput = (r.category || '').trim()
        if (!categoryInput) throw new Error('Category is required')
        const category = categoryByLower.get(categoryInput.toLowerCase())
        if (!category) throw new Error(`Unknown category "${categoryInput}"`)

        const projectTypeInput = (r.projectType || '').trim()
        if (!projectTypeInput) throw new Error('Project Type is required')
        const projectType = projectTypeByLower.get(projectTypeInput.toLowerCase())
        if (!projectType) throw new Error(`Unknown project type "${projectTypeInput}"`)

        const startDateInput = (r.startDate || '').trim()
        if (!startDateInput) throw new Error('Start Date is required')
        const startDate = new Date(startDateInput)
        if (isNaN(startDate.getTime())) throw new Error(`Invalid Start Date "${startDateInput}" (use YYYY-MM-DD)`)

        let productType: string | null = null
        const productTypeInput = (r.productType || '').trim()
        if (productTypeInput) {
          const mt = category.modelTypes.find((m) =>
            m.code.toLowerCase() === productTypeInput.toLowerCase() || m.label.toLowerCase() === productTypeInput.toLowerCase()
          )
          if (!mt) throw new Error(`Unknown product type "${productTypeInput}" for category "${category.name}"`)
          productType = mt.code
        } else if (category.modelTypes.length > 0) {
          throw new Error(`Product Type is required for category "${category.name}"`)
        }

        let priority = 'MEDIUM'
        const priorityInput = (r.priority || '').trim().toUpperCase()
        if (priorityInput) {
          if (!VALID_PRIORITIES.has(priorityInput)) throw new Error(`Invalid Priority "${r.priority}" (LOW/MEDIUM/HIGH/CRITICAL)`)
          priority = priorityInput
        }

        let quarter: string | null = null
        const quarterInput = (r.quarter || '').trim().toUpperCase()
        if (quarterInput) {
          if (!VALID_QUARTERS.has(quarterInput)) throw new Error(`Invalid Quarter "${r.quarter}" (Q1/Q2/Q3/Q4)`)
          quarter = quarterInput
        }

        let region: string | null = null
        const regionInput = (r.region || '').trim().toUpperCase()
        if (regionInput) {
          if (!VALID_REGIONS.has(regionInput)) throw new Error(`Invalid Region "${r.region}" (ASIA/LAR/NAR/EMEA/OTHER)`)
          region = regionInput
        }

        let status = 'PLANNING'
        const statusInputRaw = (r.status || '').trim().toUpperCase().replace(/[\s-]+/g, '_')
        if (statusInputRaw) {
          const normalized = STATUS_ALIASES[statusInputRaw] ?? statusInputRaw
          if (!VALID_STATUSES.has(normalized)) {
            throw new Error(`Invalid Status "${r.status}" (Planning/Active/On Hold/Completed/Cancelled)`)
          }
          status = normalized
        }

        let numberOfProducts: number | null = null
        const numInput = (r.numberOfProducts || '').trim()
        if (numInput) {
          const n = parseInt(numInput, 10)
          if (isNaN(n) || n < 0) throw new Error(`Invalid Number of Products "${numInput}"`)
          numberOfProducts = n
        }

        const isTeardown = projectType === 'Teardown'
        const wsTemplates = await getCategoryTemplate(category.name, productType)

        const anchor = new Date(startDate)
        anchor.setHours(0, 0, 0, 0)
        const allTemplateTasks = wsTemplates ? wsTemplates.flatMap((ws) => ws.tasks) : []
        const allDates = wsTemplates ? sequenceTasks(allTemplateTasks, anchor) : []
        const endDate = wsTemplates && allDates.length > 0 ? allDates[allDates.length - 1].endDate : startDate

        const projectId = await prisma.$transaction(async (tx) => {
          const project = await tx.project.create({
            data: {
              name,
              type: isTeardown ? 'TEARDOWN' : 'OTHER',
              status: status as never,
              priority: (isTeardown ? 'HIGH' : priority) as never,
              startDate,
              endDate,
              category: category.name,
              productType,
              quarter: quarter as never,
              region: region as never,
              plannerId: session.role !== 'PROJECT_LEAD' ? session.id : null,
              projectClassification: isTeardown ? null : projectType,
              numberOfProducts,
              projectLinks: [],
            },
          })

          if (wsTemplates) {
            let dateIdx = 0
            let wsOrder = 0
            for (const wsTemplate of wsTemplates) {
              const ws = await tx.workstream.create({
                data: { name: wsTemplate.name, projectId: project.id, order: wsOrder++ },
              })
              let taskOrder = 0
              for (const taskTemplate of wsTemplate.tasks) {
                const { startDate: taskStart, endDate: taskEnd } = allDates[dateIdx++]
                await tx.task.create({
                  data: {
                    name: taskTemplate.name,
                    workstreamId: ws.id,
                    status: 'BACKLOG',
                    priority: 'MEDIUM',
                    startDate: taskStart,
                    endDate: taskEnd,
                    estimatedHours: taskTemplate.estimatedHours,
                    order: taskOrder++,
                  },
                })
              }
            }
          }

          return project.id
        })

        results.push({ row: rowNum, name, status: 'created', projectId })
      } catch (e: unknown) {
        results.push({ row: rowNum, name: name || '(blank)', status: 'error', error: e instanceof Error ? e.message : 'Failed' })
      }
    }

    return Response.json({ results, created: results.filter((r) => r.status === 'created').length, failed: results.filter((r) => r.status === 'error').length })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PROJECTS IMPORT]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
