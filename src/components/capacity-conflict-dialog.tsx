'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import { type CapacityDay, type CapacityTask, parseDateOnly } from '@/lib/capacity-check'

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-slate-100 text-slate-700',
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  REWORK: 'bg-orange-100 text-orange-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}
const TASK_STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog', PLANNED: 'Planned', IN_PROGRESS: 'In Progress',
  REVIEW: 'Review', REWORK: 'Rework', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
}

// Reusable "capacity reminder" dialog — shown whenever assigning work to
// someone would put them over their daily capacity. Lets the assigner
// review the existing load, optionally reschedule conflicting tasks inline,
// or proceed anyway. Originally only shown for self-service Requests; this
// version is shared across any "assign work to someone else" flow.
export function CapacityConflictDialog({
  open,
  onOpenChange,
  personLabel,
  days,
  onDaysChange,
  refetch,
  onProceed,
  proceeding,
  proceedLabel = 'Assign anyway',
  proceedingLabel = 'Assigning...',
  currentUserId,
  currentUserRole,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  personLabel: string
  days: CapacityDay[]
  onDaysChange: (days: CapacityDay[]) => void
  refetch: () => Promise<CapacityDay[]>
  onProceed: () => Promise<void> | void
  proceeding: boolean
  proceedLabel?: string
  proceedingLabel?: string
  currentUserId?: string
  currentUserRole?: string
}) {
  const [timelineEdits, setTimelineEdits] = useState<Record<string, { startDate: string; endDate: string }>>(() =>
    Object.fromEntries(
      days.flatMap((day) => day.tasks).map((task) => [task.id, {
        startDate: task.startDate?.slice(0, 10) ?? '',
        endDate: task.endDate?.slice(0, 10) ?? '',
      }])
    )
  )
  const [timelineSaving, setTimelineSaving] = useState<string | null>(null)

  async function saveTimeline(task: CapacityTask) {
    const edit = timelineEdits[task.id]
    if (!edit?.startDate || !edit?.endDate) {
      toast.error('Select both start and end dates')
      return
    }
    if (parseDateOnly(edit.endDate) < parseDateOnly(edit.startDate)) {
      toast.error('Task end date must be on or after its start date')
      return
    }
    setTimelineSaving(task.id)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update timeline')
      const refreshed = await refetch()
      onDaysChange(refreshed)
      toast.success('Task timeline updated')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update timeline')
    } finally {
      setTimelineSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Capacity reminder for {personLabel}
          </DialogTitle>
        </DialogHeader>
        {days.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
            The selected dates now have available capacity.
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              This work can still be assigned. Review existing work and optionally adjust timelines first.
            </p>
            <div className="space-y-4">
              {days.map((day) => (
                <div key={`${day.person}-${day.date}`} className="rounded-lg border border-amber-200 dark:border-amber-900 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
                    <div>
                      <p className="font-semibold">{day.person} · {format(parseDateOnly(day.date), 'EEEE, MMM d, yyyy')}</p>
                      <p className="text-xs text-muted-foreground">
                        Existing {day.existingHours.toFixed(1)}h + new {day.proposedHours.toFixed(1)}h
                      </p>
                    </div>
                    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-200">
                      {(day.existingHours + day.proposedHours).toFixed(1)}h / {day.capacityHours.toFixed(1)}h
                    </Badge>
                  </div>
                  <div className="divide-y">
                    {day.tasks.length === 0 && day.otherHours <= 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No task details are available for this load.</p>
                    )}
                    {day.tasks.map((task) => {
                      const edit = timelineEdits[task.id] ?? { startDate: '', endDate: '' }
                      const canReschedule = !!currentUserId && (
                        (currentUserRole ? ['ADMIN', 'MANAGER', 'PLANNER'].includes(currentUserRole) : false) ||
                        task.assignedBy?.id === currentUserId
                      )
                      return (
                        <div key={`${day.date}-${task.id}`} className="px-4 py-3 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{task.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {task.workstream.project.name === '__direct_assignments__' ? 'Direct Assignment' : task.workstream.project.name}
                                {' · '}{TASK_STATUS_LABELS[task.status] ?? task.status}
                                {' · '}{task.hoursOnDay.toFixed(1)}h on this day
                              </p>
                              {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
                            </div>
                            <Badge className={TASK_STATUS_COLORS[task.status] ?? 'bg-muted text-foreground'}>{task.priority}</Badge>
                          </div>
                          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                            <span className="font-medium text-foreground">Current timeline: </span>
                            <span className="text-muted-foreground">
                              {task.startDate
                                ? format(parseDateOnly(task.startDate.slice(0, 10)), 'MMM d, yyyy')
                                : 'Start not set'}
                              {' – '}
                              {task.endDate
                                ? format(parseDateOnly(task.endDate.slice(0, 10)), 'MMM d, yyyy')
                                : 'End not set'}
                            </span>
                          </div>
                          {canReschedule ? (
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                              <div className="space-y-1">
                                <Label className="text-xs">New start</Label>
                                <Input type="date" value={edit.startDate} onChange={(e) => setTimelineEdits((previous) => ({
                                  ...previous, [task.id]: { ...edit, startDate: e.target.value },
                                }))} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">New end</Label>
                                <Input type="date" value={edit.endDate} onChange={(e) => setTimelineEdits((previous) => ({
                                  ...previous, [task.id]: { ...edit, endDate: e.target.value },
                                }))} />
                              </div>
                              <Button type="button" variant="outline" onClick={() => saveTimeline(task)} disabled={timelineSaving === task.id}>
                                {timelineSaving === task.id ? 'Saving...' : 'Update'}
                              </Button>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Timeline is read-only because this task was assigned by someone else.</p>
                          )}
                        </div>
                      )
                    })}
                    {day.otherHours > 0.05 && (
                      <div className="px-4 py-3 text-xs text-muted-foreground">
                        Other commitments (meetings, strategic work, or pending approvals): {day.otherHours.toFixed(1)}h
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button type="button" disabled={proceeding} onClick={onProceed}>
            {proceeding ? proceedingLabel : proceedLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
