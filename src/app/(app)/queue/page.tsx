'use client'

import { useEffect, useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth'
import { format } from 'date-fns'
import { CalendarDays, Clock, ChevronDown, ChevronRight, AlertTriangle, Flame, Wand2, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'

interface Task {
  id: string
  name: string
  status: string
  priority: string
  startDate?: string
  endDate?: string
  estimatedHours?: number
  owner?: { id: string; name: string }
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

interface ScheduleSlot {
  id: string
  name: string
  priority: string
  startDate: string
  endDate: string
  estimatedHours: number
  wasUndated: boolean
}

interface UserOption {
  id: string
  name: string
  role: string
}

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }

const PRIORITY_BORDER: Record<string, string> = {
  CRITICAL: 'border-l-red-500',
  HIGH: 'border-l-orange-400',
  MEDIUM: 'border-l-blue-400',
  LOW: 'border-l-slate-300',
}

const PRIORITY_HEADER: Record<string, string> = {
  CRITICAL: 'bg-red-50/60 border-red-200 text-red-800',
  HIGH: 'bg-orange-50/60 border-orange-200 text-orange-800',
  MEDIUM: 'bg-blue-50/40 border-blue-200 text-blue-800',
  LOW: 'bg-slate-50/40 border-slate-200 text-slate-700',
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-blue-400',
  LOW: 'bg-slate-300',
}

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-slate-100 text-slate-600',
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  REVIEW: 'bg-purple-100 text-purple-800',
  REWORK: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-400',
}

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', PLANNED: 'Planned', IN_PROGRESS: 'In Progress',
  REVIEW: 'Review', REWORK: 'Rework', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const PRIORITY_ICONS: Record<string, React.ReactNode> = {
  CRITICAL: <Flame className="h-3.5 w-3.5 text-red-500" />,
  HIGH: <AlertTriangle className="h-3.5 w-3.5 text-orange-400" />,
  MEDIUM: null, LOW: null,
}

export default function QueuePage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Schedule preview state
  const [previewSchedule, setPreviewSchedule] = useState<ScheduleSlot[] | null>(null)
  const [generatingSchedule, setGeneratingSchedule] = useState(false)
  const [applyingSchedule, setApplyingSchedule] = useState(false)

  const canPickUser = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)

  useEffect(() => {
    if (canPickUser) {
      fetch('/api/users')
        .then(r => r.json())
        .then(data => {
          const list: UserOption[] = Array.isArray(data) ? data : []
          setUserOptions(list)
          if (!selectedUserId && user?.id) setSelectedUserId(user.id)
        })
        .catch(() => {})
    } else if (user?.id) {
      setSelectedUserId(user.id)
    }
  }, [canPickUser, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadTasks() {
    if (!selectedUserId && !canPickUser) return
    setLoading(true)
    const url = canPickUser && selectedUserId ? `/api/tasks?ownerId=${selectedUserId}` : '/api/tasks'
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setTasks(
          Array.isArray(data)
            ? data.filter((t: Task) => !['COMPLETED', 'CANCELLED'].includes(t.status))
            : []
        )
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadTasks()
    setPreviewSchedule(null)
  }, [selectedUserId, canPickUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Schedule generation ──────────────────────────────────────────────────
  async function generateSchedule() {
    setGeneratingSchedule(true)
    setPreviewSchedule(null)
    try {
      const body: Record<string, unknown> = { apply: false }
      if (canPickUser && selectedUserId) body.ownerId = selectedUserId
      const res = await fetch('/api/queue/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setPreviewSchedule(data.schedule)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not generate schedule')
    } finally {
      setGeneratingSchedule(false)
    }
  }

  async function applySchedule() {
    setApplyingSchedule(true)
    try {
      const body: Record<string, unknown> = { apply: true }
      if (canPickUser && selectedUserId) body.ownerId = selectedUserId
      const res = await fetch('/api/queue/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      toast.success(`Schedule applied — ${data.schedule.length} task${data.schedule.length !== 1 ? 's' : ''} updated`)
      setPreviewSchedule(null)
      loadTasks()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not apply schedule')
    } finally {
      setApplyingSchedule(false)
    }
  }

  // ── Derived display state ────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 1
      const pb = PRIORITY_RANK[b.priority] ?? 1
      if (pb !== pa) return pb - pa
      if (a.startDate && b.startDate) return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      if (a.startDate) return -1
      if (b.startDate) return 1
      return 0
    })
    const groups: Record<string, Task[]> = { CRITICAL: [], HIGH: [], MEDIUM: [], LOW: [] }
    for (const t of sorted) {
      const p = t.priority in groups ? t.priority : 'LOW'
      groups[p].push(t)
    }
    return groups
  }, [tasks])

  // Map taskId → proposed slot for preview overlay
  const scheduleMap = useMemo(() => {
    if (!previewSchedule) return null
    const m = new Map<string, ScheduleSlot>()
    for (const s of previewSchedule) m.set(s.id, s)
    return m
  }, [previewSchedule])

  function toggleGroup(priority: string) {
    setCollapsed(prev => ({ ...prev, [priority]: !prev[priority] }))
  }

  const totalHours = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0)
  const criticalCount = grouped.CRITICAL.length
  const highCount = grouped.HIGH.length
  const undatedCount = tasks.filter(t => !t.startDate).length

  const selectedUserName = canPickUser
    ? userOptions.find(u => u.id === selectedUserId)?.name ?? 'Loading…'
    : user?.name ?? ''

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Priority Queue</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {selectedUserName && <span className="font-medium text-foreground">{selectedUserName} · </span>}
            {loading ? 'Loading…' : (
              <>
                {tasks.length} active task{tasks.length !== 1 ? 's' : ''} · {Math.round(totalHours)}h estimated
                {(criticalCount > 0 || highCount > 0) && (
                  <span className="ml-1.5 text-orange-600 font-medium">
                    · {[criticalCount > 0 && `${criticalCount} CRITICAL`, highCount > 0 && `${highCount} HIGH`].filter(Boolean).join(', ')}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canPickUser && (
            <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? '')}>
              <SelectTrigger className="w-48 h-9">
                <SelectValue placeholder="Select resource…" />
              </SelectTrigger>
              <SelectContent>
                {userOptions.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!loading && tasks.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={generateSchedule}
              disabled={generatingSchedule}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {generatingSchedule ? 'Generating…' : 'Generate Plan'}
            </Button>
          )}
        </div>
      </div>

      {/* Schedule preview banner */}
      {previewSchedule && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
              <Wand2 className="h-4 w-4" />
              Auto-generated priority plan — {previewSchedule.length} tasks scheduled
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-7 gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                onClick={applySchedule}
                disabled={applyingSchedule}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {applyingSchedule ? 'Applying…' : 'Apply Plan'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setPreviewSchedule(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-blue-700 mb-2">
            Tasks are ordered CRITICAL → HIGH → MEDIUM → LOW and assigned consecutive working days starting today.
            {previewSchedule.filter(s => s.wasUndated).length > 0 && (
              <> <span className="font-medium">{previewSchedule.filter(s => s.wasUndated).length} previously undated task(s)</span> will receive dates.</>
            )}
          </p>
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {previewSchedule.map((slot, idx) => (
              <div key={slot.id} className="flex items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-blue-100">
                <span className="text-muted-foreground font-mono w-4 tabular-nums shrink-0">{idx + 1}</span>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  slot.priority === 'CRITICAL' ? 'bg-red-500' :
                  slot.priority === 'HIGH' ? 'bg-orange-400' :
                  slot.priority === 'MEDIUM' ? 'bg-blue-400' : 'bg-slate-300'
                }`} />
                <span className="flex-1 font-medium truncate">{slot.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {format(new Date(slot.startDate), 'MMM d')} → {format(new Date(slot.endDate), 'MMM d')}
                </span>
                {slot.wasUndated && (
                  <Badge className="text-[10px] px-1 py-0 h-4 bg-orange-50 text-orange-600 border-orange-200 shrink-0" variant="outline">
                    new dates
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority hint */}
      {!loading && tasks.length > 0 && !previewSchedule && (criticalCount > 0 || highCount > 0 || undatedCount > 0) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {undatedCount > 0
              ? `${undatedCount} task${undatedCount !== 1 ? 's' : ''} have no dates — click "Generate Plan" to auto-schedule everything in priority order.`
              : 'Higher-priority tasks appear first. When a CRITICAL/HIGH task is assigned, conflicting lower-priority tasks shift automatically.'
            }
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p className="text-lg font-medium">Queue is clear</p>
          <p className="text-sm mt-1">No active tasks assigned to {selectedUserName || 'this resource'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(priority => {
            const group = grouped[priority]
            if (group.length === 0) return null
            const isCollapsed = collapsed[priority]
            const groupHours = group.reduce((s, t) => s + (t.estimatedHours || 0), 0)

            return (
              <div key={priority} className="border border-border rounded-lg overflow-hidden">
                <button
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 border-b border-border transition-colors text-left ${PRIORITY_HEADER[priority]}`}
                  onClick={() => toggleGroup(priority)}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[priority]}`} />
                  {PRIORITY_ICONS[priority]}
                  <span className="font-semibold text-sm">{priority}</span>
                  <span className="text-xs opacity-70">
                    {group.length} task{group.length !== 1 ? 's' : ''} · {Math.round(groupHours)}h
                  </span>
                  <div className="ml-auto">
                    {isCollapsed
                      ? <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                      : <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    }
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {group.map((task, idx) => {
                      const projName = task.workstream.project.name === '__direct_assignments__'
                        ? 'Direct Assignment'
                        : task.workstream.project.name
                      const proposed = scheduleMap?.get(task.id)
                      return (
                        <div
                          key={task.id}
                          className={`flex items-start gap-3 px-4 py-3 border-l-4 hover:bg-muted/10 transition-colors ${PRIORITY_BORDER[priority]}`}
                        >
                          <span className="text-xs text-muted-foreground font-mono w-5 pt-0.5 shrink-0 tabular-nums">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm leading-snug">{task.name}</span>
                              <Badge
                                className={`text-[11px] px-1.5 py-0 h-5 shrink-0 ${STATUS_COLORS[task.status]}`}
                                variant="outline"
                              >
                                {STATUS_LABELS[task.status] || task.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span className="truncate max-w-[180px]">{projName} · {task.workstream.name}</span>
                              {(task.estimatedHours ?? 0) > 0 && (
                                <span className="flex items-center gap-1 shrink-0">
                                  <Clock className="h-3 w-3" />{task.estimatedHours}h
                                </span>
                              )}
                              {/* Show proposed dates if in preview mode, else actual dates */}
                              {proposed ? (
                                <span className="flex items-center gap-1 shrink-0 text-blue-600 font-medium">
                                  <CalendarDays className="h-3 w-3" />
                                  {format(new Date(proposed.startDate), 'MMM d')} → {format(new Date(proposed.endDate), 'MMM d')}
                                  {proposed.wasUndated && <span className="text-orange-500">(was unscheduled)</span>}
                                </span>
                              ) : task.startDate ? (
                                <span className="flex items-center gap-1 shrink-0">
                                  <CalendarDays className="h-3 w-3" />
                                  {format(new Date(task.startDate), 'MMM d')}
                                  {task.endDate && ` → ${format(new Date(task.endDate), 'MMM d')}`}
                                </span>
                              ) : (
                                <span className="text-orange-500 shrink-0">No dates set</span>
                              )}
                              {canPickUser && task.owner && (
                                <span className="shrink-0 font-medium">{task.owner.name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
