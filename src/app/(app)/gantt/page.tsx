'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, eachDayOfInterval, endOfWeek, addDays, differenceInDays, isSameDay, isWeekend } from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, LayoutList, FolderKanban } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string
  owner?: { id: string; name: string }
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

interface Project {
  id: string; name: string
  startDate?: string; endDate?: string
  status: string; priority?: string
  description?: string
}

const TASK_STATUS_BG: Record<string, string> = {
  BACKLOG: 'bg-slate-400', PLANNED: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500', REVIEW: 'bg-purple-500',
  REWORK: 'bg-orange-500', COMPLETED: 'bg-green-500', CANCELLED: 'bg-red-400',
}

const PROJECT_STATUS_BG: Record<string, string> = {
  PLANNING: 'bg-blue-400', ACTIVE: 'bg-green-500',
  IN_PROGRESS: 'bg-green-500', ON_HOLD: 'bg-yellow-500',
  COMPLETED: 'bg-emerald-600', CANCELLED: 'bg-red-400',
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning', ACTIVE: 'Active', IN_PROGRESS: 'Active',
  ON_HOLD: 'On Hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-200',
}

const ROW_HEIGHT = 40
const DAY_WIDTH = 32

type ViewMode = 'tasks' | 'projects'

export default function GanttPage() {
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const [selectedProject, setSelectedProject] = useState<string>(projectId || 'ALL')
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d
  })
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [taskRes, projRes] = await Promise.all([
          fetch(`/api/tasks${selectedProject && selectedProject !== 'ALL' ? `?projectId=${selectedProject}` : ''}`),
          fetch('/api/projects'),
        ])
        const [taskData, projData] = await Promise.all([taskRes.json(), projRes.json()])
        if (cancelled) return
        setTasks(Array.isArray(taskData) ? taskData : [])
        setProjects(Array.isArray(projData) ? projData : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedProject])

  const dayW = Math.round(DAY_WIDTH * zoom)
  const viewEnd = addDays(viewStart, 90)
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd })
  const today = new Date()

  // ── Task mode data ───────────────────────────────────────────────
  const tasksWithDates = tasks.filter((t) => t.startDate && t.endDate)
  const tasksWithoutDates = tasks.filter((t) => !t.startDate || !t.endDate)

  const grouped = new Map<string, Map<string, Task[]>>()
  for (const task of tasksWithDates) {
    const proj = task.workstream.project.name === '__direct_assignments__'
      ? 'Direct Assignments'
      : task.workstream.project.name
    const ws = task.workstream.name
    if (!grouped.has(proj)) grouped.set(proj, new Map())
    const projMap = grouped.get(proj)!
    if (!projMap.has(ws)) projMap.set(ws, [])
    projMap.get(ws)!.push(task)
  }

  const taskRows: Array<{ type: 'project' | 'workstream' | 'task'; label: string; task?: Task; depth: number }> = []
  for (const [projName, wsMap] of grouped) {
    taskRows.push({ type: 'project', label: projName, depth: 0 })
    for (const [wsName, wsTasks] of wsMap) {
      taskRows.push({ type: 'workstream', label: wsName, depth: 1 })
      for (const task of wsTasks) {
        taskRows.push({ type: 'task', label: task.name, task, depth: 2 })
      }
    }
  }

  // Task count by project id (for project mode)
  const taskCountByProjId = new Map<string, number>()
  for (const t of tasks) {
    const pid = t.workstream.project.id
    taskCountByProjId.set(pid, (taskCountByProjId.get(pid) ?? 0) + 1)
  }

  // ── Project mode data ────────────────────────────────────────────
  const sortedProjects = [...projects]
    .filter(p => p.name !== '__direct_assignments__')
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority ?? ''] ?? 0
      const pb = PRIORITY_RANK[b.priority ?? ''] ?? 0
      if (pb !== pa) return pb - pa
      if (a.startDate && b.startDate) return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      if (a.startDate) return -1
      if (b.startDate) return 1
      return 0
    })

  // ── Shared helpers ───────────────────────────────────────────────
  function getBarProps(startStr: string, endStr: string) {
    const start = new Date(startStr)
    const end = new Date(endStr)
    const offsetDays = differenceInDays(start, viewStart)
    const durationDays = Math.max(1, differenceInDays(end, start) + 1)
    return {
      left: offsetDays * dayW,
      width: durationDays * dayW - 2,
      visible: offsetDays < days.length && offsetDays + durationDays > 0,
    }
  }

  const todayOffset = differenceInDays(today, viewStart) * dayW

  const weeks: Array<{ label: string; days: Date[] }> = []
  let weekStart = viewStart
  while (weekStart <= viewEnd) {
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const wDays = eachDayOfInterval({ start: weekStart, end: wEnd < viewEnd ? wEnd : viewEnd })
    weeks.push({ label: format(weekStart, 'MMM d'), days: wDays })
    weekStart = addDays(wEnd, 1)
  }

  const labelWidth = 260

  // Inline helpers — NOT component definitions (avoids React unmount/remount on each render)
  function renderChartHeader() {
    return (
      <div className="flex sticky top-0 z-10 bg-background border-b border-border">
        <div style={{ width: labelWidth, minWidth: labelWidth }} className="shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
          {viewMode === 'projects' ? 'Project' : 'Task'}
        </div>
        <div className="flex">
          {weeks.map((week, wi) => (
            <div key={wi} className="border-r border-border last:border-r-0">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-b border-border bg-muted/30 whitespace-nowrap" style={{ width: week.days.length * dayW }}>
                {week.label}
              </div>
              <div className="flex">
                {week.days.map((day) => (
                  <div
                    key={day.toISOString()}
                    style={{ width: dayW }}
                    className={`text-center text-[10px] py-1 border-r border-border last:border-r-0 ${
                      isSameDay(day, today) ? 'bg-blue-100 text-blue-700 font-bold dark:bg-blue-900' :
                      isWeekend(day) ? 'bg-muted/50 text-muted-foreground/50' : 'text-muted-foreground'
                    }`}
                  >
                    {dayW >= 24 ? day.getDate() : ''}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderChartBackground() {
    return (
      <>
        {days.map((day, di) =>
          isWeekend(day) ? (
            <div key={di} className="absolute top-0 bottom-0 bg-muted/30" style={{ left: di * dayW, width: dayW }} />
          ) : null
        )}
        {todayOffset >= 0 && todayOffset <= days.length * dayW && (
          <div className="absolute top-0 bottom-0 w-px bg-blue-500 z-10" style={{ left: todayOffset }} />
        )}
      </>
    )
  }

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Gantt View</h1>
          <p className="text-muted-foreground text-sm">
            {viewMode === 'projects'
              ? `${sortedProjects.length} project${sortedProjects.length !== 1 ? 's' : ''} · sorted by priority`
              : (
                <>
                  {taskRows.filter((r) => r.type === 'task').length} tasks on chart
                  {tasksWithoutDates.length > 0 && (
                    <span className="ml-1 text-orange-500">· {tasksWithoutDates.length} without dates (below)</span>
                  )}
                </>
              )
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${viewMode === 'tasks' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => setViewMode('tasks')}
            >
              <LayoutList className="h-3.5 w-3.5" /> Tasks
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 border-l border-border transition-colors ${viewMode === 'projects' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              onClick={() => setViewMode('projects')}
            >
              <FolderKanban className="h-3.5 w-3.5" /> Projects
            </button>
          </div>

          {/* Project filter (only shown in tasks mode) */}
          {viewMode === 'tasks' && (
            <Select value={selectedProject} onValueChange={(v) => setSelectedProject(v ?? 'ALL')}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Projects</SelectItem>
                {projects.filter(p => p.name !== '__direct_assignments__').map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewStart((d) => addDays(d, -30))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setViewStart(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewStart((d) => addDays(d, 30))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(z + 0.25, 2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="flex-1 rounded-lg" />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto border border-border rounded-lg">
          <div style={{ minWidth: labelWidth + days.length * dayW + 'px' }}>
            {renderChartHeader()}

            {/* ── PROJECTS MODE ── */}
            {viewMode === 'projects' && (
              sortedProjects.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                  No projects to display
                </div>
              ) : sortedProjects.map((proj) => {
                const isActive = proj.startDate && proj.endDate
                  && new Date(proj.startDate) <= today && new Date(proj.endDate) >= today
                const taskCount = taskCountByProjId.get(proj.id) ?? 0

                return (
                  <div
                    key={proj.id}
                    className="flex border-b border-border hover:bg-muted/20 transition-colors"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Label */}
                    <div
                      style={{ width: labelWidth, minWidth: labelWidth }}
                      className="shrink-0 border-r border-border flex items-center gap-2 px-3 overflow-hidden"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-semibold truncate">{proj.name}</span>
                          {isActive && <span className="text-[10px] font-medium text-green-600 shrink-0">● LIVE</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {proj.priority && (
                            <Badge
                              className={`text-[10px] px-1 py-0 h-4 shrink-0 border ${PRIORITY_BADGE[proj.priority] ?? ''}`}
                              variant="outline"
                            >
                              {proj.priority}
                            </Badge>
                          )}
                          <span className="text-[11px] text-muted-foreground truncate">
                            {PROJECT_STATUS_LABEL[proj.status] ?? proj.status}
                            {taskCount > 0 && ` · ${taskCount}t`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Chart area */}
                    <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
                      {renderChartBackground()}
                      {proj.startDate && proj.endDate && (() => {
                        const { left, width, visible } = getBarProps(proj.startDate, proj.endDate)
                        if (!visible || width <= 0) return null
                        const barColor = PROJECT_STATUS_BG[proj.status] ?? 'bg-slate-400'
                        return (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 rounded ${barColor} text-white`}
                            style={{
                              left: Math.max(0, left),
                              width: Math.min(width, days.length * dayW - Math.max(0, left)),
                              height: 24,
                            }}
                            title={`${proj.name} · ${proj.status}${proj.priority ? ` · ${proj.priority}` : ''}`}
                          >
                            <span className="px-2 text-xs font-medium leading-6 whitespace-nowrap truncate block">
                              {dayW >= 24 ? proj.name : ''}
                            </span>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )
              })
            )}

            {/* ── TASKS MODE ── */}
            {viewMode === 'tasks' && (
              taskRows.length === 0 ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                  No tasks with date ranges to display
                </div>
              ) : taskRows.map((row, ri) => (
                <div
                  key={ri}
                  className={`flex border-b border-border hover:bg-muted/20 transition-colors ${
                    row.type === 'project' ? 'bg-muted/40' : row.type === 'workstream' ? 'bg-muted/20' : ''
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Label */}
                  <div
                    style={{ width: labelWidth, minWidth: labelWidth, paddingLeft: 8 + row.depth * 12 }}
                    className="shrink-0 border-r border-border flex items-center gap-2 overflow-hidden"
                  >
                    <span className={`text-sm truncate ${
                      row.type === 'project' ? 'font-bold' :
                      row.type === 'workstream' ? 'font-medium text-muted-foreground' : ''
                    }`}>
                      {row.label}
                    </span>
                    {row.task?.owner && (
                      <span className="text-xs text-muted-foreground/60 truncate shrink-0">
                        {row.task.owner.name.split(' ')[0]}
                      </span>
                    )}
                  </div>

                  {/* Chart area */}
                  <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
                    {renderChartBackground()}
                    {row.task?.startDate && row.task?.endDate && (() => {
                      const { left, width, visible } = getBarProps(row.task.startDate, row.task.endDate)
                      if (!visible || width <= 0) return null
                      return (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 rounded ${TASK_STATUS_BG[row.task.status]} text-white`}
                          style={{
                            left: Math.max(0, left),
                            width: Math.min(width, days.length * dayW - Math.max(0, left)),
                            height: 22,
                          }}
                          title={`${row.task.name} · ${row.task.status}`}
                        >
                          <span className="px-2 text-xs font-medium leading-[22px] whitespace-nowrap truncate block">
                            {dayW >= 28 ? row.task.name : ''}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tasks without dates — only shown in tasks mode */}
      {!loading && viewMode === 'tasks' && tasksWithoutDates.length > 0 && (
        <div className="mt-3 shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
            Tasks without dates — assign start/end dates to place them on the chart
          </p>
          <div className="border border-border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
            {tasksWithoutDates.map((task) => {
              const projName = task.workstream.project.name === '__direct_assignments__'
                ? 'Direct Assignment'
                : task.workstream.project.name
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${TASK_STATUS_BG[task.status] || 'bg-slate-400'}`} />
                  <span className="text-sm flex-1 truncate">{task.name}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {projName} · {task.workstream.name}
                  </span>
                  {task.owner && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {task.owner.name.split(' ')[0]}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 shrink-0">
                    {task.status}
                  </Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Projects without dates — only shown in projects mode */}
      {!loading && viewMode === 'projects' && (() => {
        const noDates = sortedProjects.filter(p => !p.startDate || !p.endDate)
        if (noDates.length === 0) return null
        return (
          <div className="mt-3 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
              Projects without date ranges (not shown on chart)
            </p>
            <div className="border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {noDates.map(proj => (
                <div key={proj.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/20">
                  <span className="text-sm flex-1 truncate font-medium">{proj.name}</span>
                  {proj.priority && (
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${PRIORITY_BADGE[proj.priority] ?? ''}`} variant="outline">
                      {proj.priority}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 shrink-0">
                    {PROJECT_STATUS_LABEL[proj.status] ?? proj.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
