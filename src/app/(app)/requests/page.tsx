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
import { Plus, Search, ClipboardList, ArrowRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface Request {
  id: string; title: string; description: string; priority: string
  type: string; status: string; notes?: string; createdAt: string
  submitter: { id: string; name: string }
  project?: { id: string; name: string; status: string }
}

const STATUS_FLOW = ['SUBMITTED', 'REVIEW', 'APPROVED', 'CONVERTED']
const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700', REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
  CONVERTED: 'bg-blue-100 text-blue-700',
}

const schema = z.object({
  title: z.string().min(2),
  description: z.string().min(5),
  type: z.enum(['TEARDOWN', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  notes: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function RequestsPage() {
  const { user } = useAuthStore()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'TEARDOWN', priority: 'MEDIUM' },
  })

  const load = async () => {
    setLoading(true)
    try {
      const url = statusFilter === 'ALL' ? '/api/requests' : `/api/requests?status=${statusFilter}`
      const res = await fetch(url)
      const data = await res.json()
      setRequests(Array.isArray(data) ? data : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [statusFilter])

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error()
      toast.success('Request submitted')
      reset()
      setCreateOpen(false)
      load()
    } catch {
      toast.error('Failed to submit request')
    } finally { setSubmitting(false) }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      toast.success(`Status updated to ${status.toLowerCase()}`)
      load()
    } catch { toast.error('Failed to update status') }
  }

  const filtered = requests.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  )

  const canManage = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Requests</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} request{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" /> New Request
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {['ALL', 'SUBMITTED', 'REVIEW', 'APPROVED', 'CONVERTED', 'REJECTED'].map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search requests..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No requests found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <Card key={req.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{req.title}</h3>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[req.status]}`}>
                        {req.status}
                      </span>
                      <Badge variant="outline" className="text-xs">{req.type}</Badge>
                      <Badge variant="secondary" className="text-xs">{req.priority}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>By {req.submitter.name}</span>
                      <span>{format(new Date(req.createdAt), 'MMM d, yyyy')}</span>
                      {req.project && (
                        <span className="text-blue-600">→ {req.project.name}</span>
                      )}
                    </div>
                  </div>
                  {canManage && req.status !== 'CONVERTED' && req.status !== 'REJECTED' && (
                    <div className="flex gap-1.5 shrink-0">
                      {req.status === 'SUBMITTED' && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(req.id, 'REVIEW')}>
                          <ArrowRight className="mr-1 h-3 w-3" /> Review
                        </Button>
                      )}
                      {req.status === 'REVIEW' && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50" onClick={() => updateStatus(req.id, 'APPROVED')}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateStatus(req.id, 'REJECTED')}>
                            Reject
                          </Button>
                        </>
                      )}
                      {req.status === 'APPROVED' && (
                        <Button size="sm" className="h-7 text-xs" onClick={() => updateStatus(req.id, 'CONVERTED')}>
                          Convert to Project
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

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit New Request</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="Request title..." {...register('title')} />
              {errors.title && <p className="text-red-500 text-xs">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea placeholder="What needs to be done and why..." {...register('description')} rows={3} />
              {errors.description && <p className="text-red-500 text-xs">{errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select defaultValue="TEARDOWN" onValueChange={(v) => setValue('type', v as 'TEARDOWN' | 'OTHER')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEARDOWN">Teardown</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v as FormData['priority'])}>
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
              <Textarea placeholder="Additional notes..." {...register('notes')} rows={2} />
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
