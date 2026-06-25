'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/store/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  differenceInDays, format, startOfYear, endOfYear,
  eachMonthOfInterval,
} from 'date-fns'

interface Project {
  id: string
  name: string
  status: string
  priority?: string
  startDate?: string
  endDate?: string
  lead?: { id: string; name: string }
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

const STATUS_BG: Record<string, string> = {
  PLANNING:    'bg-blue-400',
  ACTIVE:      'bg-green-500',
  IN_PROGRESS: 'bg-green-500',
  ON_HOLD:     'bg-amber-400',
  COMPLETED:   'bg-emerald-600',
  CANCELLED:   'bg-red-400',
}

const STATUS_TEXT: Record<string, string> = {
  PLANNING:    'text-blue-700 bg-blue-50 border-blue-200',
  ACTIVE:      'text-green-700 bg-green-50 border-green-200',
  IN_PROGRESS: 'text-green-700 bg-green-50 border-green-200',
  ON_HOLD:     'text-amber-700 bg-amber-50 border-amber-200',
  COMPLETED:   'text-emerald-700 bg-emerald-50 border-emerald-200',
  CANCELLED:   'text-red-600 bg-red-50 border-red-200',
}

const STATUS_LABEL: Record<string, string> = {
  PLANNING:    'Planning',
  ACTIVE:      'Active',
  IN_PROGRESS: 'Active',
  ON_HOLD:     'On Hold',
  COMPLETED:   'Completed',
  CANCELLED:   'Cancelled',
}

const PRIORITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-red-700 bg-red-50 border-red-200',
  HIGH:     'text-orange-700 bg-orange-50 border-orange-200',
  MEDIUM:   'text-blue-700 bg-blue-50 border-blue-200',
  LOW:      'text-slate-600 bg-slate-50 border-slate-200',
}

const LABEL_W = 260

export default function AllProjectsPage() {
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())
  const [filterStatus, setFilterStatus] = useState('ONGOING')
  const [filterPriority, setFilterPriority] = useState('ALL')

  const canAccess = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)

  useEffect(() => {
    if (!canAccess) return
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => {
        setProjects(
          Array.isArray(d)
            ? d.filter((p: Project) => p.name !== '__direct_assignments__')
            : []
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [canAccess])

  // Timeline geometry
  const yearStart = startOfYear(new Date(year, 0, 1))
  const yearEnd   = endOfYear(new Date(year, 0, 1))
  const totalDays = differenceInDays(yearEnd, yearStart) + 1
  const months    = eachMonthOfInterval({ start: yearStart, end: yearEnd })
  const today     = new Date()
  const todayOffset = year === today.getFullYear()
    ? (differenceInDays(today, yearStart) / totalDays) * 100
    : -1

  function barProps(startStr?: string, endStr?: string) {
    if (!startStr || !endStr) return null
    const s = new Date(startStr)
    const e = new Date(endStr)
    const clampedStart = s < yearStart ? yearStart : s
    const clampedEnd   = e > yearEnd   ? yearEnd   : e
    if (clampedStart > yearEnd || clampedEnd < yearStart) return null
    const left  = (differenceInDays(clampedStart, yearStart) / totalDays) * 100
    const width = Math.max(0.5, ((differenceInDays(clampedEnd, clampedStart) + 1) / totalDays) * 100)
    return { left, width }
  }

  const filtered = useMemo(() => {
    const ONGOING = ['PLANNING', 'ACTIVE', 'IN_PROGRESS', 'ON_HOLD']
    return projects
      .filter(p => {
        if (filterStatus === 'ONGOING')   return ONGOING.includes(p.status)
        if (filterStatus === 'COMPLETED') return p.status === 'COMPLETED'
        if (filterStatus === 'ALL')       return p.status !== 'CANCELLED'
        return p.status === filterStatus || (filterStatus === 'ACTIVE' && p.status === 'IN_PROGRESS')
      })
      .filter(p => filterPriority === 'ALL' || p.priority === filterPriority)
      .sort((a, b) => {
        const pa = PRIORITY_RANK[a.priority ?? ''] ?? 0
        const pb = PRIORITY_RANK[b.priority ?? ''] ?? 0
        if (pb !== pa) return pb - pa
        const ord: Record<string, number> = { ACTIVE: 5, IN_PROGRESS: 5, PLANNING: 4, ON_HOLD: 3, COMPLETED: 2, CANCELLED: 1 }
        return (ord[b.status] ?? 0) - (ord[a.status] ?? 0)
      })
  }, [projects, filterStatus, filterPriority])

  const stats = useMemo(() => {
    const ONGOING = ['PLANNING', 'ACTIVE', 'IN_PROGRESS', 'ON_HOLD']
    return {
      total:     projects.filter(p => p.status !== 'CANCELLED').length,
      ongoing:   projects.filter(p => ONGOING.includes(p.status)).length,
      completed: projects.filter(p => p.status === 'COMPLETED').length,
      overdue:   projects.filter(p =>
        ONGOING.includes(p.status) && p.endDate && new Date(p.endDate) < today
      ).length,
    }
  }, [projects, today])

  if (!canAccess) {
    return (
      <div className="p-6 flex items-center justify-center h-[60vh]">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-lg font-semibold">Access Restricted</p>
          <p className="text-sm text-muted-foreground">
            Available to Admins, Managers, and Planners only.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">All Projects</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Project timelines — sorted by priority
            </p>
          </div>
          {/* Year nav */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-12 text-center">{year}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {year !== new Date().getFullYear() && (
              <Button variant="ghost" size="sm" className="h-8 text-xs ml-1" onClick={() => setYear(new Date().getFullYear())}>
                This year
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="flex items-center gap-5 mt-3 text-sm">
            <span className="text-muted-foreground">{stats.total} projects</span>
            <span className="text-green-600 font-medium">{stats.ongoing} ongoing</span>
            <span className="text-emerald-700 font-medium">{stats.completed} completed</span>
            {stats.overdue > 0 && (
              <span className="text-red-600 font-medium">{stats.overdue} overdue</span>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2 mt-3">
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'ONGOING')}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ONGOING">Ongoing</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ALL">All (excl. Cancelled)</SelectItem>
              <SelectItem value="PLANNING">Planning</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On Hold</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={v => setFilterPriority(v ?? 'ALL')}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All priorities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>

          {(filterStatus !== 'ONGOING' || filterPriority !== 'ALL') && (
            <Button variant="ghost" size="sm" className="h-8 text-xs"
              onClick={() => { setFilterStatus('ONGOING'); setFilterPriority('ALL') }}>
              Reset
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} shown</span>
        </div>
      </div>

      {/* Gantt */}
      {loading ? (
        <div className="space-y-2 flex-1">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No projects match the current filters.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {/* Month header — sticky */}
          <div className="flex sticky top-0 z-10 bg-background border border-border rounded-t-lg overflow-hidden">
            <div
              style={{ width: LABEL_W, minWidth: LABEL_W }}
              className="shrink-0 px-3 py-2 text-xs font-semibold text-muted-foreground bg-muted/60 border-r border-border"
            >
              Project
            </div>
            <div className="flex flex-1">
              {months.map(m => (
                <div
                  key={m.toISOString()}
                  className="flex-1 text-center text-[11px] py-2 font-medium text-muted-foreground border-r border-border last:border-r-0"
                >
                  {format(m, 'MMM')}
                </div>
              ))}
            </div>
          </div>

          {/* Project rows */}
          <div className="border border-t-0 border-border rounded-b-lg overflow-hidden">
            {filtered.map((proj, idx) => {
              const bar    = barProps(proj.startDate, proj.endDate)
              const isPast = proj.endDate && new Date(proj.endDate) < today
                && !['COMPLETED', 'CANCELLED'].includes(proj.status)

              return (
                <div
                  key={proj.id}
                  className={`flex border-b border-border last:border-b-0 hover:bg-muted/10 transition-colors ${idx % 2 === 1 ? 'bg-muted/5' : ''}`}
                  style={{ minHeight: 52 }}
                >
                  {/* Label column */}
                  <div
                    style={{ width: LABEL_W, minWidth: LABEL_W }}
                    className="shrink-0 border-r border-border px-3 py-2.5 flex flex-col justify-center gap-1"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold truncate">{proj.name}</span>
                      {isPast && (
                        <span className="text-[10px] font-bold text-red-500 shrink-0">OVERDUE</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {proj.priority && (
                        <Badge
                          className={`text-[10px] px-1 py-0 h-4 border ${PRIORITY_TEXT[proj.priority] ?? ''}`}
                          variant="outline"
                        >
                          {proj.priority}
                        </Badge>
                      )}
                      <Badge
                        className={`text-[10px] px-1 py-0 h-4 border ${STATUS_TEXT[proj.status] ?? ''}`}
                        variant="outline"
                      >
                        {STATUS_LABEL[proj.status] ?? proj.status}
                      </Badge>
                      {proj.lead && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {proj.lead.name.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Timeline area */}
                  <div className="flex-1 relative py-2.5 flex items-center">
                    {/* Month dividers */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {months.map((m, mi) => (
                        <div key={mi} className="flex-1 border-r border-border/30 last:border-r-0" />
                      ))}
                    </div>

                    {/* Today line */}
                    {todayOffset >= 0 && todayOffset <= 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-blue-500 z-10"
                        style={{ left: `${todayOffset}%` }}
                      />
                    )}

                    {bar ? (
                      <div
                        className="absolute"
                        style={{ left: `${bar.left}%`, width: `${bar.width}%`, paddingRight: 2 }}
                      >
                        <div
                          className={`h-7 rounded ${STATUS_BG[proj.status] ?? 'bg-slate-400'} text-white overflow-hidden`}
                          title={`${proj.name} · ${proj.startDate ? format(new Date(proj.startDate), 'MMM d, yyyy') : '?'} – ${proj.endDate ? format(new Date(proj.endDate), 'MMM d, yyyy') : '?'}`}
                        >
                          <span className="px-2 text-xs font-medium leading-7 whitespace-nowrap truncate block">
                            {bar.width > 8 ? proj.name : ''}
                          </span>
                        </div>
                        {bar.width > 6 && (
                          <div className="flex justify-between mt-0.5 text-[9px] text-muted-foreground">
                            <span>{proj.startDate ? format(new Date(proj.startDate), 'MMM d') : ''}</span>
                            <span>{proj.endDate   ? format(new Date(proj.endDate),   'MMM d') : ''}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="absolute left-2 right-2 flex items-center h-7">
                        <span className="text-xs text-muted-foreground/50 italic">No dates set</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {!loading && (
        <div className="shrink-0 mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium">Status:</span>
          {(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const).map(key => (
            <span key={key} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm inline-block ${STATUS_BG[key] ?? 'bg-slate-400'}`} />
              {STATUS_LABEL[key]}
            </span>
          ))}
          <span className="flex items-center gap-1 ml-4">
            <span className="w-px h-3 bg-blue-500 inline-block" /> Today
          </span>
        </div>
      )}
    </div>
  )
}
