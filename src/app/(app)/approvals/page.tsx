'use client'

import { useEffect, useState } from 'react'
import { useAuthStore, canApproveChanges } from '@/store/auth'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp,
  ClipboardList, FolderPlus, ArrowRight, UserPlus,
} from 'lucide-react'
import { AssignWorkDialog } from '@/components/assign-work-dialog'

// ── Schedule Change types ───────────────────────────────────────────────────
interface ImpactItem { id: string; name: string; type: string; delayDays?: number; reason: string }
interface ImpactSummary {
  affectedTasks: ImpactItem[]; affectedProjects: ImpactItem[]; affectedResources: ImpactItem[]
  overloadedResources: string[]; totalDelayDays: number; severity: string; summary: string
}
interface ScheduleChange {
  id: string; changeType: string; description: string; status: string
  createdAt: string; impactSummary: ImpactSummary
  currentData: Record<string, unknown>; proposedData: Record<string, unknown>
  requester: { id: string; name: string; avatarUrl?: string }
  project?: { id: string; name: string }
  approval?: { id: string; approver?: { name: string }; comments?: string }
}

// ── Request types ───────────────────────────────────────────────────────────
interface WorkRequest {
  id: string; title: string; description: string; priority: string
  type: string; status: string; notes?: string; createdAt: string
  estimatedHours?: number
  submitter: { id: string; name: string }
  assignee?: { id: string; name: string }
  project?: { id: string; name: string }
}
interface TeamMember { id: string; name: string; role: string; capacityPct: number; department?: string }

const SEVERITY_COLORS: Record<string, string> = {
  LOW: 'text-green-600 bg-green-50', MEDIUM: 'text-blue-600 bg-blue-50',
  HIGH: 'text-orange-600 bg-orange-50', CRITICAL: 'text-red-600 bg-red-50',
}
const CHANGE_TYPE_LABELS: Record<string, string> = {
  TASK_ADDED: 'Task Added', TASK_PRIORITY_CHANGED: 'Priority Changed',
  TASK_DURATION_CHANGED: 'Duration Changed', RESOURCE_OVERLOAD: 'Resource Overload',
  RESOURCE_UNAVAILABLE: 'Resource Unavailable', PROJECT_PRIORITY_CHANGED: 'Project Priority Changed',
  TASK_DATES_CHANGED: 'Task Dates Changed',
}
const REQ_STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700', REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700', CONVERTED: 'bg-blue-100 text-blue-700',
}

export default function ApprovalsPage() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'requests' | 'schedule'>('requests')

  // Schedule changes state
  const [changes,      setChanges]      = useState<ScheduleChange[]>([])
  const [changesLoad,  setChangesLoad]  = useState(true)
  const [selected,     setSelected]     = useState<ScheduleChange | null>(null)
  const [comments,     setComments]     = useState('')
  const [processing,   setProcessing]   = useState(false)
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({})
  const [scFilter,     setScFilter]     = useState('PENDING')

  // Work requests state
  const [wRequests,    setWRequests]    = useState<WorkRequest[]>([])
  const [wLoad,        setWLoad]        = useState(true)
  const [wFilter,      setWFilter]      = useState('ALL_OPEN')
  const [actionLoad,   setActionLoad]   = useState<string | null>(null)
  const [convertTarget,setConvertTarget]= useState<WorkRequest | null>(null)
  const [converting,   setConverting]   = useState(false)
  const [convName,     setConvName]     = useState('')
  const [convStart,    setConvStart]    = useState('')
  const [convEnd,      setConvEnd]      = useState('')
  const [convPriority, setConvPriority] = useState('MEDIUM')

  // Assignment state
  const [teamMembers,   setTeamMembers]   = useState<TeamMember[]>([])
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  // Inline per-request assignment fields (keyed by requestId)
  const [inlineAssign,  setInlineAssign]  = useState<Record<string, { assigneeId: string; estimatedHours: string }>>({})
  const [savingAssign,  setSavingAssign]  = useState<string | null>(null)

  const canApprove = user && canApproveChanges(user.role)

  // ── Load schedule changes
  const loadChanges = async () => {
    setChangesLoad(true)
    try {
      const res = await fetch(`/api/schedule-changes?status=${scFilter}`)
      const data = await res.json()
      setChanges(Array.isArray(data) ? data : [])
    } catch { toast.error('Failed to load schedule changes') }
    finally { setChangesLoad(false) }
  }

  // ── Load work requests
  const loadRequests = async () => {
    setWLoad(true)
    try {
      const url = wFilter === 'ALL_OPEN' ? '/api/requests' : `/api/requests?status=${wFilter}`
      const res = await fetch(url)
      if (!res.ok) { toast.error('Failed to load requests'); setWLoad(false); return }
      const data = await res.json()
      // For ALL_OPEN, only show non-terminal statuses
      const filtered = wFilter === 'ALL_OPEN'
        ? (Array.isArray(data) ? data.filter((r: WorkRequest) => !['CONVERTED', 'REJECTED'].includes(r.status)) : [])
        : (Array.isArray(data) ? data : [])
      setWRequests(filtered)
    } catch { toast.error('Failed to load requests') }
    finally { setWLoad(false) }
  }

  useEffect(() => { loadChanges() }, [scFilter])
  useEffect(() => { loadRequests() }, [wFilter])

  // Load team members for assignee dropdowns
  useEffect(() => {
    if (!canApprove) return
    fetch('/api/users')
      .then(r => r.json())
      .then(d => setTeamMembers(Array.isArray(d) ? d.filter((u: TeamMember & { isActive: boolean }) => u.isActive) : []))
  }, [canApprove])

  async function saveInlineAssign(reqId: string) {
    const vals = inlineAssign[reqId]
    if (!vals?.assigneeId && !vals?.estimatedHours) return
    setSavingAssign(reqId)
    try {
      const body: Record<string, unknown> = {}
      if (vals.assigneeId) body.assigneeId = vals.assigneeId
      if (vals.estimatedHours) body.estimatedHours = parseFloat(vals.estimatedHours)
      const res = await fetch(`/api/requests/${reqId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Assignment saved')
      setInlineAssign(prev => { const n = { ...prev }; delete n[reqId]; return n })
      loadRequests()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSavingAssign(null) }
  }

  // ── Schedule change actions
  async function handleDecision(approved: boolean) {
    if (!selected) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/schedule-changes/${selected.id}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comments }),
      })
      if (!res.ok) throw new Error()
      toast.success(approved ? 'Change approved and applied' : 'Change rejected')
      setSelected(null); setComments(''); loadChanges()
    } catch { toast.error('Failed to process approval') }
    finally { setProcessing(false) }
  }

  // ── Request actions
  async function updateRequestStatus(id: string, status: string) {
    setActionLoad(id + status)
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`Request moved to ${status.toLowerCase()}`)
      loadRequests()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setActionLoad(null) }
  }

  async function onConvert() {
    if (!convertTarget || !convName || !convStart || !convEnd) {
      toast.error('Please fill all required fields'); return
    }
    setConverting(true)
    try {
      const res = await fetch(`/api/requests/${convertTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'CONVERTED',
          convertToProject: {
            name: convName,
            description: convertTarget.description,
            type: convertTarget.type,
            priority: convPriority,
            startDate: convStart,
            endDate: convEnd,
          },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Request converted to project!')
      setConvertTarget(null); setConvName(''); setConvStart(''); setConvEnd('')
      loadRequests()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setConverting(false) }
  }

  const pendingCount    = wRequests.filter(r => r.status === 'SUBMITTED').length
  const inReviewCount   = wRequests.filter(r => r.status === 'REVIEW').length
  const pendingScCount  = changes.filter(c => c.status === 'PENDING').length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approvals</h1>
          <p className="text-muted-foreground text-sm">Review work requests and schedule changes</p>
        </div>
        {canApprove && (
          <Button onClick={() => setAssignDialogOpen(true)} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <UserPlus className="mr-1.5 h-4 w-4" /> Assign Work
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab('requests')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'requests' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Work Requests
          {(pendingCount + inReviewCount) > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {pendingCount + inReviewCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('schedule')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'schedule' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Schedule Changes
          {pendingScCount > 0 && (
            <span className="bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {pendingScCount}
            </span>
          )}
        </button>
      </div>

      {/* ── WORK REQUESTS TAB ── */}
      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {(['ALL_OPEN', 'SUBMITTED', 'REVIEW', 'APPROVED', 'REJECTED', 'CONVERTED'] as const).map((s) => (
              <button key={s} onClick={() => setWFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  wFilter === s ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'
                }`}>
                {s === 'ALL_OPEN' ? 'All Open' : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {wLoad ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
          ) : wRequests.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <ClipboardList className="h-10 w-10 opacity-20 mb-2" />
              <p className="text-sm">No requests to show</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wRequests.map((req) => {
                const ia = inlineAssign[req.id] ?? { assigneeId: req.assignee?.id ?? '', estimatedHours: req.estimatedHours?.toString() ?? '' }
                const isDirty = ia.assigneeId !== (req.assignee?.id ?? '') || ia.estimatedHours !== (req.estimatedHours?.toString() ?? '')
                return (
                <Card key={req.id} className={req.status === 'REJECTED' ? 'opacity-60' : ''}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{req.title}</h3>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${REQ_STATUS_COLORS[req.status]}`}>
                            {req.status.charAt(0) + req.status.slice(1).toLowerCase()}
                          </span>
                          <Badge variant="outline" className="text-xs">{req.type}</Badge>
                          <Badge variant="secondary" className="text-xs">{req.priority}</Badge>
                          {req.estimatedHours && (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                              <Clock className="mr-1 h-3 w-3" />{req.estimatedHours}h
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>By {req.submitter.name}</span>
                          <span>{format(new Date(req.createdAt), 'MMM d, yyyy')}</span>
                          {req.assignee && <span className="text-green-600">→ {req.assignee.name}</span>}
                          {req.project && <a href={`/projects/${req.project.id}`} className="text-blue-600 hover:underline">→ {req.project.name}</a>}
                        </div>
                      </div>

                      {canApprove && req.status !== 'CONVERTED' && req.status !== 'REJECTED' && (
                        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                          {req.status === 'SUBMITTED' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={actionLoad === req.id + 'REVIEW'}
                              onClick={() => updateRequestStatus(req.id, 'REVIEW')}>
                              <ArrowRight className="mr-1 h-3 w-3" /> Start Review
                            </Button>
                          )}
                          {req.status === 'REVIEW' && (
                            <>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                                disabled={actionLoad === req.id + 'APPROVED'}
                                onClick={() => updateRequestStatus(req.id, 'APPROVED')}>
                                <CheckCircle2 className="mr-1 h-3 w-3" /> Approve
                              </Button>
                              <Button size="sm" variant="outline"
                                className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                disabled={actionLoad === req.id + 'REJECTED'}
                                onClick={() => updateRequestStatus(req.id, 'REJECTED')}>
                                <XCircle className="mr-1 h-3 w-3" /> Reject
                              </Button>
                            </>
                          )}
                          {req.status === 'APPROVED' && (
                            <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                              onClick={() => { setConvertTarget(req); setConvName(req.title); setConvPriority(req.priority) }}>
                              <FolderPlus className="mr-1 h-3 w-3" /> Convert to Project
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Inline assign + time estimate ── */}
                    {canApprove && req.status !== 'CONVERTED' && req.status !== 'REJECTED' && (
                      <div className="border-t pt-3 flex flex-wrap items-end gap-2">
                        <div className="flex-1 min-w-40 space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <UserPlus className="h-3 w-3" /> Assign to
                          </Label>
                          <Select
                            value={ia.assigneeId || 'none'}
                            onValueChange={(v) => {
                              const s = v as string | null
                              setInlineAssign(prev => ({ ...prev, [req.id]: { ...ia, assigneeId: (!s || s === 'none') ? '' : s } }))
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Unassigned —</SelectItem>
                              {teamMembers.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name}
                                  {m.department ? ` · ${m.department}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-28 space-y-1">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Est. Hours
                          </Label>
                          <Input className="h-7 text-xs" type="number" min="0" step="0.5" placeholder="e.g. 16"
                            value={ia.estimatedHours}
                            onChange={e => setInlineAssign(prev => ({ ...prev, [req.id]: { ...ia, estimatedHours: e.target.value } }))}
                          />
                        </div>
                        {isDirty && (
                          <Button size="sm" className="h-7 text-xs" disabled={savingAssign === req.id}
                            onClick={() => saveInlineAssign(req.id)}>
                            {savingAssign === req.id ? 'Saving…' : 'Save'}
                          </Button>
                        )}
                        {!isDirty && req.assignee && (
                          <p className="text-xs text-green-600">
                            Assigned to {req.assignee.name}{req.estimatedHours ? ` · ${req.estimatedHours}h` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SCHEDULE CHANGES TAB ── */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <Button key={s} variant={scFilter === s ? 'default' : 'outline'} size="sm"
                onClick={() => setScFilter(s)}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </Button>
            ))}
          </div>

          {changesLoad ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
          ) : changes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No {scFilter.toLowerCase()} changes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {changes.map((change) => {
                const impact = change.impactSummary
                const isExpanded = expanded[change.id]
                return (
                  <Card key={change.id} className={change.status === 'REJECTED' ? 'opacity-70' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {change.status === 'PENDING'  && <Clock className="h-5 w-5 text-orange-500" />}
                          {change.status === 'APPROVED' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                          {change.status === 'REJECTED' && <XCircle className="h-5 w-5 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {CHANGE_TYPE_LABELS[change.changeType] || change.changeType}
                            </Badge>
                            {change.project && (
                              <span className="text-xs text-muted-foreground">{change.project.name}</span>
                            )}
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEVERITY_COLORS[impact?.severity] || 'text-muted-foreground'}`}>
                              {impact?.severity || 'UNKNOWN'} impact
                            </span>
                          </div>
                          <p className="text-sm font-medium mt-1">{change.description}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>By {change.requester.name}</span>
                            <span>{format(new Date(change.createdAt), 'MMM d, yyyy HH:mm')}</span>
                          </div>
                          {impact?.summary && (
                            <p className="text-xs text-muted-foreground mt-1.5 bg-muted/50 rounded px-2 py-1">
                              {impact.summary}
                            </p>
                          )}
                          {((impact?.affectedTasks?.length > 0) || (impact?.affectedProjects?.length > 0)) && (
                            <button className="text-xs text-muted-foreground mt-2 flex items-center gap-1 hover:text-foreground"
                              onClick={() => setExpanded((p) => ({ ...p, [change.id]: !p[change.id] }))}>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              {isExpanded ? 'Hide' : 'Show'} impact details
                            </button>
                          )}
                          {isExpanded && (
                            <div className="mt-2 space-y-2 border-t pt-2">
                              {impact?.affectedTasks?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium mb-1">Affected Tasks</p>
                                  {impact.affectedTasks.map((t) => (
                                    <div key={t.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                      <span>{t.name}</span>
                                      {t.delayDays && <Badge variant="destructive" className="text-[10px] px-1">+{t.delayDays}d</Badge>}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {impact?.affectedProjects?.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium mb-1">Affected Projects</p>
                                  {impact.affectedProjects.map((p) => (
                                    <div key={p.id} className="text-xs text-muted-foreground">{p.name}: {p.reason}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {change.status === 'PENDING' && canApprove && (
                          <Button size="sm" onClick={() => setSelected(change)}>Review</Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Schedule Change Review Dialog ── */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review Schedule Change</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium">{selected.description}</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Requested by {selected.requester.name} · {CHANGE_TYPE_LABELS[selected.changeType]}
                </p>
              </div>
              <div className={`p-3 rounded-lg text-sm ${SEVERITY_COLORS[selected.impactSummary?.severity] || 'bg-muted'}`}>
                <p className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  {selected.impactSummary?.severity || 'UNKNOWN'} Impact
                </p>
                <p className="text-xs mt-1">{selected.impactSummary?.summary}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Comments (optional)</label>
                <Textarea placeholder="Add a comment..." value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleDecision(false)} disabled={processing}
              className="text-red-600 border-red-200 hover:bg-red-50">
              <XCircle className="mr-1.5 h-4 w-4" /> Reject
            </Button>
            <Button onClick={() => handleDecision(true)} disabled={processing}
              className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Convert to Project Dialog ── */}
      <Dialog open={!!convertTarget} onOpenChange={(o) => { if (!o) setConvertTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-blue-600" /> Convert to Project
            </DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="mb-2 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              From request: <span className="font-medium text-foreground">{convertTarget.title}</span>
            </div>
          )}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Project Name *</Label>
              <Input value={convName} onChange={e => setConvName(e.target.value)} placeholder="Project name…" />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={convPriority} onValueChange={(v) => { const s = v as string | null; if (s) setConvPriority(s) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" value={convStart} onChange={e => setConvStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input type="date" value={convEnd} onChange={e => setConvEnd(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setConvertTarget(null)}>Cancel</Button>
              <Button onClick={onConvert} disabled={converting} className="bg-blue-600 hover:bg-blue-700">
                <FolderPlus className="mr-1.5 h-4 w-4" />
                {converting ? 'Creating…' : 'Create Project'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Direct Assign Work Dialog ── */}
      <AssignWorkDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
      />
    </div>
  )
}
