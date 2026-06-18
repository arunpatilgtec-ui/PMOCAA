'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  format, addDays, differenceInDays, eachDayOfInterval,
  endOfWeek, isSameDay, isWeekend,
} from 'date-fns'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  LayoutList, FolderKanban, X, Save, Search,
  GripHorizontal, Lock, AlertTriangle,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'

interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string; pctComplete?: number
  ownerId?: string
  owner?: { id: string; name: string }
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

interface User {
  id: string; name: string; role: string; isActive: boolean
  department?: string
}

interface Project {
  id: string; name: string
  startDate?: string; endDate?: string
  status: string; priority?: string
  description?: string
  planStatus?: string
  leadId?: string | null
}

interface EditForm {
  taskId: string; name: string; status: string
  startDate: string; endDate: string; ownerId: string
  projName: string; wsName: string
}

const STATUS_OPTIONS = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'REWORK', 'COMPLETED', 'CANCELLED']
const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', PLANNED: 'Planned', IN_PROGRESS: 'In Progress',
  REVIEW: 'Review', REWORK: 'Rework', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}
const TASK_STATUS_BG: Record<string, string> = {
  BACKLOG: 'bg-slate-400', PLANNED: 'bg-blue-500', IN_PROGRESS: 'bg-yellow-500',
  REVIEW: 'bg-purple-500', REWORK: 'bg-orange-500', COMPLETED: 'bg-green-500',
  CANCELLED: 'bg-red-400',
}
const PROJECT_STATUS_BG: Record<string, string> = {
  PLANNING: 'bg-blue-400', ACTIVE: 'bg-green-500', IN_PROGRESS: 'bg-green-500',
  ON_HOLD: 'bg-yellow-500', COMPLETED: 'bg-emerald-600', CANCELLED: 'bg-red-400',
}
const PROJECT_STATUS_LABEL: Record<string, string> = {
  PLANNING: 'Planning', ACTIVE: 'Active', IN_PROGRESS: 'Active',
  ON_HOLD: 'On Hold', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200', HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200', LOW: 'bg-slate-50 text-slate-600 border-slate-200',
}
const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Manager', PLANNER: 'Planner',
  PROJECT_LEAD: 'Project Lead', WORKSTREAM_LEAD: 'WS Lead',
  RESOURCE: 'Engineer/Analyst', LEADERSHIP: 'Leadership',
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
  const [localTasks, setLocalTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('tasks')
  const [selectedProject, setSelectedProject] = useState<string>(projectId || 'ALL')
  const [ownerFilter, setOwnerFilter] = useState<string>(searchParams.get('owner') ?? 'ALL')
  const [viewStart, setViewStart] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [zoom, setZoom] = useState(1)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const chartScrollRef = useRef<HTMLDivElement>(null)

  // Refs for drag (avoids stale closures in global listeners)
  const dragRef = useRef<{
    taskId: string; type: 'move' | 'resize'
    startX: number; origStart: string; origEnd: string
    currentStart: string; currentEnd: string; moved: boolean
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const zoomRef = useRef(zoom)
  const canEditRef = useRef(false)
  const localTasksRef = useRef<Task[]>([])
  const userRef = useRef(user)
  const projectsRef = useRef<Project[]>([])

  useEffect(() => { zoomRef.current = zoom }, [zoom])
  useEffect(() => {
    userRef.current = user
    canEditRef.current = !!(user && ['ADMIN', 'PLANNER', 'PROJECT_LEAD'].includes(user.role))
  }, [user])
  useEffect(() => { localTasksRef.current = localTasks }, [localTasks])
  useEffect(() => { projectsRef.current = projects }, [projects])

  // Can this user edit tasks in a specific project?
  function taskIsEditable(task: Task): boolean {
    if (!user) return false
    if (['ADMIN', 'PLANNER'].includes(user.role)) return true
    if (user.role === 'PROJECT_LEAD') {
      const proj = projects.find(p => p.id === task.workstream.project.id)
      return proj?.leadId === user.id
    }
    return false
  }

  const canEdit = !!(user && ['ADMIN', 'PLANNER', 'PROJECT_LEAD'].includes(user.role))

  // Load tasks + projects
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
        const taskArr = Array.isArray(taskData) ? taskData : []
        setTasks(taskArr)
        setLocalTasks(taskArr)
        localTasksRef.current = taskArr
        setProjects(Array.isArray(projData) ? projData : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [selectedProject])

  // Auto-scroll to today when chart first loads
  useEffect(() => {
    if (!loading && chartScrollRef.current) {
      const dayW = Math.round(DAY_WIDTH * zoom)
      const todayOff = differenceInDays(new Date(), viewStart) * dayW
      const chartAreaWidth = chartScrollRef.current.clientWidth - labelWidth
      // Put today at the left quarter of the chart area so future tasks are visible
      const scrollTo = Math.max(0, todayOff - chartAreaWidth / 4)
      chartScrollRef.current.scrollLeft = scrollTo
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  // Load users once
  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(d => setUsers(Array.isArray(d) ? d.filter((u: User) => u.isActive) : []))
  }, [])

  // Global drag listeners — uses refs to avoid stale closures
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const d = dragRef.current
        if (!d) return
        const dayW = Math.round(DAY_WIDTH * zoomRef.current)
        const deltaPx = e.clientX - d.startX
        const deltaDays = Math.round(deltaPx / dayW)
        if (Math.abs(deltaPx) >= 4) d.moved = true

        const origS = new Date(d.origStart)
        const origE = new Date(d.origEnd)
        let newStart: string, newEnd: string

        if (d.type === 'move') {
          newStart = addDays(origS, deltaDays).toISOString().slice(0, 10)
          newEnd = addDays(origE, deltaDays).toISOString().slice(0, 10)
        } else {
          newStart = d.origStart
          const newEndDate = addDays(origE, deltaDays)
          newEnd = (newEndDate > origS ? newEndDate : addDays(origS, 1)).toISOString().slice(0, 10)
        }

        d.currentStart = newStart
        d.currentEnd = newEnd

        setLocalTasks(prev => prev.map(t =>
          t.id === d.taskId ? { ...t, startDate: newStart, endDate: newEnd } : t
        ))
      })
    }

    async function onMouseUp() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      const d = dragRef.current
      dragRef.current = null
      setIsDragging(false)
      if (!d) return

      const task = localTasksRef.current.find(t => t.id === d.taskId)

      if (!d.moved) {
        // Pure click → open edit panel for authorized users
        if (canEditRef.current && task) {
          setEditForm({
            taskId: task.id, name: task.name, status: task.status,
            startDate: task.startDate?.slice(0, 10) ?? '',
            endDate: task.endDate?.slice(0, 10) ?? '',
            ownerId: task.ownerId ?? '',
            projName: task.workstream.project.name,
            wsName: task.workstream.name,
          })
        }
        return
      }

      if (!task) return

      // Permission check
      const u = userRef.current
      const taskProject = projectsRef.current.find(p => p.id === task.workstream.project.id)
      const isAdminOrPlanner = u && ['ADMIN', 'PLANNER'].includes(u.role)
      const isTaskLead = u?.role === 'PROJECT_LEAD' && taskProject?.leadId === u.id

      if (!isAdminOrPlanner && !isTaskLead) {
        setLocalTasks(prev => prev.map(t =>
          t.id === d.taskId ? { ...t, startDate: d.origStart, endDate: d.origEnd } : t
        ))
        toast.error('Only the project lead, planner, or admin can edit this plan')
        return
      }

      const isLocked = taskProject && taskProject.planStatus !== 'DRAFT'

      if (isLocked) {
        const projStart = taskProject?.startDate ? new Date(taskProject.startDate) : null
        const projEnd = taskProject?.endDate ? new Date(taskProject.endDate) : null
        const newStart = new Date(d.currentStart)
        const newEnd = new Date(d.currentEnd)
        const extendsBounds = projStart && projEnd && (newStart < projStart || newEnd > projEnd)

        if (extendsBounds) {
          // Revert visual state — change goes for approval
          setLocalTasks(prev => prev.map(t =>
            t.id === d.taskId ? { ...t, startDate: d.origStart, endDate: d.origEnd } : t
          ))
          try {
            const res = await fetch('/api/schedule-changes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                changeType: 'TIMELINE_CHANGE_REQUESTED',
                description: `Task "${task.name}" proposes dates outside the committed project timeline`,
                projectId: task.workstream.project.id,
                affectedTaskIds: [d.taskId],
                currentData: { startDate: d.origStart, endDate: d.origEnd },
                proposedData: {
                  startDate: d.currentStart,
                  endDate: d.currentEnd,
                  ...(projStart && newStart < projStart ? { projectStartDate: d.currentStart } : {}),
                  ...(projEnd && newEnd > projEnd ? { projectEndDate: d.currentEnd } : {}),
                },
              }),
            })
            if (res.ok) {
              toast.info('Change submitted for planner approval — dates will update once approved')
            } else {
              toast.error('Failed to submit change request')
            }
          } catch {
            toast.error('Failed to submit change request')
          }
        } else {
          // Within project bounds — apply directly
          try {
            const res = await fetch(`/api/tasks/${d.taskId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ startDate: d.currentStart, endDate: d.currentEnd }),
            })
            if (!res.ok) {
              setLocalTasks(prev => prev.map(t =>
                t.id === d.taskId ? { ...t, startDate: d.origStart, endDate: d.origEnd } : t
              ))
              toast.error('Failed to update task dates')
            }
          } catch {
            setLocalTasks(prev => prev.map(t =>
              t.id === d.taskId ? { ...t, startDate: d.origStart, endDate: d.origEnd } : t
            ))
            toast.error('Failed to update task dates')
          }
        }
      } else {
        // Plan is DRAFT — save directly
        try {
          const res = await fetch(`/api/tasks/${d.taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: d.currentStart, endDate: d.currentEnd }),
          })
          if (!res.ok) {
            setLocalTasks(prev => prev.map(t =>
              t.id === d.taskId ? { ...t, startDate: d.origStart, endDate: d.origEnd } : t
            ))
            toast.error('Failed to update task dates')
          }
        } catch {
          setLocalTasks(prev => prev.map(t =>
            t.id === d.taskId ? { ...t, startDate: d.origStart, endDate: d.origEnd } : t
          ))
          toast.error('Failed to update task dates')
        }
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, []) // empty deps — uses refs

  function startDrag(e: React.MouseEvent, taskId: string, type: 'move' | 'resize') {
    const t = localTasksRef.current.find(tt => tt.id === taskId)
    if (!t || !taskIsEditable(t)) return
    e.stopPropagation()
    e.preventDefault()
    const task = localTasksRef.current.find(t => t.id === taskId)
    if (!task?.startDate || !task?.endDate) return
    dragRef.current = {
      taskId, type, startX: e.clientX,
      origStart: task.startDate, origEnd: task.endDate,
      currentStart: task.startDate, currentEnd: task.endDate,
      moved: false,
    }
    setIsDragging(true)
  }

  async function saveEdit() {
    if (!editForm) return
    setEditSaving(true)
    try {
      const task = localTasks.find(t => t.id === editForm.taskId)
      const taskProject = projects.find(p => p.id === task?.workstream.project.id)

      // Permission check
      const isAdminOrPlanner = user && ['ADMIN', 'PLANNER'].includes(user.role)
      const isTaskLead = user?.role === 'PROJECT_LEAD' && taskProject?.leadId === user.id
      if (!isAdminOrPlanner && !isTaskLead) {
        toast.error('Only the project lead, planner, or admin can edit this plan')
        return
      }

      const isLocked = taskProject && taskProject.planStatus !== 'DRAFT'
      const origTask = tasks.find(t => t.id === editForm.taskId)
      const origStart = origTask?.startDate?.slice(0, 10) ?? ''
      const origEnd = origTask?.endDate?.slice(0, 10) ?? ''
      const datesChanging = editForm.startDate !== origStart || editForm.endDate !== origEnd

      // Check if new dates extend project bounds
      let needsApproval = false
      if (isLocked && datesChanging && editForm.startDate && editForm.endDate) {
        const projStart = taskProject?.startDate ? new Date(taskProject.startDate) : null
        const projEnd = taskProject?.endDate ? new Date(taskProject.endDate) : null
        const newStart = new Date(editForm.startDate)
        const newEnd = new Date(editForm.endDate)
        needsApproval = !!(projStart && projEnd && (newStart < projStart || newEnd > projEnd))
      }

      if (needsApproval) {
        // Save non-date fields immediately; submit date change for approval
        const nonDateRes = await fetch(`/api/tasks/${editForm.taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editForm.name, status: editForm.status, ownerId: editForm.ownerId || null }),
        })
        const projStart = taskProject?.startDate ? new Date(taskProject.startDate) : null
        const projEnd = taskProject?.endDate ? new Date(taskProject.endDate) : null
        const newStart = new Date(editForm.startDate)
        const newEnd = new Date(editForm.endDate)
        await fetch('/api/schedule-changes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changeType: 'TIMELINE_CHANGE_REQUESTED',
            description: `Task "${editForm.name}" proposes dates outside the committed project timeline`,
            projectId: task?.workstream.project.id,
            affectedTaskIds: [editForm.taskId],
            currentData: { startDate: origTask?.startDate, endDate: origTask?.endDate },
            proposedData: {
              startDate: editForm.startDate,
              endDate: editForm.endDate,
              ...(projStart && newStart < projStart ? { projectStartDate: editForm.startDate } : {}),
              ...(projEnd && newEnd > projEnd ? { projectEndDate: editForm.endDate } : {}),
            },
          }),
        })
        if (nonDateRes.ok) {
          const updated = await nonDateRes.json()
          const patch = { name: updated.name, status: updated.status, ownerId: updated.ownerId ?? undefined, owner: updated.owner }
          setLocalTasks(prev => prev.map(t => t.id === editForm.taskId ? { ...t, ...patch } : t))
          setTasks(prev => prev.map(t => t.id === editForm.taskId ? { ...t, ...patch } : t))
        }
        toast.info('Date change submitted for planner approval')
        setEditForm(null)
        setUserSearch('')
      } else {
        // Apply everything directly
        const res = await fetch(`/api/tasks/${editForm.taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: editForm.name,
            status: editForm.status,
            startDate: editForm.startDate || null,
            endDate: editForm.endDate || null,
            ownerId: editForm.ownerId || null,
          }),
        })
        if (!res.ok) { toast.error('Failed to save task'); return }
        const updated = await res.json()
        const patch = {
          name: updated.name, status: updated.status,
          startDate: updated.startDate ? (updated.startDate as string).slice(0, 10) : undefined,
          endDate: updated.endDate ? (updated.endDate as string).slice(0, 10) : undefined,
          ownerId: updated.ownerId ?? undefined,
          owner: updated.owner,
        }
        setLocalTasks(prev => prev.map(t => t.id === editForm.taskId ? { ...t, ...patch } : t))
        setTasks(prev => prev.map(t => t.id === editForm.taskId ? { ...t, ...patch } : t))
        toast.success('Task saved')
        setEditForm(null)
        setUserSearch('')
      }
    } finally {
      setEditSaving(false)
    }
  }

  const dayW = Math.round(DAY_WIDTH * zoom)
  const viewEnd = addDays(viewStart, 90)
  const days = eachDayOfInterval({ start: viewStart, end: viewEnd })
  const today = new Date()

  const ownerFilteredTasks = ownerFilter && ownerFilter !== 'ALL'
    ? localTasks.filter(t => t.owner?.id === ownerFilter)
    : localTasks
  const tasksWithDates = ownerFilteredTasks.filter(t => t.startDate && t.endDate)
  const tasksWithoutDates = ownerFilteredTasks.filter(t => !t.startDate || !t.endDate)

  const grouped = new Map<string, Map<string, Task[]>>()
  for (const task of tasksWithDates) {
    const proj = task.workstream.project.name === '__direct_assignments__' ? 'Direct Assignments' : task.workstream.project.name
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
      for (const task of wsTasks) taskRows.push({ type: 'task', label: task.name, task, depth: 2 })
    }
  }

  const taskCountByProjId = new Map<string, number>()
  for (const t of localTasks) {
    const pid = t.workstream.project.id
    taskCountByProjId.set(pid, (taskCountByProjId.get(pid) ?? 0) + 1)
  }

  const sortedProjects = [...projects]
    .filter(p => p.name !== '__direct_assignments__')
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority ?? ''] ?? 0, pb = PRIORITY_RANK[b.priority ?? ''] ?? 0
      if (pb !== pa) return pb - pa
      if (a.startDate && b.startDate) return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      if (a.startDate) return -1; if (b.startDate) return 1; return 0
    })

  function getBarProps(startStr: string, endStr: string) {
    const start = new Date(startStr), end = new Date(endStr)
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

  const filteredUsers = users.filter(u => {
    const q = userSearch.toLowerCase()
    return !q || u.name.toLowerCase().includes(q) || (ROLE_LABELS[u.role] ?? '').toLowerCase().includes(q)
  })

  function renderChartHeader() {
    return (
      <div className="flex sticky top-0 z-10 bg-background border-b border-border">
        <div style={{ width: labelWidth, minWidth: labelWidth, position: 'sticky', left: 0, zIndex: 20 }} className="shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50">
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
                  <div key={day.toISOString()} style={{ width: dayW }}
                    className={`text-center text-[10px] py-1 border-r border-border last:border-r-0 ${
                      isSameDay(day, today) ? 'bg-blue-100 text-blue-700 font-bold dark:bg-blue-900' :
                      isWeekend(day) ? 'bg-muted/50 text-muted-foreground/50' : 'text-muted-foreground'
                    }`}>
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
          isWeekend(day) ? <div key={di} className="absolute top-0 bottom-0 bg-muted/30 pointer-events-none" style={{ left: di * dayW, width: dayW }} /> : null
        )}
        {todayOffset >= 0 && todayOffset <= days.length * dayW && (
          <div className="absolute top-0 bottom-0 w-px bg-blue-500 z-10 pointer-events-none" style={{ left: todayOffset }} />
        )}
      </>
    )
  }

  function renderTaskBar(task: Task) {
    if (!task.startDate || !task.endDate) return null
    const { left, width, visible } = getBarProps(task.startDate, task.endDate)
    if (!visible || width <= 0) return null
    const isEditing = editForm?.taskId === task.id
    const barBg = TASK_STATUS_BG[task.status] ?? 'bg-slate-400'
    const pct = task.pctComplete ?? 0
    const clampedLeft = Math.max(0, left)
    const clampedWidth = Math.min(width, days.length * dayW - clampedLeft)

    const editable = taskIsEditable(task)
    return (
      <div
        className={`absolute top-1/2 -translate-y-1/2 rounded overflow-hidden ${barBg} text-white select-none ${
          editable ? 'cursor-grab active:cursor-grabbing' : ''
        } ${isEditing ? 'ring-2 ring-white ring-offset-1' : ''}`}
        style={{ left: clampedLeft, width: clampedWidth, height: 24 }}
        title={`${task.name}${task.owner ? ` · ${task.owner.name}` : ''} · ${task.status}`}
        onMouseDown={editable ? (e) => startDrag(e, task.id, 'move') : undefined}
      >
        {/* Progress overlay */}
        {pct > 0 && (
          <div className="absolute inset-0 bg-black/20" style={{ left: `${pct}%` }} />
        )}
        {/* Label */}
        <span className="px-2 text-xs font-medium leading-6 whitespace-nowrap truncate block relative z-10 pr-5">
          {dayW >= 28 ? task.name : ''}
        </span>
        {/* Resize handle — right edge */}
        {editable && (
          <div
            className="absolute right-0 top-0 bottom-0 w-5 flex items-center justify-center cursor-col-resize hover:bg-black/20 z-20"
            onMouseDown={(e) => { e.stopPropagation(); startDrag(e, task.id, 'resize') }}
            title="Drag to resize"
          >
            <GripHorizontal className="h-3 w-3 text-white/60" />
          </div>
        )}
      </div>
    )
  }

  const editPanelUser = editForm ? users.find(u => u.id === editForm.ownerId) : null

  return (
    <div className={`p-6 h-full flex flex-col overflow-hidden ${isDragging ? 'select-none cursor-grabbing' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Gantt View</h1>
          <p className="text-muted-foreground text-sm">
            {viewMode === 'projects'
              ? `${sortedProjects.length} project${sortedProjects.length !== 1 ? 's' : ''} · sorted by priority`
              : (
                <>
                  {taskRows.filter(r => r.type === 'task').length} tasks on chart
                  {tasksWithoutDates.length > 0 && (
                    <span className="ml-1 text-orange-500">· {tasksWithoutDates.length} without dates</span>
                  )}
                </>
              )
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-xs font-medium">
            <button className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${viewMode === 'tasks' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} onClick={() => setViewMode('tasks')}>
              <LayoutList className="h-3.5 w-3.5" /> Tasks
            </button>
            <button className={`flex items-center gap-1.5 px-3 py-1.5 border-l border-border transition-colors ${viewMode === 'projects' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`} onClick={() => setViewMode('projects')}>
              <FolderKanban className="h-3.5 w-3.5" /> Projects
            </button>
          </div>

          {viewMode === 'tasks' && (
            <Select value={selectedProject} onValueChange={(v) => setSelectedProject(v ?? 'ALL')}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Projects</SelectItem>
                {projects.filter(p => p.name !== '__direct_assignments__').map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {viewMode === 'tasks' && (
            <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v ?? 'ALL')}>
              <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Assignees</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewStart(d => addDays(d, -30))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setViewStart(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setViewStart(d => addDays(d, 30))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.min(z + 0.25, 2))}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))}><ZoomOut className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Lock banner — shown when a specific project is selected and its plan is committed */}
      {(() => {
        const selProj = selectedProject !== 'ALL' ? projects.find(p => p.id === selectedProject) : null
        if (!selProj || selProj.planStatus === 'DRAFT' || !selProj.planStatus) return null
        return (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm shrink-0">
            <Lock className="h-4 w-4 shrink-0" />
            <span>
              Plan is <strong>{selProj.planStatus.replace('_', ' ')}</strong> — changes within the project timeline apply directly.
              Date changes that extend the overall project start/end will be sent to the planner for approval.
            </span>
          </div>
        )
      })()}

      {/* Main area + edit panel side-by-side */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* Chart */}
        <div ref={chartScrollRef} className="flex-1 min-w-0 overflow-auto border border-border rounded-lg">
          {loading ? <Skeleton className="h-full rounded-lg" /> : (
            <div style={{ minWidth: labelWidth + days.length * dayW + 'px' }}>
              {renderChartHeader()}

              {/* PROJECTS MODE */}
              {viewMode === 'projects' && (
                sortedProjects.length === 0 ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">No projects to display</div>
                ) : sortedProjects.map(proj => {
                  const isActive = proj.startDate && proj.endDate
                    && new Date(proj.startDate) <= today && new Date(proj.endDate) >= today
                  const taskCount = taskCountByProjId.get(proj.id) ?? 0
                  return (
                    <div key={proj.id} className="flex border-b border-border hover:bg-muted/20 transition-colors" style={{ height: ROW_HEIGHT }}>
                      <div style={{ width: labelWidth, minWidth: labelWidth, position: 'sticky', left: 0, zIndex: 5 }} className="shrink-0 border-r border-border flex items-center gap-2 px-3 overflow-hidden bg-background">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-semibold truncate">{proj.name}</span>
                            {isActive && <span className="text-[10px] font-medium text-green-600 shrink-0">● LIVE</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {proj.priority && (
                              <Badge className={`text-[10px] px-1 py-0 h-4 shrink-0 border ${PRIORITY_BADGE[proj.priority] ?? ''}`} variant="outline">{proj.priority}</Badge>
                            )}
                            <span className="text-[11px] text-muted-foreground truncate">
                              {PROJECT_STATUS_LABEL[proj.status] ?? proj.status}{taskCount > 0 && ` · ${taskCount}t`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
                        {renderChartBackground()}
                        {proj.startDate && proj.endDate && (() => {
                          const { left, width, visible } = getBarProps(proj.startDate, proj.endDate)
                          if (!visible || width <= 0) return null
                          const barColor = PROJECT_STATUS_BG[proj.status] ?? 'bg-slate-400'
                          return (
                            <div className={`absolute top-1/2 -translate-y-1/2 rounded ${barColor} text-white`}
                              style={{ left: Math.max(0, left), width: Math.min(width, days.length * dayW - Math.max(0, left)), height: 24 }}
                              title={`${proj.name} · ${proj.status}`}>
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

              {/* TASKS MODE */}
              {viewMode === 'tasks' && (
                taskRows.length === 0 ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">No tasks with date ranges to display</div>
                ) : taskRows.map((row, ri) => (
                  <div key={ri}
                    className={`flex border-b border-border transition-colors ${
                      row.type === 'project' ? 'bg-muted/40 hover:bg-muted/60' :
                      row.type === 'workstream' ? 'bg-muted/20 hover:bg-muted/30' : 'hover:bg-muted/10'
                    } ${editForm?.taskId === row.task?.id ? 'ring-1 ring-inset ring-blue-400' : ''}`}
                    style={{ height: ROW_HEIGHT }}>
                    <div style={{ width: labelWidth, minWidth: labelWidth, paddingLeft: 8 + row.depth * 12, position: 'sticky', left: 0, zIndex: 5 }}
                      className={`shrink-0 border-r border-border flex items-center gap-2 overflow-hidden ${
                        row.type === 'project' ? 'bg-muted/40' : row.type === 'workstream' ? 'bg-muted/20' : 'bg-background'
                      }`}>
                      <span className={`text-sm truncate flex-1 ${
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
                      {row.task?.pctComplete !== undefined && row.task.pctComplete > 0 && (
                        <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
                          {row.task.pctComplete}%
                        </span>
                      )}
                    </div>
                    <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
                      {renderChartBackground()}
                      {row.task && renderTaskBar(row.task)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Edit panel */}
        {editForm && canEdit && (
          <div className="w-80 shrink-0 border border-border rounded-lg flex flex-col bg-background overflow-hidden">
            {/* Panel header */}
            <div className="flex items-start justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs text-muted-foreground truncate">{editForm.projName} › {editForm.wsName}</p>
                <p className="text-sm font-semibold mt-0.5 truncate">{editForm.name}</p>
              </div>
              <button onClick={() => { setEditForm(null); setUserSearch('') }}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <Label className="text-xs">Task Name</Label>
                <Input
                  value={editForm.name}
                  onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)}
                  className="h-8 text-sm"
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={v => { if (v) setEditForm(f => f ? { ...f, status: v } : f) }}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${TASK_STATUS_BG[s]}`} />
                          {STATUS_LABELS[s]}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Date</Label>
                  <Input type="date" value={editForm.startDate}
                    onChange={e => setEditForm(f => f ? { ...f, startDate: e.target.value } : f)}
                    className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Date</Label>
                  <Input type="date" value={editForm.endDate}
                    onChange={e => setEditForm(f => f ? { ...f, endDate: e.target.value } : f)}
                    className="h-8 text-sm" />
                </div>
              </div>

              {/* Resource / Owner — only shown to users who can reassign */}
              {(() => {
                const editTask = editForm ? localTasks.find(t => t.id === editForm.taskId) : null
                if (!editTask || !taskIsEditable(editTask)) return null
                return (
              <div className="space-y-1.5">
                <Label className="text-xs">Assigned Resource</Label>

                {/* Current selection pill */}
                {editPanelUser && (
                  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
                    <Avatar className="h-5 w-5 shrink-0">
                      <AvatarFallback className="text-[9px] bg-blue-200 text-blue-800">
                        {editPanelUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium flex-1 truncate">{editPanelUser.name}</span>
                    <button
                      onClick={() => setEditForm(f => f ? { ...f, ownerId: '' } : f)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Search + list */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    className="pl-7 h-7 text-xs"
                    placeholder="Search people…"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                </div>

                <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border/50">
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No people found</p>
                  ) : filteredUsers.map(u => (
                    <button key={u.id} type="button"
                      onClick={() => setEditForm(f => f ? { ...f, ownerId: f.ownerId === u.id ? '' : u.id } : f)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-left text-xs transition-colors ${
                        editForm?.ownerId === u.id
                          ? 'bg-blue-50 dark:bg-blue-950/30'
                          : 'hover:bg-muted/40'
                      }`}>
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarFallback className="text-[9px] bg-muted">
                          {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.name}</p>
                        <p className="text-muted-foreground truncate">{ROLE_LABELS[u.role] ?? u.role}</p>
                      </div>
                      {editForm?.ownerId === u.id && (
                        <div className="h-3.5 w-3.5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border flex gap-2">
              <Button variant="outline" size="sm" className="flex-1"
                onClick={() => { setEditForm(null); setUserSearch('') }}>
                Cancel
              </Button>
              <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"
                onClick={saveEdit} disabled={editSaving}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                {editSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tasks without dates */}
      {!loading && viewMode === 'tasks' && tasksWithoutDates.length > 0 && (
        <div className="mt-3 shrink-0">
          <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
            Tasks without dates — click to assign dates{canEdit && ' from the edit panel'}
          </p>
          <div className="border border-border rounded-lg overflow-hidden max-h-52 overflow-y-auto">
            {tasksWithoutDates.map(task => {
              const projName = task.workstream.project.name === '__direct_assignments__' ? 'Direct Assignment' : task.workstream.project.name
              return (
                <div key={task.id}
                  className={`flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 transition-colors ${
                    canEdit ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20' : 'hover:bg-muted/20'
                  } ${editForm?.taskId === task.id ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                  onClick={() => {
                    if (!canEdit) return
                    setEditForm({
                      taskId: task.id, name: task.name, status: task.status,
                      startDate: '', endDate: '',
                      ownerId: task.ownerId ?? '',
                      projName: projName, wsName: task.workstream.name,
                    })
                  }}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${TASK_STATUS_BG[task.status] || 'bg-slate-400'}`} />
                  <span className="text-sm flex-1 truncate">{task.name}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]">{projName} · {task.workstream.name}</span>
                  {task.owner && <span className="text-xs text-muted-foreground shrink-0">{task.owner.name.split(' ')[0]}</span>}
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 shrink-0">{task.status}</Badge>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Projects without dates */}
      {!loading && viewMode === 'projects' && (() => {
        const noDates = sortedProjects.filter(p => !p.startDate || !p.endDate)
        if (noDates.length === 0) return null
        return (
          <div className="mt-3 shrink-0">
            <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">Projects without date ranges (not shown on chart)</p>
            <div className="border border-border rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {noDates.map(proj => (
                <div key={proj.id} className="flex items-center gap-3 px-3 py-2 border-b border-border last:border-0 hover:bg-muted/20">
                  <span className="text-sm flex-1 truncate font-medium">{proj.name}</span>
                  {proj.priority && (
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 border ${PRIORITY_BADGE[proj.priority] ?? ''}`} variant="outline">{proj.priority}</Badge>
                  )}
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 shrink-0">{PROJECT_STATUS_LABEL[proj.status] ?? proj.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
