'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus, Search, ClipboardList, ArrowRight, CheckCircle2,
  XCircle, FolderPlus, Clock, AlertTriangle, Calendar, Repeat, Users, RotateCcw,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface User { id: string; name: string; role: string }

interface Request {
  id: string; title: string; description: string; priority: string
  type: string; status: string; notes?: string; createdAt: string
  isRecurring?: boolean; startDate?: string; endDate?: string
  hoursPerDay?: number; estimatedHours?: number
  submitter: { id: string; name: string }
  assignee?: { id: string; name: string }
  assignedBy?: { id: string; name: string }
  project?: { id: string; name: string; status: string }
}

interface AssignedTask {
  id: string
  name: string
  description?: string
  status: string
  priority: string
  estimatedHours: number
  startDate?: string
  endDate?: string
  assignedById?: string
  approvedById?: string
  owner?: { id: string; name: string; avatarUrl?: string }
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  REVIEW:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  APPROVED:  'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  REJECTED:  'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  CONVERTED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  SUBMITTED: <Clock className="h-3.5 w-3.5" />,
  REVIEW:    <AlertTriangle className="h-3.5 w-3.5" />,
  APPROVED:  <CheckCircle2 className="h-3.5 w-3.5" />,
  REJECTED:  <XCircle className="h-3.5 w-3.5" />,
  CONVERTED: <FolderPlus className="h-3.5 w-3.5" />,
}

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG:     'bg-slate-100 text-slate-700',
  PLANNED:     'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW:      'bg-purple-100 text-purple-700',
  REWORK:      'bg-orange-100 text-orange-700',
  COMPLETED:   'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-700',
}
const TASK_STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', PLANNED: 'Planned', IN_PROGRESS: 'In Progress',
  REVIEW: 'Review', REWORK: 'Rework', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

const submitSchema = z.object({
  title:       z.string().min(2, 'Min 2 chars'),
  description: z.string().min(5, 'Min 5 chars'),
  type:        z.enum(['TEARDOWN', 'OTHER']),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  notes:       z.string().optional(),
})

type SubmitForm = z.infer<typeof submitSchema>

export default function RequestsPage() {
  const { user } = useAuthStore()
  const [requests,       setRequests]       = useState<Request[]>([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('ALL')
  const [createOpen,     setCreateOpen]     = useState(false)
  const [submitting,     setSubmitting]     = useState(false)
  const [actionLoading,  setActionLoading]  = useState<string | null>(null)
  const [activeTab,      setActiveTab]      = useState<'requests' | 'assigned'>('requests')
  const [assignedTasks,  setAssignedTasks]  = useState<AssignedTask[]>([])
  const [assignedLoad,   setAssignedLoad]   = useState(false)
  const [reworkOpen,     setReworkOpen]     = useState<string | null>(null)
  const [reworkNotes,    setReworkNotes]    = useState<Record<string, string>>({})
  const [actionTask,     setActionTask]     = useState<string | null>(null)

  // New request form extra state
  const [assignedById,   setAssignedById]   = useState('')
  const [assigneeId,     setAssigneeId]     = useState('')
  const [isRecurring,    setIsRecurring]    = useState(false)
  const [reqStartDate,   setReqStartDate]   = useState('')
  const [reqEndDate,     setReqEndDate]     = useState('')
  const [reqHours,       setReqHours]       = useState('')
  const [formUsers,      setFormUsers]      = useState<User[]>([])

  const sForm = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: { type: 'TEARDOWN', priority: 'MEDIUM' },
  })

  const load = async () => {
    setLoading(true)
    try {
      const url = statusFilter === 'ALL' ? '/api/requests' : `/api/requests?status=${statusFilter}`
      const res = await fetch(url)
      if (!res.ok) { toast.error('Failed to load requests'); setLoading(false); return }
      const data = await res.json()
      setRequests(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Could not connect to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  useEffect(() => {
    if (activeTab !== 'assigned') return
    setAssignedLoad(true)
    fetch('/api/tasks?assignedByMe=true')
      .then(r => r.json())
      .then(d => setAssignedTasks(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setAssignedLoad(false))
  }, [activeTab])

  function openNewRequest() {
    sForm.reset({ type: 'TEARDOWN', priority: 'MEDIUM' })
    setAssignedById('')
    setAssigneeId(user?.id || '')
    setIsRecurring(false)
    setReqStartDate('')
    setReqEndDate('')
    setReqHours('')
    setCreateOpen(true)
    fetch('/api/users').then((r) => r.json()).then((d) => setFormUsers(Array.isArray(d) ? d : [])).catch(() => {})
  }

  async function onSubmitRequest(data: SubmitForm) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          assignedById: assignedById || undefined,
          assigneeId: assigneeId || user?.id || undefined,
          isRecurring,
          startDate: reqStartDate || undefined,
          endDate: reqEndDate || undefined,
          hoursPerDay: isRecurring && reqHours ? parseFloat(reqHours) : undefined,
          estimatedHours: !isRecurring && reqHours ? parseFloat(reqHours) : undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast.success('Request submitted — managers have been notified')
      sForm.reset()
      setCreateOpen(false)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit')
    } finally { setSubmitting(false) }
  }

  async function updateStatus(id: string, status: string) {
    setActionLoading(id + status)
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast.success(`Moved to ${status.toLowerCase()}`)
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    } finally { setActionLoading(null) }
  }

  async function sendRework(taskId: string) {
    setActionTask(taskId)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REWORK', reworkNote: reworkNotes[taskId] || '' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast.success('Task sent back for rework')
      setReworkOpen(null)
      setReworkNotes(prev => ({ ...prev, [taskId]: '' }))
      setAssignedTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'REWORK' } : t))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally { setActionTask(null) }
  }

  async function approveTask(taskId: string) {
    setActionTask(taskId)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast.success('Task marked complete')
      setAssignedTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'COMPLETED' } : t))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally { setActionTask(null) }
  }

  const filtered = requests.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase()) ||
    r.submitter.name.toLowerCase().includes(search.toLowerCase())
  )

  const canManage = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)

  const counts: Record<string, number> = {
    ALL: requests.length,
    SUBMITTED: requests.filter(r => r.status === 'SUBMITTED').length,
    REVIEW:    requests.filter(r => r.status === 'REVIEW').length,
    APPROVED:  requests.filter(r => r.status === 'APPROVED').length,
    REJECTED:  requests.filter(r => r.status === 'REJECTED').length,
    CONVERTED: requests.filter(r => r.status === 'CONVERTED').length,
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Requests</h1>
          <p className="text-muted-foreground text-sm">
            {activeTab === 'requests' ? (
              <>
                {filtered.length} request{filtered.length !== 1 ? 's' : ''}
                {counts.SUBMITTED > 0 && canManage && (
                  <span className="ml-2 text-orange-600 font-medium">· {counts.SUBMITTED} pending review</span>
                )}
              </>
            ) : (
              <>{assignedTasks.length} task{assignedTasks.length !== 1 ? 's' : ''} assigned by you</>
            )}
          </p>
        </div>
        <Button onClick={openNewRequest} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New Request
        </Button>
      </div>

      {user?.role !== 'RESOURCE' && (
        <div className="flex gap-1 border-b">
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'requests'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Work Requests
          </button>
          <button
            onClick={() => setActiveTab('assigned')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'assigned'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-4 w-4" />
            Assigned by Me
            {assignedTasks.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs rounded-full px-1.5 py-0.5 leading-none">
                {assignedTasks.length}
              </span>
            )}
          </button>
        </div>
      )}

      {activeTab === 'requests' && (
        <>
          {/* Status filter */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'SUBMITTED', 'REVIEW', 'APPROVED', 'REJECTED', 'CONVERTED'] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 ${
                  statusFilter === s
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border hover:bg-muted'
                }`}>
                {s === 'ALL' ? `All (${counts.ALL})` : `${s.charAt(0) + s.slice(1).toLowerCase()} (${counts[s]})`}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by title, description, or submitter…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No requests found</p>
              {statusFilter !== 'ALL' && (
                <Button variant="link" className="mt-1 text-xs" onClick={() => setStatusFilter('ALL')}>
                  Show all requests
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((req) => (
                <Card key={req.id} className={req.status === 'REJECTED' ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{req.title}</h3>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex items-center gap-1 ${STATUS_COLORS[req.status]}`}>
                            {STATUS_ICONS[req.status]}
                            {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                          </span>
                          <Badge variant="outline" className="text-xs">{req.type}</Badge>
                          <Badge variant="secondary" className="text-xs">{req.priority}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                        {req.notes && (
                          <p className="text-xs text-muted-foreground/70 mt-1 italic line-clamp-1">Note: {req.notes}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                          <span>By {req.submitter.name}</span>
                          <span>{format(new Date(req.createdAt), 'MMM d, yyyy')}</span>
                          {req.assignedBy && <span>Assigned by: {req.assignedBy.name}</span>}
                          {req.assignee && <span>Reviewer: {req.assignee.name}</span>}
                          {(req.startDate || req.endDate) && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {req.startDate && format(new Date(req.startDate), 'MMM d')}
                              {req.endDate && ` – ${format(new Date(req.endDate), 'MMM d, yyyy')}`}
                            </span>
                          )}
                          {req.isRecurring && req.hoursPerDay && (
                            <span className="flex items-center gap-1"><Repeat className="h-3 w-3" />{req.hoursPerDay}h/day</span>
                          )}
                          {!req.isRecurring && req.estimatedHours && (
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{req.estimatedHours}h est.</span>
                          )}
                          {req.project && (
                            <a href={`/projects/${req.project.id}`} className="text-blue-600 hover:underline">
                              → {req.project.name}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Action buttons — only for ADMIN/MANAGER/PLANNER */}
                      {canManage && (req.status === 'SUBMITTED' || req.status === 'REVIEW') && (
                        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                          {req.status === 'SUBMITTED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={actionLoading === req.id + 'REVIEW'}
                              onClick={() => updateStatus(req.id, 'REVIEW')}>
                              <ArrowRight className="mr-1 h-3 w-3" /> Start Review
                            </Button>
                          )}
                          {req.status === 'REVIEW' && (
                            <>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                                disabled={actionLoading === req.id + 'APPROVED'}
                                onClick={() => updateStatus(req.id, 'APPROVED')}>
                                <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                              </Button>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                disabled={actionLoading === req.id + 'REJECTED'}
                                onClick={() => updateStatus(req.id, 'REJECTED')}>
                                <XCircle className="mr-1 h-3 w-3" /> Reject
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ASSIGNED BY ME TAB ── */}
      {activeTab === 'assigned' && user?.role !== 'RESOURCE' && (
        <div className="space-y-3">
          {assignedLoad ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          ) : assignedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Users className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No tasks assigned by you yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Tasks you assign to team members will appear here</p>
            </div>
          ) : (
            <>
              {/* Group by resource */}
              {(() => {
                const byOwner: Record<string, { owner: AssignedTask['owner']; tasks: AssignedTask[] }> = {}
                for (const t of assignedTasks) {
                  const key = t.owner?.id ?? '__unassigned__'
                  if (!byOwner[key]) byOwner[key] = { owner: t.owner, tasks: [] }
                  byOwner[key].tasks.push(t)
                }
                return Object.entries(byOwner).map(([key, group]) => (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
                        {group.owner?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?'}
                      </div>
                      <span className="text-sm font-semibold">{group.owner?.name ?? 'Unassigned'}</span>
                      <span className="text-xs bg-muted rounded-full px-2 py-0.5">{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}</span>
                    </div>
                    {group.tasks.map(task => (
                      <Card key={task.id} className={`ml-9 ${task.status === 'COMPLETED' ? 'opacity-70' : ''}`}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{task.name}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TASK_STATUS_COLORS[task.status] ?? 'bg-slate-100 text-slate-700'}`}>
                                  {TASK_STATUS_LABELS[task.status] ?? task.status}
                                </span>
                                <Badge variant="secondary" className="text-xs">{task.priority}</Badge>
                                {task.estimatedHours > 0 && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />{task.estimatedHours}h
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                                <a href={`/projects/${task.workstream.project.id}`} className="text-blue-600 hover:underline">
                                  {task.workstream.project.name}
                                </a>
                                <span>· {task.workstream.name}</span>
                                {task.startDate && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(task.startDate), 'MMM d')}
                                    {task.endDate && ` – ${format(new Date(task.endDate), 'MMM d, yyyy')}`}
                                  </span>
                                )}
                              </div>

                              {/* Review actions — only for tasks in REVIEW */}
                              {task.status === 'REVIEW' && (
                                <div className="mt-2">
                                  {reworkOpen === task.id ? (
                                    <div className="flex gap-2 items-center flex-wrap">
                                      <Input
                                        className="h-7 text-xs flex-1 min-w-40"
                                        placeholder="Rework note (optional)…"
                                        value={reworkNotes[task.id] || ''}
                                        onChange={e => setReworkNotes(prev => ({ ...prev, [task.id]: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') sendRework(task.id); if (e.key === 'Escape') setReworkOpen(null) }}
                                      />
                                      <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600"
                                        disabled={actionTask === task.id}
                                        onClick={() => sendRework(task.id)}>
                                        {actionTask === task.id ? '…' : 'Send Back'}
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-xs"
                                        onClick={() => setReworkOpen(null)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2">
                                      <Button size="sm" variant="outline"
                                        className="h-7 text-xs text-orange-600 border-orange-200 hover:bg-orange-50"
                                        disabled={actionTask === task.id}
                                        onClick={() => setReworkOpen(task.id)}>
                                        <RotateCcw className="mr-1 h-3 w-3" /> Rework
                                      </Button>
                                      <Button size="sm" variant="outline"
                                        className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                                        disabled={actionTask === task.id}
                                        onClick={() => approveTask(task.id)}>
                                        <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                            {task.status === 'COMPLETED' && (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <div className="ml-9 border-t pt-1" />
                  </div>
                ))
              })()}
            </>
          )}
        </div>
      )}

      {/* ── Submit Request Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Submit New Request</DialogTitle></DialogHeader>
          <form onSubmit={sForm.handleSubmit(onSubmitRequest)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input placeholder="e.g. Teardown of Assembly Line 3" {...sForm.register('title')} />
              {sForm.formState.errors.title && <p className="text-red-500 text-xs">{sForm.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description *</Label>
              <Textarea placeholder="What needs to be done and why…" {...sForm.register('description')} rows={3} />
              {sForm.formState.errors.description && <p className="text-red-500 text-xs">{sForm.formState.errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select defaultValue="TEARDOWN" onValueChange={(v) => sForm.setValue('type', v as SubmitForm['type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEARDOWN">Teardown</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority *</Label>
                <Select defaultValue="MEDIUM" onValueChange={(v) => sForm.setValue('priority', v as SubmitForm['priority'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Assign to picker — RESOURCE can only submit for themselves */}
            {user?.role !== 'RESOURCE' && (
              <div className="space-y-1.5">
                <Label>Assign to (who will do the work)</Label>
                <Select value={assigneeId || user?.id || ''} onValueChange={(v) => setAssigneeId(v ?? '')}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select assignee" /></SelectTrigger>
                  <SelectContent>
                    {user?.id && <SelectItem value={user.id}>Me ({user.name})</SelectItem>}
                    {formUsers.filter(u => u.id !== user?.id).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} <span className="text-muted-foreground text-xs">· {u.role.replace('_', ' ')}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Assigned by picker */}
            <div className="space-y-1.5">
              <Label>Assigned by (optional — who gave you this work)</Label>
              <Select value={assignedById || 'none'} onValueChange={(v) => { const s = v as string | null; setAssignedById(!s || s === 'none' ? '' : s) }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Who assigned this work?" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  {formUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} <span className="text-muted-foreground text-xs">· {u.role.replace('_', ' ')}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* One-time vs Recurring toggle */}
            <div className="space-y-1.5">
              <Label>Task Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" checked={!isRecurring} onChange={() => setIsRecurring(false)} className="accent-primary" />
                  One-time task
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" checked={isRecurring} onChange={() => setIsRecurring(true)} className="accent-primary" />
                  Recurring task
                </label>
              </div>
            </div>

            {/* Date range + hours */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{isRecurring ? 'Hours/day' : 'Est. hours'}</Label>
                <Input
                  type="number" min="0" step="0.5" placeholder={isRecurring ? '2' : '8'}
                  value={reqHours} onChange={(e) => setReqHours(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start date</Label>
                <Input type="date" value={reqStartDate} onChange={(e) => setReqStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End date</Label>
                <Input type="date" value={reqEndDate} onChange={(e) => setReqEndDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea placeholder="Additional context or constraints…" {...sForm.register('notes')} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Submit Request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  )
}
