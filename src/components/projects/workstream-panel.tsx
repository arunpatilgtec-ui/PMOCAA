'use client'

import { useState, useCallback } from 'react'
import { useAuthStore, canManageProjects } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Plus, ChevronDown, ChevronRight, ChevronUp, History,
} from 'lucide-react'
import { format } from 'date-fns'
import { CreateTaskDialog } from './create-task-dialog'

interface OwnerHistoryEntry {
  id: string
  changedAt: string
  changedBy: { id: string; name: string }
  fromOwner?: { id: string; name: string } | null
  toOwner?: { id: string; name: string } | null
}

interface Task {
  id: string; name: string; description?: string; status: string; priority: string
  startDate?: string; endDate?: string
  actualStartDate?: string; actualEndDate?: string
  pctComplete?: number
  effortHours: number; estimatedHours?: number
  owner?: { id: string; name: string; avatarUrl?: string }
}

interface Workstream {
  id: string; name: string; status: string; order: number
  lead?: { id: string; name: string }
  tasks: Task[]
}

interface Project {
  id: string; name: string
  leadId?: string
  planStatus?: string
  editAccessGranted?: boolean
  allocations: Array<{ userId: string; user: { id: string; name: string; role: string } }>
  workstreams: Workstream[]
}

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-slate-100 text-slate-600',
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  REWORK: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
}

const TASK_STATUSES = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'REWORK', 'COMPLETED', 'CANCELLED']

export function WorkstreamPanel({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const { user } = useAuthStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [addingWs, setAddingWs] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [createTaskWsId, setCreateTaskWsId] = useState<string | null>(null)
  const [ownerHistory, setOwnerHistory] = useState<Record<string, OwnerHistoryEntry[]>>({})
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({})

  // Per-task editing state
  const [taskEdits, setTaskEdits] = useState<Record<string, Partial<Task>>>({})
  const [savingTask, setSavingTask] = useState<string | null>(null)

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }))
  const toggleTask = (id: string) => {
    setExpandedTask((prev) => (prev === id ? null : id))
    if (!taskEdits[id]) setTaskEdits((p) => ({ ...p, [id]: {} }))
  }

  const fetchOwnerHistory = useCallback(async (taskId: string) => {
    if (ownerHistory[taskId]) {
      setShowHistory((p) => ({ ...p, [taskId]: !p[taskId] }))
      return
    }
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      if (!res.ok) return
      const data = await res.json()
      setOwnerHistory((p) => ({ ...p, [taskId]: data.ownerHistory || [] }))
      setShowHistory((p) => ({ ...p, [taskId]: true }))
    } catch {
      toast.error('Failed to load history')
    }
  }, [ownerHistory])

  const canEdit =
    (user && canManageProjects(user.role)) ||
    (user?.role === 'PROJECT_LEAD' && user.id === project.leadId && project.planStatus !== 'APPROVED')

  const canEditDates = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)
  const isProjectLead = user?.role === 'PROJECT_LEAD' && user.id === project.leadId
  const canAssignTasks = canEdit || (isProjectLead && project.planStatus !== 'APPROVED')

  function getEdit<K extends keyof Task>(task: Task, key: K): Task[K] {
    const edits = taskEdits[task.id]
    return (edits && key in edits ? edits[key] : task[key]) as Task[K]
  }

  function setEdit(taskId: string, key: keyof Task, value: unknown) {
    setTaskEdits((p) => ({ ...p, [taskId]: { ...p[taskId], [key]: value } }))
  }

  async function saveTask(task: Task) {
    const edits = taskEdits[task.id]
    if (!edits || Object.keys(edits).length === 0) return
    setSavingTask(task.id)
    try {
      const body: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(edits)) {
        body[k] = v
      }
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Task updated')
      setTaskEdits((p) => ({ ...p, [task.id]: {} }))
      onRefresh()
    } catch {
      toast.error('Failed to update task')
    } finally { setSavingTask(null) }
  }

  async function addWorkstream() {
    if (!newWsName.trim()) return
    try {
      const res = await fetch('/api/workstreams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWsName.trim(), projectId: project.id }),
      })
      if (!res.ok) throw new Error()
      toast.success('Phase created')
      setNewWsName('')
      setAddingWs(false)
      onRefresh()
    } catch {
      toast.error('Failed to create phase')
    }
  }

  async function assignTask(taskId: string, ownerId: string | null) {
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: ownerId || null }),
      })
      onRefresh()
    } catch {
      toast.error('Failed to assign task')
    }
  }

  const now = new Date()

  return (
    <div className="space-y-3">
      {project.workstreams.map((ws) => {
        const isOpen = expanded[ws.id] !== false
        const done = ws.tasks.filter((t) => t.status === 'COMPLETED').length
        const progress = ws.tasks.length ? Math.round((done / ws.tasks.length) * 100) : 0

        return (
          <Card key={ws.id} className="overflow-hidden">
            <CardHeader
              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => toggle(ws.id)}
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <CardTitle className="text-sm font-semibold flex-1">{ws.name}</CardTitle>
                {ws.lead && (
                  <span className="text-xs text-muted-foreground hidden sm:block">Lead: {ws.lead.name}</span>
                )}
                <Badge variant="secondary" className="text-xs">
                  {done}/{ws.tasks.length}
                </Badge>
                <div className="w-20">
                  <Progress value={progress} className="h-1.5" />
                </div>
              </div>
            </CardHeader>

            {isOpen && (
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {ws.tasks.length === 0 ? (
                    <p className="text-muted-foreground text-sm text-center py-4">No tasks</p>
                  ) : (
                    ws.tasks.map((task) => {
                      const isOverdue =
                        task.endDate &&
                        new Date(task.endDate) < now &&
                        !['COMPLETED', 'CANCELLED'].includes(task.status)
                      const isTaskExpanded = expandedTask === task.id
                      const pct = task.pctComplete ?? 0

                      return (
                        <div key={task.id} className="border-b border-border last:border-0">
                          {/* Task row */}
                          <div
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => toggleTask(task.id)}
                          >
                            <div className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{task.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${TASK_STATUS_COLORS[task.status]}`}>
                                  {task.status.replace(/_/g, ' ')}
                                </span>
                                {isOverdue && (
                                  <span className="text-xs px-1.5 py-0.5 rounded shrink-0 bg-red-100 text-red-700 font-medium">
                                    Delayed
                                  </span>
                                )}
                                {pct > 0 && pct < 100 && (
                                  <span className="text-xs text-muted-foreground">{pct}%</span>
                                )}
                              </div>
                              {(task.startDate || task.endDate) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {task.startDate && format(new Date(task.startDate), 'MMM d')}
                                  {task.endDate && ` – ${format(new Date(task.endDate), 'MMM d')}`}
                                  {task.estimatedHours ? ` · ${task.estimatedHours}h est.` : ''}
                                </p>
                              )}
                            </div>
                            {/* Avatar (not clickable in expanded row opener area) */}
                            <div onClick={(e) => e.stopPropagation()}>
                              {canAssignTasks ? (
                                <Select
                                  value={task.owner?.id || 'unassigned'}
                                  onValueChange={(v) => assignTask(task.id, v === 'unassigned' ? null : v)}
                                >
                                  <SelectTrigger className="h-7 w-auto min-w-0 border-0 bg-transparent p-0 shadow-none focus:ring-0">
                                    <Avatar className="h-6 w-6 cursor-pointer">
                                      <AvatarFallback className="text-xs">
                                        {task.owner
                                          ? task.owner.name.split(' ').map((n) => n[0]).join('').slice(0, 2)
                                          : '?'}
                                      </AvatarFallback>
                                    </Avatar>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unassigned">Unassigned</SelectItem>
                                    {project.allocations.map((a) => (
                                      <SelectItem key={a.userId} value={a.userId}>{a.user.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : task.owner ? (
                                <Avatar className="h-6 w-6 shrink-0">
                                  <AvatarFallback className="text-xs">
                                    {task.owner.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                              ) : null}
                            </div>
                            {isTaskExpanded
                              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            }
                          </div>

                          {/* Expanded task detail */}
                          {isTaskExpanded && (
                            <div className="bg-muted/20 px-4 pb-3 pt-2 space-y-2.5 border-t border-border/50">
                              {/* Row 1: Status + % Complete */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs text-muted-foreground">Status</Label>
                                  <Select
                                    value={getEdit(task, 'status') as string}
                                    onValueChange={(v) => setEdit(task.id, 'status', v ?? task.status)}
                                  >
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {TASK_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">% Done</Label>
                                  <Input
                                    type="number"
                                    min={0} max={100}
                                    value={getEdit(task, 'pctComplete') as number ?? 0}
                                    onChange={(e) => setEdit(task.id, 'pctComplete', Number(e.target.value))}
                                    className="h-7 text-xs"
                                  />
                                </div>
                              </div>

                              {/* Row 2: Scheduled dates (2 cols) + Actual dates (2 cols) */}
                              <div className="grid grid-cols-4 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Sched. Start{!canEditDates && <span className="text-muted-foreground/60"> 🔒</span>}
                                  </Label>
                                  <Input
                                    type="date"
                                    value={(getEdit(task, 'startDate') as string)?.slice(0, 10) ?? ''}
                                    onChange={(e) => setEdit(task.id, 'startDate', e.target.value)}
                                    disabled={!canEditDates}
                                    className="h-7 text-xs px-2"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">
                                    Sched. End{!canEditDates && <span className="text-muted-foreground/60"> 🔒</span>}
                                  </Label>
                                  <Input
                                    type="date"
                                    value={(getEdit(task, 'endDate') as string)?.slice(0, 10) ?? ''}
                                    onChange={(e) => setEdit(task.id, 'endDate', e.target.value)}
                                    disabled={!canEditDates}
                                    className="h-7 text-xs px-2"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Actual Start</Label>
                                  <Input
                                    type="date"
                                    value={(getEdit(task, 'actualStartDate') as string)?.slice(0, 10) ?? ''}
                                    onChange={(e) => setEdit(task.id, 'actualStartDate', e.target.value)}
                                    className="h-7 text-xs px-2"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Actual End</Label>
                                  <Input
                                    type="date"
                                    value={(getEdit(task, 'actualEndDate') as string)?.slice(0, 10) ?? ''}
                                    onChange={(e) => setEdit(task.id, 'actualEndDate', e.target.value)}
                                    className="h-7 text-xs px-2"
                                  />
                                </div>
                              </div>

                              {/* Description */}
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Description</Label>
                                <Textarea
                                  rows={2}
                                  value={(getEdit(task, 'description') as string) ?? ''}
                                  onChange={(e) => setEdit(task.id, 'description', e.target.value)}
                                  placeholder="Task description..."
                                  className="text-xs resize-none"
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-muted-foreground"
                                  onClick={() => fetchOwnerHistory(task.id)}
                                >
                                  <History className="mr-1 h-3.5 w-3.5" />
                                  {showHistory[task.id] ? 'Hide' : 'Assignment'} History
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => saveTask(task)}
                                  disabled={savingTask === task.id}
                                >
                                  {savingTask === task.id ? 'Saving…' : 'Save'}
                                </Button>
                              </div>

                              {/* Owner change history */}
                              {showHistory[task.id] && (
                                <div className="rounded border border-border/60 bg-background p-2 space-y-1">
                                  {(ownerHistory[task.id] || []).length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-1">No assignment changes yet</p>
                                  ) : (
                                    (ownerHistory[task.id] || []).map((h) => (
                                      <div key={h.id} className="flex items-center gap-2 text-xs">
                                        <span className="text-muted-foreground shrink-0">
                                          {format(new Date(h.changedAt), 'MMM d, HH:mm')}
                                        </span>
                                        <span className="font-medium">{h.changedBy.name}</span>
                                        <span className="text-muted-foreground">changed from</span>
                                        <span className="font-medium">{h.fromOwner?.name || 'Unassigned'}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className="font-medium">{h.toOwner?.name || 'Unassigned'}</span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
                {canEdit && (
                  <div className="p-3 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setCreateTaskWsId(ws.id)}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Task
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Add phase */}
      {canEdit && (
        <div>
          {addingWs ? (
            <div className="flex gap-2">
              <Input
                placeholder="Phase name..."
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addWorkstream(); if (e.key === 'Escape') setAddingWs(false) }}
                autoFocus
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={addWorkstream}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setAddingWs(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAddingWs(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Phase
            </Button>
          )}
        </div>
      )}

      {createTaskWsId && (
        <CreateTaskDialog
          open={!!createTaskWsId}
          onOpenChange={(v) => { if (!v) setCreateTaskWsId(null) }}
          workstreamId={createTaskWsId}
          onCreated={onRefresh}
          allowedUsers={isProjectLead ? project.allocations.map((a) => a.user) : undefined}
        />
      )}
    </div>
  )
}
