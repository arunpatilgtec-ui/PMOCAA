'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  addDays, differenceInCalendarDays, format, isSameDay, isWeekend,
  eachDayOfInterval, endOfWeek, startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Calendar } from 'lucide-react'

interface TaskOwner { id: string; name: string }
interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string
  owner?: TaskOwner
}
interface Workstream {
  id: string; name: string; tasks: Task[]
}
interface Project {
  id: string; startDate: string; endDate: string
  workstreams: Workstream[]
}

const STATUS_BG: Record<string, string> = {
  BACKLOG: 'bg-slate-400',
  PLANNED: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500',
  REVIEW: 'bg-purple-500',
  REWORK: 'bg-orange-500',
  COMPLETED: 'bg-green-500',
  CANCELLED: 'bg-red-400',
}

const STATUS_HOVER: Record<string, string> = {
  BACKLOG: 'hover:bg-slate-500',
  PLANNED: 'hover:bg-blue-600',
  IN_PROGRESS: 'hover:bg-yellow-600',
  REVIEW: 'hover:bg-purple-600',
  REWORK: 'hover:bg-orange-600',
  COMPLETED: 'hover:bg-green-600',
  CANCELLED: 'hover:bg-red-500',
}

const LABEL_W = 220
const ROW_H = 34
const HEADER_H = 52

type DragType = 'move' | 'resize-left' | 'resize-right'

interface DragState {
  taskId: string
  type: DragType
  startX: number
  origStart: Date
  origEnd: Date
}

export function ProjectGanttView({
  project,
  onRefresh,
}: {
  project: Project
  onRefresh: () => void
}) {
  const { user } = useAuthStore()
  const canEditDates = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)

  const [dayW, setDayW] = useState(28)
  const [viewStart, setViewStart] = useState(() => {
    const d = new Date(project.startDate)
    d.setDate(1)
    return d
  })
  const [dragging, setDragging] = useState<DragState | null>(null)
  const [dragDeltaDays, setDragDeltaDays] = useState(0)
  const [saving, setSaving] = useState(false)

  const chartRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)

  const today = new Date()
  const viewEnd = addDays(viewStart, Math.ceil(700 / dayW))
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd })

  // Week headers
  const weeks: Array<{ label: string; days: Date[] }> = []
  let wk = startOfWeek(viewStart, { weekStartsOn: 1 })
  while (wk <= viewEnd) {
    const wEnd = endOfWeek(wk, { weekStartsOn: 1 })
    const wDays = days.filter((d) => d >= wk && d <= wEnd)
    if (wDays.length > 0) weeks.push({ label: format(wk, 'MMM d'), days: wDays })
    wk = addDays(wEnd, 1)
  }

  const allRows: Array<{ type: 'ws' | 'task'; ws: Workstream; task?: Task }> = []
  for (const ws of project.workstreams) {
    allRows.push({ type: 'ws', ws })
    for (const task of ws.tasks) {
      allRows.push({ type: 'task', ws, task })
    }
  }

  function getBarStyle(task: Task): { left: number; width: number; visible: boolean } {
    if (!task.startDate || !task.endDate) return { left: 0, width: 0, visible: false }
    const s = new Date(task.startDate)
    const e = new Date(task.endDate)
    const left = differenceInCalendarDays(s, viewStart) * dayW
    const width = Math.max(dayW, (differenceInCalendarDays(e, s) + 1) * dayW - 2)
    const visible = left < days.length * dayW && left + width > 0
    return { left, width, visible }
  }

  function getDragAdjustedBar(task: Task) {
    if (!dragging || dragging.taskId !== task.id) return getBarStyle(task)
    const { type, origStart, origEnd } = dragging
    const delta = dragDeltaDays
    let s = new Date(origStart)
    let e = new Date(origEnd)
    if (type === 'move') { s = addDays(s, delta); e = addDays(e, delta) }
    else if (type === 'resize-left') { s = addDays(s, delta) }
    else if (type === 'resize-right') { e = addDays(e, delta) }
    // clamp: start <= end
    if (s > e) { if (type === 'resize-left') s = e; else e = s }
    const left = differenceInCalendarDays(s, viewStart) * dayW
    const width = Math.max(dayW, (differenceInCalendarDays(e, s) + 1) * dayW - 2)
    const visible = left < days.length * dayW && left + width > 0
    return { left, width, visible }
  }

  const handlePointerDown = useCallback((
    e: React.PointerEvent,
    task: Task,
    type: DragType,
  ) => {
    if (!canEditDates) return
    if (!task.startDate || !task.endDate) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const state: DragState = {
      taskId: task.id,
      type,
      startX: e.clientX,
      origStart: new Date(task.startDate),
      origEnd: new Date(task.endDate),
    }
    dragRef.current = state
    setDragging(state)
    setDragDeltaDays(0)
  }, [canEditDates])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const delta = Math.round(dx / dayW)
    setDragDeltaDays(delta)
  }, [dayW])

  const handlePointerUp = useCallback(async (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null

    const dx = e.clientX - drag.startX
    const delta = Math.round(dx / dayW)

    let newStart = new Date(drag.origStart)
    let newEnd = new Date(drag.origEnd)

    if (drag.type === 'move') {
      newStart = addDays(newStart, delta)
      newEnd = addDays(newEnd, delta)
    } else if (drag.type === 'resize-left') {
      newStart = addDays(newStart, delta)
      if (newStart > newEnd) newStart = newEnd
    } else if (drag.type === 'resize-right') {
      newEnd = addDays(newEnd, delta)
      if (newEnd < newStart) newEnd = newStart
    }

    // Only save if dates actually changed
    const origS = drag.origStart.toISOString().slice(0, 10)
    const origE = drag.origEnd.toISOString().slice(0, 10)
    const newS = newStart.toISOString().slice(0, 10)
    const newE = newEnd.toISOString().slice(0, 10)

    setDragging(null)
    setDragDeltaDays(0)

    if (newS === origS && newE === origE) return

    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${drag.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: newS, endDate: newE }),
      })
      if (!res.ok) throw new Error()
      onRefresh()
    } catch {
      toast.error('Failed to update task dates')
    } finally {
      setSaving(false)
    }
  }, [dayW, onRefresh])

  const todayOffset = differenceInCalendarDays(today, viewStart) * dayW

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setViewStart((d) => addDays(d, -30))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
          const d = new Date(); d.setDate(1); setViewStart(d)
        }}>
          <Calendar className="h-3 w-3 mr-1" /> Today
        </Button>
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setViewStart((d) => addDays(d, 30))}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1 ml-2">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setDayW((w) => Math.max(14, w - 4))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">{dayW}px/day</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setDayW((w) => Math.min(56, w + 4))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
        {canEditDates && !saving && (
          <span className="text-xs text-muted-foreground ml-auto">Drag bars to move · drag edges to resize</span>
        )}
      </div>

      {/* Gantt chart */}
      <div className="border rounded-lg overflow-hidden flex-1">
        <div
          className="overflow-auto"
          style={{ maxHeight: '60vh' }}
          ref={chartRef}
          onPointerMove={dragging ? handlePointerMove : undefined}
          onPointerUp={dragging ? handlePointerUp : undefined}
        >
          {/* Sticky header */}
          <div className="flex sticky top-0 z-20 bg-background border-b">
            {/* Label column header */}
            <div style={{ width: LABEL_W, minWidth: LABEL_W, height: HEADER_H }} className="shrink-0 border-r bg-muted/50 px-3 flex items-end pb-1 text-xs font-medium text-muted-foreground">
              Task
            </div>
            {/* Week/day headers */}
            <div className="flex shrink-0">
              {weeks.map((week, wi) => (
                <div key={wi} className="border-r last:border-0">
                  <div
                    className="px-2 py-1 text-xs font-medium text-muted-foreground border-b bg-muted/30 whitespace-nowrap"
                    style={{ width: week.days.length * dayW }}
                  >
                    {week.label}
                  </div>
                  <div className="flex">
                    {week.days.map((day) => (
                      <div
                        key={day.toISOString()}
                        style={{ width: dayW }}
                        className={`text-center text-[10px] py-0.5 border-r last:border-0 ${
                          isSameDay(day, today) ? 'bg-blue-100 text-blue-700 font-bold dark:bg-blue-950' :
                          isWeekend(day) ? 'bg-muted/60 text-muted-foreground/40' : 'text-muted-foreground'
                        }`}
                      >
                        {dayW >= 20 ? day.getDate() : ''}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          {allRows.map((row, rowIdx) => {
            if (row.type === 'ws') {
              return (
                <div key={`ws-${row.ws.id}`} className="flex border-b bg-muted/20">
                  <div
                    style={{ width: LABEL_W, minWidth: LABEL_W, height: ROW_H }}
                    className="shrink-0 border-r px-3 flex items-center text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {row.ws.name}
                  </div>
                  <div className="relative flex-1" style={{ height: ROW_H }}>
                    {/* Background stripes */}
                    {days.map((day, di) =>
                      isWeekend(day) ? (
                        <div key={di} className="absolute top-0 bottom-0 bg-muted/40" style={{ left: di * dayW, width: dayW }} />
                      ) : null
                    )}
                    {/* Today line */}
                    {todayOffset >= 0 && (
                      <div className="absolute top-0 bottom-0 w-px bg-blue-500/60 z-10" style={{ left: todayOffset }} />
                    )}
                  </div>
                </div>
              )
            }

            const task = row.task!
            const { left, width, visible } = getDragAdjustedBar(task)
            const isDragging = dragging?.taskId === task.id

            return (
              <div
                key={`task-${task.id}`}
                className="flex border-b hover:bg-muted/10 transition-colors"
              >
                {/* Label */}
                <div
                  style={{ width: LABEL_W, minWidth: LABEL_W, height: ROW_H }}
                  className="shrink-0 border-r px-3 flex items-center gap-2 text-xs overflow-hidden"
                >
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_BG[task.status] || 'bg-slate-400'}`} />
                  <span className="truncate" title={task.name}>{task.name}</span>
                  {task.owner && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground truncate max-w-[60px]">
                      {task.owner.name.split(' ')[0]}
                    </span>
                  )}
                </div>

                {/* Timeline area */}
                <div
                  className="relative flex-1 select-none"
                  style={{ height: ROW_H }}
                >
                  {/* Background */}
                  {days.map((day, di) =>
                    isWeekend(day) ? (
                      <div key={di} className="absolute top-0 bottom-0 bg-muted/40" style={{ left: di * dayW, width: dayW }} />
                    ) : null
                  )}
                  {todayOffset >= 0 && (
                    <div className="absolute top-0 bottom-0 w-px bg-blue-500/60 z-10" style={{ left: todayOffset }} />
                  )}

                  {/* Task bar */}
                  {visible && (
                    <div
                      className={`absolute top-2 bottom-2 rounded flex items-center text-white text-[10px] font-medium overflow-hidden transition-opacity ${STATUS_BG[task.status]} ${STATUS_HOVER[task.status]} ${isDragging ? 'opacity-80 shadow-lg ring-2 ring-white/40 cursor-grabbing' : canEditDates ? 'cursor-grab' : 'cursor-default'}`}
                      style={{ left: Math.max(0, left), width }}
                    >
                      {/* Left resize handle */}
                      {canEditDates && (
                        <div
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-black/20"
                          onPointerDown={(e) => handlePointerDown(e, task, 'resize-left')}
                        />
                      )}

                      {/* Drag area (middle) */}
                      <div
                        className="flex-1 px-2 py-1 overflow-hidden whitespace-nowrap select-none"
                        onPointerDown={canEditDates ? (e) => handlePointerDown(e, task, 'move') : undefined}
                        style={{ cursor: canEditDates ? 'grab' : 'default' }}
                      >
                        {width > 60 && task.name}
                      </div>

                      {/* Right resize handle */}
                      {canEditDates && (
                        <div
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-20 hover:bg-black/20"
                          onPointerDown={(e) => handlePointerDown(e, task, 'resize-right')}
                        />
                      )}
                    </div>
                  )}

                  {/* No dates placeholder */}
                  {!task.startDate && (
                    <div className="absolute inset-y-0 left-2 flex items-center">
                      <span className="text-[10px] text-muted-foreground/50">no dates</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {Object.entries(STATUS_BG).map(([status, bg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded ${bg}`} />
            <span className="text-xs text-muted-foreground capitalize">{status.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
        ))}
        {!canEditDates && (
          <span className="ml-auto text-xs text-muted-foreground">Only planners can edit dates</span>
        )}
      </div>
    </div>
  )
}
