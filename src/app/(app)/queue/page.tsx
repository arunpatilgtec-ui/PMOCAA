'use client'

import { useEffect, useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/store/auth'
import { format } from 'date-fns'
import { CalendarDays, Clock, ChevronDown, ChevronRight, AlertTriangle, Flame } from 'lucide-react'

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

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-blue-50 text-blue-700 border-blue-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-200',
}

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH: 'bg-orange-400',
  MEDIUM: 'bg-blue-400',
  LOW: 'bg-slate-300',
}

const PRIORITY_HEADER: Record<string, string> = {
  CRITICAL: 'bg-red-50/60 border-red-200 text-red-800',
  HIGH: 'bg-orange-50/60 border-orange-200 text-orange-800',
  MEDIUM: 'bg-blue-50/40 border-blue-200 text-blue-800',
  LOW: 'bg-slate-50/40 border-slate-200 text-slate-700',
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
  MEDIUM: null,
  LOW: null,
}

export default function QueuePage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

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

  useEffect(() => {
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
  }, [selectedUserId, canPickUser])

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

  function toggleGroup(priority: string) {
    setCollapsed(prev => ({ ...prev, [priority]: !prev[priority] }))
  }

  const totalHours = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0)
  const criticalCount = grouped.CRITICAL.length
  const highCount = grouped.HIGH.length

  const selectedUserName = canPickUser
    ? userOptions.find(u => u.id === selectedUserId)?.name ?? 'Loading…'
    : user?.name ?? ''

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Priority Queue</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {selectedUserName && <span className="font-medium text-foreground">{selectedUserName} · </span>}
            {loading ? 'Loading…' : (
              <>
                {tasks.length} active task{tasks.length !== 1 ? 's' : ''} · {Math.round(totalHours)}h estimated
                {(criticalCount > 0 || highCount > 0) && (
                  <span className="ml-1.5 text-orange-600 font-medium">
                    · {[
                      criticalCount > 0 && `${criticalCount} CRITICAL`,
                      highCount > 0 && `${highCount} HIGH`,
                    ].filter(Boolean).join(', ')}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
        {canPickUser && (
          <Select value={selectedUserId} onValueChange={(v) => setSelectedUserId(v ?? '')}>
            <SelectTrigger className="w-52 h-9">
              <SelectValue placeholder="Select resource…" />
            </SelectTrigger>
            <SelectContent>
              {userOptions.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Timeline hint */}
      {!loading && tasks.length > 0 && (criticalCount > 0 || highCount > 0) && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Higher-priority tasks appear first. When a CRITICAL or HIGH task is assigned, lower-priority tasks with conflicting dates are automatically rescheduled to start after it.
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
                {/* Group header */}
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

                {/* Task rows */}
                {!isCollapsed && (
                  <div className="divide-y divide-border">
                    {group.map((task, idx) => {
                      const projName = task.workstream.project.name === '__direct_assignments__'
                        ? 'Direct Assignment'
                        : task.workstream.project.name
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
                              <span className="truncate max-w-[200px]">{projName} · {task.workstream.name}</span>
                              {(task.estimatedHours ?? 0) > 0 && (
                                <span className="flex items-center gap-1 shrink-0">
                                  <Clock className="h-3 w-3" />
                                  {task.estimatedHours}h
                                </span>
                              )}
                              {task.startDate ? (
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
