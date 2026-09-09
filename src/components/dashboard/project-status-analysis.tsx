'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  FileDown, PieChart, BarChart3, LayoutGrid, CheckCircle2, Loader2 as InProgressIcon,
  ScanSearch, CalendarCheck2, PackageOpen, Target, CalendarRange, TrendingUp, Rows3, Globe2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { exportProjectStatusPptx } from '@/lib/pptx-export'
import {
  YearFilter, ALL_YEARS, rangeOverlapsYear, QuarterFilter, ALL_QUARTERS, matchesQuarter,
  RegionFilter, ALL_REGIONS, matchesRegion,
} from '@/components/filters/year-filter'

interface ProjectLite {
  id: string
  name: string
  category?: string | null
  status: string
  numberOfProducts?: number | null
  quarter?: string | null
  region?: string | null
  startDate?: string | null
  endDate?: string | null
  workstreams?: Array<{ tasks: Array<{ status: string }> }>
}

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const
const REGIONS = ['ASIA', 'LAR', 'NAR', 'EMEA', 'OTHER'] as const

const STATUS_ORDER = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const
const STATUS_LABELS: Record<string, string> = {
  PLANNING: 'Planning', ACTIVE: 'Active', ON_HOLD: 'On Hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}
const STATUS_COLORS: Record<string, string> = {
  PLANNING: '#4472C4', ACTIVE: '#70AD47', ON_HOLD: '#FFC000', COMPLETED: '#00B050', CANCELLED: '#C00000',
}
// IN_PROGRESS is treated as ACTIVE everywhere else in this component (ACTIVE_STATUSES) -- same bucket here.
function normalizeStatus(status: string): string {
  return status === 'IN_PROGRESS' ? 'ACTIVE' : status
}

interface StatTileDef {
  key: string
  label: string
  color: 'emerald' | 'amber' | 'blue'
  icon: LucideIcon
}

const CHART_COLORS = ['#4472C4', '#70AD47', '#FFC000', '#C00000', '#7030A0', '#00B0F0', '#ED7D31', '#A5A5A5']
const ACTIVE_STATUSES = new Set(['ACTIVE', 'IN_PROGRESS'])

const TILE_COLOR_CLASSES: Record<StatTileDef['color'], string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
}
const TILE_ACCENT_CLASSES: Record<StatTileDef['color'], string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
}
const TILE_ICON_CLASSES: Record<StatTileDef['color'], string> = {
  emerald: 'text-emerald-500/70 dark:text-emerald-400/70',
  amber: 'text-amber-500/70 dark:text-amber-400/70',
  blue: 'text-blue-500/70 dark:text-blue-400/70',
}

function StatTile({ def, value }: { def: StatTileDef; value: number }) {
  const Icon = def.icon
  return (
    <div className={`relative overflow-hidden rounded-xl border p-4 shadow-sm ${TILE_COLOR_CLASSES[def.color]}`}>
      <span className={`absolute inset-x-0 top-0 h-1 ${TILE_ACCENT_CLASSES[def.color]}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${TILE_ICON_CLASSES[def.color]}`} />
      </div>
      <p className="text-xs mt-1 font-medium opacity-80">{def.label}</p>
    </div>
  )
}

export function ProjectStatusAnalysis({ projects }: { projects: ProjectLite[] }) {
  const [exporting, setExporting] = useState(false)
  const [yearFilter, setYearFilter] = useState(ALL_YEARS)
  const [quarterFilter, setQuarterFilter] = useState(ALL_QUARTERS)
  const [regionFilter, setRegionFilter] = useState(ALL_REGIONS)

  const allRealProjects = useMemo(
    () => projects.filter((p) => p.name !== '__direct_assignments__'),
    [projects]
  )
  const projectYears = useMemo(() => {
    const years = new Set<number>()
    for (const p of allRealProjects) {
      if (p.startDate) years.add(new Date(p.startDate).getFullYear())
      if (p.endDate) years.add(new Date(p.endDate).getFullYear())
    }
    return [...years]
  }, [allRealProjects])

  const realProjects = useMemo(
    () => allRealProjects
      .filter((p) => rangeOverlapsYear(p.startDate, p.endDate, yearFilter))
      .filter((p) => matchesQuarter(p.quarter, quarterFilter))
      .filter((p) => matchesRegion(p.region, regionFilter)),
    [allRealProjects, yearFilter, quarterFilter, regionFilter]
  )

  const currentYear = new Date().getFullYear()
  const labelYear = yearFilter === ALL_YEARS ? currentYear : yearFilter
  const tileDefs: StatTileDef[] = useMemo(() => [
    { key: 'projectsCompleted', label: 'Projects Completed', color: 'emerald', icon: CheckCircle2 },
    { key: 'projectsInProgress', label: 'Projects In Progress', color: 'amber', icon: InProgressIcon },
    { key: 'unitsAnalysed', label: 'Units Analysed', color: 'emerald', icon: ScanSearch },
    { key: 'plannedProjects', label: `${labelYear} Planned Projects`, color: 'blue', icon: CalendarCheck2 },
    { key: 'unitsInProgress', label: 'Units In Progress', color: 'amber', icon: PackageOpen },
    { key: 'unitsPlanned', label: `${labelYear} Units Planned`, color: 'blue', icon: Target },
  ], [labelYear])

  // "Units" = numberOfProducts on each project (the products/model-types being
  // torn down) -- summed the same way the project-count tiles are counted, so
  // every tile here is a real, live number with nothing manually entered.
  const tileValues = useMemo<Record<string, number>>(() => {
    const sumProducts = (list: ProjectLite[]) => list.reduce((s, p) => s + (p.numberOfProducts || 0), 0)
    const completed = realProjects.filter((p) => p.status === 'COMPLETED')
    const inProgress = realProjects.filter((p) => ACTIVE_STATUSES.has(p.status))
    return {
      projectsCompleted: completed.length,
      projectsInProgress: inProgress.length,
      plannedProjects: realProjects.length,
      unitsAnalysed: sumProducts(completed),
      unitsInProgress: sumProducts(inProgress),
      unitsPlanned: sumProducts(realProjects),
    }
  }, [realProjects])

  const categoryStats = useMemo(() => {
    const map = new Map<string, { planned: number; completedOrInProgress: number; projects: string[] }>()
    for (const p of realProjects) {
      const cat = p.category || 'Other'
      if (!map.has(cat)) map.set(cat, { planned: 0, completedOrInProgress: 0, projects: [] })
      const s = map.get(cat)!
      s.planned++
      s.projects.push(p.name)
      if (p.status === 'COMPLETED' || ACTIVE_STATUSES.has(p.status)) s.completedOrInProgress++
    }
    return [...map.entries()]
      .map(([category, s]) => ({ category, ...s }))
      .sort((a, b) => b.planned - a.planned)
  }, [realProjects])

  const totalPlanned = categoryStats.reduce((s, c) => s + c.planned, 0) || 1
  const maxBarValue = Math.max(1, ...categoryStats.flatMap((c) => [c.planned, c.completedOrInProgress]))

  // Same planned-vs-completed/in-progress breakdown, but summing each
  // project's numberOfProducts (units) instead of counting projects.
  const categoryUnitStats = useMemo(() => {
    const map = new Map<string, { planned: number; completedOrInProgress: number }>()
    for (const p of realProjects) {
      const cat = p.category || 'Other'
      const units = p.numberOfProducts || 0
      if (!map.has(cat)) map.set(cat, { planned: 0, completedOrInProgress: 0 })
      const s = map.get(cat)!
      s.planned += units
      if (p.status === 'COMPLETED' || ACTIVE_STATUSES.has(p.status)) s.completedOrInProgress += units
    }
    return categoryStats.map((c) => ({ category: c.category, ...(map.get(c.category) ?? { planned: 0, completedOrInProgress: 0 }) }))
  }, [realProjects, categoryStats])
  const maxUnitBarValue = Math.max(1, ...categoryUnitStats.flatMap((c) => [c.planned, c.completedOrInProgress]))

  const quarterStats = useMemo(() => {
    const counts: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, 'Not set': 0 }
    for (const p of realProjects) counts[p.quarter && QUARTERS.includes(p.quarter as never) ? p.quarter : 'Not set']++
    const quarters = QUARTERS.map((q) => ({ quarter: q, count: counts[q] }))
    return counts['Not set'] > 0 ? [...quarters, { quarter: 'Not set', count: counts['Not set'] }] : quarters
  }, [realProjects])
  const maxQuarterValue = Math.max(1, ...quarterStats.map((q) => q.count))

  const regionStats = useMemo(() => {
    const counts: Record<string, number> = { ASIA: 0, LAR: 0, NAR: 0, EMEA: 0, OTHER: 0, 'Not set': 0 }
    for (const p of realProjects) counts[p.region && REGIONS.includes(p.region as never) ? p.region : 'Not set']++
    const regions = REGIONS.map((r) => ({ region: r, count: counts[r] }))
    return counts['Not set'] > 0 ? [...regions, { region: 'Not set', count: counts['Not set'] }] : regions
  }, [realProjects])
  const maxRegionValue = Math.max(1, ...regionStats.map((r) => r.count))

  // Ongoing (Active/In Progress) projects with their live % complete, from the
  // same tasks-completed-over-total logic used everywhere else in the app.
  const ongoingProgress = useMemo(() => {
    return realProjects
      .filter((p) => ACTIVE_STATUSES.has(p.status))
      .map((p) => {
        const tasks = (p.workstreams ?? []).flatMap((ws) => ws.tasks)
        const pct = tasks.length === 0 ? 0 : Math.round((tasks.filter((t) => t.status === 'COMPLETED').length / tasks.length) * 100)
        return { id: p.id, name: p.name, pct }
      })
      .sort((a, b) => b.pct - a.pct)
  }, [realProjects])

  // Category x status matrix -- how many projects of each status per category.
  const statusByCategory = useMemo(() => {
    const map = new Map<string, Record<string, number>>()
    for (const p of realProjects) {
      const cat = p.category || 'Other'
      if (!map.has(cat)) map.set(cat, Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])))
      const row = map.get(cat)!
      const status = normalizeStatus(p.status)
      row[status] = (row[status] ?? 0) + 1
    }
    return [...map.entries()]
      .map(([category, statuses]) => ({ category, statuses, total: Object.values(statuses).reduce((s, n) => s + n, 0) }))
      .sort((a, b) => b.total - a.total)
  }, [realProjects])
  const maxCategoryTotal = Math.max(1, ...statusByCategory.map((c) => c.total))

  // Donut chart geometry — stroke-dasharray trick, one arc per category
  const radius = 60
  const circumference = 2 * Math.PI * radius
  let dashOffset = 0
  const arcs = categoryStats.map((c, i) => {
    const frac = c.planned / totalPlanned
    const dash = frac * circumference
    const arc = { dash, gap: circumference - dash, offset: -dashOffset, color: CHART_COLORS[i % CHART_COLORS.length] }
    dashOffset += dash
    return arc
  })

  async function handleExport() {
    setExporting(true)
    try {
      await exportProjectStatusPptx({
        title: 'CAA Project Status',
        subtitle: `(Jan '${String(labelYear).slice(2)} to YTD)`,
        categoryStats: categoryStats.map((c) => ({
          category: c.category, planned: c.planned, completedOrInProgress: c.completedOrInProgress,
        })),
        projectsByCategory: categoryStats.map((c) => ({ category: c.category, projects: c.projects })),
        statTiles: tileDefs.map((def) => ({ label: def.label, value: tileValues[def.key] ?? 0, color: def.color })),
      })
    } catch {
      toast.error('Failed to export PPTX')
    } finally {
      setExporting(false)
    }
  }

  if (allRealProjects.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600" />
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap border-b">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40 shrink-0">
            <PieChart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </span>
          <div>
            <CardTitle className="text-base font-semibold leading-tight">CAA Project Status</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Jan &apos;{String(labelYear).slice(2)} – YTD · {realProjects.length} project{realProjects.length !== 1 ? 's' : ''} in portfolio
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <QuarterFilter value={quarterFilter} onChange={setQuarterFilter} className="h-9 w-28" />
          <RegionFilter value={regionFilter} onChange={setRegionFilter} className="h-9 w-28" />
          <YearFilter value={yearFilter} onChange={setYearFilter} years={projectYears} />
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || realProjects.length === 0}>
            <FileDown className="h-3.5 w-3.5 mr-1.5" /> {exporting ? 'Exporting…' : 'Export to PPTX'}
          </Button>
        </div>
      </CardHeader>
      {realProjects.length === 0 ? (
        <CardContent className="pt-5">
          <div className="rounded-xl border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
            No projects match this Quarter/Region/Year filter.
          </div>
        </CardContent>
      ) : (
      <CardContent className="space-y-6 pt-5">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tileDefs.map((def) => (
            <StatTile key={def.key} def={def} value={tileValues[def.key] ?? 0} />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Donut chart */}
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
              <PieChart className="h-3.5 w-3.5" /> Total Project Portfolio
            </p>
            <div className="flex items-center gap-5 flex-wrap">
              <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0 drop-shadow-sm">
                <g transform="translate(80,80) rotate(-90)">
                  {arcs.map((a, i) => (
                    <circle
                      key={i}
                      r={radius}
                      fill="none"
                      stroke={a.color}
                      strokeWidth={26}
                      strokeDasharray={`${a.dash} ${a.gap}`}
                      strokeDashoffset={a.offset}
                    />
                  ))}
                </g>
                <text x="80" y="76" textAnchor="middle" className="fill-foreground" style={{ fontSize: 22, fontWeight: 700 }}>
                  {totalPlanned}
                </text>
                <text x="80" y="94" textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.03em' }}>
                  PROJECTS
                </text>
              </svg>
              <div className="space-y-1.5 flex-1 min-w-[140px]">
                {categoryStats.map((c, i) => (
                  <div key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1 truncate font-medium">{c.category}</span>
                    <span className="text-muted-foreground tabular-nums">{c.planned} ({Math.round((c.planned / totalPlanned) * 100)}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bar chart */}
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
              <BarChart3 className="h-3.5 w-3.5" /> Planned vs Completed/In-Progress
            </p>
            <div className="flex items-end gap-3 h-36 border-b pl-1">
              {categoryStats.map((c) => (
                <div key={c.category} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end gap-1">
                  <div className="flex items-end gap-1 flex-1 w-full justify-center">
                    <div
                      className="w-3.5 bg-blue-500 rounded-t"
                      style={{ height: `${(c.planned / maxBarValue) * 100}%` }}
                      title={`Planned: ${c.planned}`}
                    />
                    <div
                      className="w-3.5 bg-emerald-500 rounded-t"
                      style={{ height: `${(c.completedOrInProgress / maxBarValue) * 100}%` }}
                      title={`Completed & In Progress: ${c.completedOrInProgress}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-1 pl-1">
              {categoryStats.map((c) => (
                <span key={c.category} className="text-[10px] text-muted-foreground text-center flex-1 truncate">{c.category}</span>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3 pt-2 border-t text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500 inline-block" /> Planned</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" /> Completed &amp; In Progress</span>
            </div>
          </div>

          {/* Quarter chart */}
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
              <CalendarRange className="h-3.5 w-3.5" /> Projects by Quarter
            </p>
            <div className="flex items-end gap-3 h-36 border-b pl-1">
              {quarterStats.map((q) => (
                <div key={q.quarter} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end gap-1">
                  <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{q.count}</span>
                  <div
                    className="w-6 bg-indigo-500 rounded-t"
                    style={{ height: `${(q.count / maxQuarterValue) * 100}%` }}
                    title={`${q.quarter}: ${q.count}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-1 pl-1">
              {quarterStats.map((q) => (
                <span key={q.quarter} className="text-[10px] text-muted-foreground text-center flex-1 truncate">{q.quarter}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Region chart */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
            <Globe2 className="h-3.5 w-3.5" /> Projects by Region
          </p>
          <div className="flex items-end gap-3 h-36 border-b pl-1">
            {regionStats.map((r) => (
              <div key={r.region} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end gap-1">
                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">{r.count}</span>
                <div
                  className="w-6 bg-cyan-600 rounded-t"
                  style={{ height: `${(r.count / maxRegionValue) * 100}%` }}
                  title={`${r.region}: ${r.count}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1 pl-1">
            {regionStats.map((r) => (
              <span key={r.region} className="text-[10px] text-muted-foreground text-center flex-1 truncate">{r.region}</span>
            ))}
          </div>
        </div>

        {/* Bar chart — same breakdown as above, but by units (numberOfProducts) */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
            <BarChart3 className="h-3.5 w-3.5" /> Units: Planned vs Completed/In-Progress
          </p>
          <div className="flex items-end gap-3 h-36 border-b pl-1">
            {categoryUnitStats.map((c) => (
              <div key={c.category} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end gap-1">
                <div className="flex items-end gap-1 flex-1 w-full justify-center">
                  <div
                    className="w-3.5 bg-blue-500 rounded-t"
                    style={{ height: `${(c.planned / maxUnitBarValue) * 100}%` }}
                    title={`Planned: ${c.planned}`}
                  />
                  <div
                    className="w-3.5 bg-emerald-500 rounded-t"
                    style={{ height: `${(c.completedOrInProgress / maxUnitBarValue) * 100}%` }}
                    title={`Completed & In Progress: ${c.completedOrInProgress}`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1 pl-1">
            {categoryUnitStats.map((c) => (
              <span key={c.category} className="text-[10px] text-muted-foreground text-center flex-1 truncate">{c.category}</span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-3 pt-2 border-t text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500 inline-block" /> Planned</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500 inline-block" /> Completed &amp; In Progress</span>
          </div>
        </div>

        {/* Project list, grouped by category */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
            <LayoutGrid className="h-3.5 w-3.5" /> Projects by Category
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            {categoryStats.map((c, i) => (
              <div key={c.category}>
                <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b">
                  <span className="h-2 w-2 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <p className="text-xs font-semibold tracking-wide">{c.category}</p>
                  <span className="ml-auto text-[10px] font-medium text-muted-foreground tabular-nums">{c.projects.length}</span>
                </div>
                <ul className="space-y-1">
                  {c.projects.map((name, i) => {
                    const proj = realProjects.find((p) => p.name === name && (p.category || 'Other') === c.category)
                    return (
                      <li key={`${name}-${i}`} className="text-xs truncate">
                        {proj ? (
                          <Link href={`/projects/${proj.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                            {name}
                          </Link>
                        ) : name}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Ongoing projects — % complete */}
        {ongoingProgress.length > 0 && (
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
              <TrendingUp className="h-3.5 w-3.5" /> Ongoing Projects — % Complete
            </p>
            <div className="space-y-2.5">
              {ongoingProgress.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Link
                    href={`/projects/${p.id}`}
                    className="text-xs w-40 sm:w-56 shrink-0 truncate text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-9 text-right shrink-0">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project count by status, per category */}
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
            <Rows3 className="h-3.5 w-3.5" /> Projects — Status by Category
          </p>
          <div className="space-y-3">
            {statusByCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="text-xs font-medium w-24 sm:w-28 shrink-0 truncate">{c.category}</span>
                <div className="flex-1 h-5 rounded-md bg-muted overflow-hidden flex">
                  {STATUS_ORDER.filter((s) => c.statuses[s] > 0).map((s) => (
                    <div
                      key={s}
                      className="flex items-center justify-center"
                      style={{ width: `${(c.statuses[s] / maxCategoryTotal) * 100}%`, backgroundColor: STATUS_COLORS[s] }}
                      title={`${STATUS_LABELS[s]}: ${c.statuses[s]}`}
                    >
                      <span className="text-[10px] font-semibold text-white leading-none">{c.statuses[s]}</span>
                    </div>
                  ))}
                </div>
                <span className="text-xs font-semibold tabular-nums w-6 text-right shrink-0">{c.total}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 pt-2 border-t text-[10px] text-muted-foreground">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm inline-block" style={{ backgroundColor: STATUS_COLORS[s] }} /> {STATUS_LABELS[s]}
              </span>
            ))}
          </div>

          {/* Same data as a table */}
          <div className="mt-4 pt-3 border-t overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-medium pb-1.5 pr-2">Category</th>
                  {STATUS_ORDER.map((s) => (
                    <th key={s} className="text-right font-medium pb-1.5 px-2">{STATUS_LABELS[s]}</th>
                  ))}
                  <th className="text-right font-semibold pb-1.5 pl-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {statusByCategory.map((c) => (
                  <tr key={c.category} className="border-t">
                    <td className="py-1.5 pr-2 font-medium">{c.category}</td>
                    {STATUS_ORDER.map((s) => (
                      <td key={s} className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                        {c.statuses[s] || '—'}
                      </td>
                    ))}
                    <td className="text-right py-1.5 pl-2 font-semibold tabular-nums">{c.total}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-1.5 pr-2">Total</td>
                  {STATUS_ORDER.map((s) => (
                    <td key={s} className="text-right py-1.5 px-2 tabular-nums">
                      {statusByCategory.reduce((sum, c) => sum + c.statuses[s], 0) || '—'}
                    </td>
                  ))}
                  <td className="text-right py-1.5 pl-2 tabular-nums">
                    {statusByCategory.reduce((sum, c) => sum + c.total, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
      )}
    </Card>
  )
}
