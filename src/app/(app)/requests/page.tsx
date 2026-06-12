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
  XCircle, FolderPlus, Clock, AlertTriangle,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface Request {
  id: string; title: string; description: string; priority: string
  type: string; status: string; notes?: string; createdAt: string
  submitter: { id: string; name: string }
  assignee?: { id: string; name: string }
  project?: { id: string; name: string; status: string }
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

const submitSchema = z.object({
  title:       z.string().min(2, 'Min 2 chars'),
  description: z.string().min(5, 'Min 5 chars'),
  type:        z.enum(['TEARDOWN', 'OTHER']),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  notes:       z.string().optional(),
})

const convertSchema = z.object({
  name:        z.string().min(2, 'Min 2 chars'),
  description: z.string().optional(),
  type:        z.enum(['TEARDOWN', 'OTHER']),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  startDate:   z.string().min(1, 'Required'),
  endDate:     z.string().min(1, 'Required'),
})

type SubmitForm  = z.infer<typeof submitSchema>
type ConvertForm = z.infer<typeof convertSchema>

export default function RequestsPage() {
  const { user } = useAuthStore()
  const [requests,       setRequests]       = useState<Request[]>([])
  const [loading,        setLoading]        = useState(true)
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('ALL')
  const [createOpen,     setCreateOpen]     = useState(false)
  const [convertTarget,  setConvertTarget]  = useState<Request | null>(null)
  const [submitting,     setSubmitting]     = useState(false)
  const [actionLoading,  setActionLoading]  = useState<string | null>(null)

  const sForm = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: { type: 'TEARDOWN', priority: 'MEDIUM' },
  })
  const cForm = useForm<ConvertForm>({
    resolver: zodResolver(convertSchema),
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

  async function onSubmitRequest(data: SubmitForm) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
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

  async function onConvert(data: ConvertForm) {
    if (!convertTarget) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/requests/${convertTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'CONVERTED',
          convertToProject: {
            name:        data.name,
            description: data.description || convertTarget.description,
            type:        data.type,
            priority:    data.priority,
            startDate:   data.startDate,
            endDate:     data.endDate,
          },
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast.success('Request converted to project!')
      setConvertTarget(null)
      cForm.reset()
      load()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to convert')
    } finally { setSubmitting(false) }
  }

  function openConvert(req: Request) {
    setConvertTarget(req)
    cForm.reset({
      name:     req.title,
      type:     req.type as ConvertForm['type'],
      priority: req.priority as ConvertForm['priority'],
      startDate: '',
      endDate:   '',
    })
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
            {filtered.length} request{filtered.length !== 1 ? 's' : ''}
            {counts.SUBMITTED > 0 && canManage && (
              <span className="ml-2 text-orange-600 font-medium">· {counts.SUBMITTED} pending review</span>
            )}
          </p>
        </div>
        <Button onClick={() => { sForm.reset({ type: 'TEARDOWN', priority: 'MEDIUM' }); setCreateOpen(true) }} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New Request
        </Button>
      </div>

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
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>By {req.submitter.name}</span>
                      <span>{format(new Date(req.createdAt), 'MMM d, yyyy')}</span>
                      {req.assignee && <span>Assigned to {req.assignee.name}</span>}
                      {req.project && (
                        <a href={`/projects/${req.project.id}`} className="text-blue-600 hover:underline">
                          → {req.project.name}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Action buttons — only for ADMIN/MANAGER/PLANNER */}
                  {canManage && req.status !== 'CONVERTED' && req.status !== 'REJECTED' && (
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
                      {req.status === 'APPROVED' && (
                        <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                          onClick={() => openConvert(req)}>
                          <FolderPlus className="mr-1 h-3 w-3" /> Convert to Project
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Submit Request Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
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

      {/* ── Convert to Project Dialog ── */}
      <Dialog open={!!convertTarget} onOpenChange={(o) => { if (!o) setConvertTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-blue-600" />
              Convert to Project
            </DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="mb-3 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
              Creating project from: <span className="font-medium text-foreground">{convertTarget.title}</span>
            </div>
          )}
          <form onSubmit={cForm.handleSubmit(onConvert)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Project Name *</Label>
              <Input {...cForm.register('name')} />
              {cForm.formState.errors.name && <p className="text-red-500 text-xs">{cForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="Leave blank to use the request description…" {...cForm.register('description')} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type *</Label>
                <Select value={cForm.watch('type')} onValueChange={(v) => cForm.setValue('type', v as ConvertForm['type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEARDOWN">Teardown</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority *</Label>
                <Select value={cForm.watch('priority')} onValueChange={(v) => cForm.setValue('priority', v as ConvertForm['priority'])}>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" {...cForm.register('startDate')} />
                {cForm.formState.errors.startDate && <p className="text-red-500 text-xs">{cForm.formState.errors.startDate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input type="date" {...cForm.register('endDate')} />
                {cForm.formState.errors.endDate && <p className="text-red-500 text-xs">{cForm.formState.errors.endDate.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setConvertTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                <FolderPlus className="mr-1.5 h-4 w-4" />
                {submitting ? 'Creating…' : 'Create Project'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
