'use client'

import { useEffect, useState } from 'react'
import { useAuthStore, canApproveChanges } from '@/store/auth'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { CheckCircle2, XCircle, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface ImpactItem {
  id: string; name: string; type: string; delayDays?: number; reason: string
}

interface ImpactSummary {
  affectedTasks: ImpactItem[]
  affectedProjects: ImpactItem[]
  affectedResources: ImpactItem[]
  overloadedResources: string[]
  totalDelayDays: number
  severity: string
  summary: string
}

interface ScheduleChange {
  id: string; changeType: string; description: string; status: string
  createdAt: string; impactSummary: ImpactSummary
  currentData: Record<string, unknown>
  proposedData: Record<string, unknown>
  requester: { id: string; name: string; avatarUrl?: string }
  project?: { id: string; name: string }
  approval?: { id: string; approver?: { name: string }; comments?: string }
}

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

export default function ApprovalsPage() {
  const { user } = useAuthStore()
  const [changes, setChanges] = useState<ScheduleChange[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ScheduleChange | null>(null)
  const [comments, setComments] = useState('')
  const [processing, setProcessing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState('PENDING')

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedule-changes?status=${statusFilter}`)
      const data = await res.json()
      setChanges(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  async function handleDecision(approved: boolean) {
    if (!selected) return
    setProcessing(true)
    try {
      const res = await fetch(`/api/schedule-changes/${selected.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comments }),
      })
      if (!res.ok) throw new Error()
      toast.success(approved ? 'Change approved and applied' : 'Change rejected')
      setSelected(null)
      setComments('')
      load()
    } catch {
      toast.error('Failed to process approval')
    } finally {
      setProcessing(false)
    }
  }

  const canApprove = user && canApproveChanges(user.role)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Schedule Change Approvals</h1>
          <p className="text-muted-foreground text-sm">{changes.length} change{changes.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
            >
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : changes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <CheckCircle2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No {statusFilter.toLowerCase()} changes</p>
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
                    {/* Status icon */}
                    <div className="mt-0.5">
                      {change.status === 'PENDING' && <Clock className="h-5 w-5 text-orange-500" />}
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

                      {/* Impact details toggle */}
                      {((impact?.affectedTasks?.length > 0) || (impact?.affectedProjects?.length > 0)) && (
                        <button
                          className="text-xs text-muted-foreground mt-2 flex items-center gap-1 hover:text-foreground"
                          onClick={() => setExpanded((p) => ({ ...p, [change.id]: !p[change.id] }))}
                        >
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
                          {impact?.overloadedResources?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium mb-1 text-red-600">Overloaded Resources</p>
                              {impact.overloadedResources.map((r) => (
                                <div key={r} className="text-xs text-red-600">{r}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {change.status === 'PENDING' && canApprove && (
                      <Button size="sm" onClick={() => setSelected(change)}>
                        Review
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Approval Dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Schedule Change</DialogTitle>
          </DialogHeader>
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
                <Textarea
                  placeholder="Add a comment..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleDecision(false)}
              disabled={processing}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="mr-1.5 h-4 w-4" /> Reject
            </Button>
            <Button
              onClick={() => handleDecision(true)}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Approve & Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
