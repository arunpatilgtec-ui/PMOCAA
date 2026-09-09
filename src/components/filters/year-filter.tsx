'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarDays } from 'lucide-react'

export const ALL_YEARS = 'ALL'

// Shared year dropdown used across list/board pages (Dashboard, Projects, All
// Projects, Reports, Timeline, Gantt, Kanban, Resources) so "year" filtering
// looks and behaves the same everywhere. `years` should be the set of years
// actually present in the page's data (falls back to a sane default range).
export function YearFilter({
  value,
  onChange,
  years,
  className,
}: {
  value: string
  onChange: (v: string) => void
  years?: number[]
  className?: string
}) {
  const currentYear = new Date().getFullYear()
  const yearList = years && years.length > 0
    ? years
    : Array.from({ length: 6 }, (_, i) => currentYear - 3 + i)
  const sorted = [...new Set(yearList)].sort((a, b) => b - a)

  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={className ?? 'h-9 w-[130px]'}>
        <CalendarDays className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
        <SelectValue placeholder="Year" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_YEARS}>All years</SelectItem>
        {sorted.map((y) => (
          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function matchesYear(dateStr: string | null | undefined, year: string): boolean {
  if (year === ALL_YEARS) return true
  if (!dateStr) return false
  return new Date(dateStr).getFullYear() === Number(year)
}

// True if a start/end date range overlaps the given year at all.
export function rangeOverlapsYear(
  startStr: string | null | undefined,
  endStr: string | null | undefined,
  year: string,
): boolean {
  if (year === ALL_YEARS) return true
  const y = Number(year)
  const start = startStr ? new Date(startStr) : null
  const end = endStr ? new Date(endStr) : start
  if (!start && !end) return false
  const startYear = (start ?? end)!.getFullYear()
  const endYear = (end ?? start)!.getFullYear()
  return y >= startYear && y <= endYear
}

export const ALL_QUARTERS = 'ALL'
export const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const

// Shared quarter dropdown, mirrors YearFilter -- filters by the project's own
// `quarter` field (set at creation or added later), not derived from dates.
export function QuarterFilter({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={className ?? 'h-9 w-[120px]'}>
        <SelectValue placeholder="Quarter" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_QUARTERS}>All quarters</SelectItem>
        {QUARTERS.map((q) => (
          <SelectItem key={q} value={q}>{q}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function matchesQuarter(quarter: string | null | undefined, filter: string): boolean {
  if (filter === ALL_QUARTERS) return true
  return quarter === filter
}

export const ALL_REGIONS = 'ALL'
export const REGIONS = ['ASIA', 'LAR', 'NAR', 'EMEA', 'OTHER'] as const

// Shared region dropdown, mirrors QuarterFilter -- filters by the project's
// own `region` field.
export function RegionFilter({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className={className ?? 'h-9 w-[120px]'}>
        <SelectValue placeholder="Region" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_REGIONS}>All regions</SelectItem>
        {REGIONS.map((r) => (
          <SelectItem key={r} value={r}>{r}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function matchesRegion(region: string | null | undefined, filter: string): boolean {
  if (filter === ALL_REGIONS) return true
  return region === filter
}
