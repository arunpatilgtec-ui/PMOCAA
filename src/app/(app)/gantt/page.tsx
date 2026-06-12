'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { format, eachDayOfInterval, startOfWeek, endOfWeek, addDays, differenceInDays, isSameDay, isWeekend, startOfMonth, endOfMonth, eachWeekOfInterval } from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string
  owner?: { id: string; name: string }
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

interface Project { id: string; name: string; startDate: string; endDate: string; status: string }

const TASK_STATUS_BG: Record<string, string> = {
  BACKLOG: 'bg-slate-400', PLANNED: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500', REVIEW: 'bg-purple-500',
  COMPLETED: 'bg-green-500', CANCELLED: 'bg-red-400',
}

const ROW_HEIGHT = 36
const DAY_WIDTH = 32

export default function GanttPage() {
  const { user } = useAuthStore()
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')

  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId || 'ALL')
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d
  })
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    async function load() {
      try {
        const [taskRes, projRes] = await Promise.all([
          fetch(`/api/tasks${selectedProject && selectedProject !== 'ALL' ? `?projectId=${selectedProject}` : ''}`),
          fetch('/api/projects'),
        ])
        const [taskData, projData] = await Promise.all([taskRes.json(), projRes.json()])
        setTasks(Array.isArray(taskData) ? taskData : [])
        setProjects(Array.isArray(projData) ? projData : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedProject])

  const dayW = Math.round(DAY_WIDTH * zoom)
  const viewEnd = addDays(viewStart, 90)
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd })
  const today = new Date()

  const tasksWithDates = tasks.filter((t) => t.startDate && t.endDate)

  // Group by project then workstream
  const grouped = new Map<string, Map<string, Task[]>>()
  for (const task of tasksWithDates) {
    const proj = task.workstream.project.name
    const ws = task.workstream.name
    if (!grouped.has(proj)) grouped.set(proj, new Map())
    const projMap = grouped.get(proj)!
    if (!projMap.has(ws)) projMap.set(ws, [])
    projMap.get(ws)!.push(task)
  }

  const rows: Array<{ type: 'project' | 'workstream' | 'task'; label: string; task?: Task; depth: number }> = []
  for (const [projName, wsMap] of grouped) {
    rows.push({ type: 'project', label: projName, depth: 0 })
    for (const [wsName, wsTasks] of wsMap) {
      rows.push({ type: 'workstream', label: wsName, depth: 1 })
      for (const task of wsTasks) {
        rows.push({ type: 'task', label: task.name, task, depth: 2 })
      }
    }
  }

  function getBarProps(task: Task) {
    const start = new Date(task.startDate!)
    const end = new Date(task.endDate!)
    const offsetDays = differenceInDays(start, viewStart)
    const durationDays = Math.max(1, differenceInDays(end, start) + 1)
    return {
      left: offsetDays * dayW,
      width: durationDays * dayW - 2,
      visible: offsetDays < days.length && offsetDays + durationDays > 0,
    }
  }

  const todayOffset = differenceInDays(today, viewStart) * dayW

  // Group days into weeks
  const weeks: Array<{ label: string; days: Date[] }> = []
  let weekStart = viewStart
  while (weekStart <= viewEnd) {
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const wDays = eachDayOfInterval({ start: weekStart, end: wEnd < viewEnd ? wEnd : viewEnd })
    weeks.push({ label: format(weekStart, 'MMM d'), days: wDays })
    weekStart = addDays(wEnd, 1)
  }

  const labelWidth = 240

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Gantt View</h1>
          <p className="text-muted-foreground text-sm">{rows.filter((r) => r.type === 'task').length} tasks with dates</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
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
        <div className="flex-1 overflow-auto border border-border rounded-lg">
          <div style={{ minWidth: labelWidth + days.length * dayW + 'px' }}>
            {/* Week headers */}
            <div className="flex sticky top-0 z-10 bg-background border-b border-border">
              <div style={{ width: labelWidth, minWidth: labelWidth }} className="shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
                Task
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

            {/* Rows */}
            {rows.length === 0 ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                No tasks with date ranges to display
              </div>
            ) : rows.map((row, ri) => (
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
                  {/* Weekend backgrounds */}
                  {days.map((day, di) =>
                    isWeekend(day) ? (
                      <div
                        key={di}
                        className="absolute top-0 bottom-0 bg-muted/30"
                        style={{ left: di * dayW, width: dayW }}
                      />
                    ) : null
                  )}

                  {/* Today line */}
                  {todayOffset >= 0 && todayOffset <= days.length * dayW && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-blue-500 z-10"
                      style={{ left: todayOffset }}
                    />
                  )}

                  {/* Task bar */}
                  {row.task?.startDate && row.task?.endDate && (() => {
                    const { left, width, visible } = getBarProps(row.task)
                    if (!visible || width <= 0) return null
                    return (
                      <div
                        className={`absolute top-1/2 -translate-y-1/2 rounded gantt-bar ${TASK_STATUS_BG[row.task.status]} text-white`}
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
