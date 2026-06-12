'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { format, isPast } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle, Plus, AlertTriangle } from 'lucide-react'
import { useAuthStore, canManageProjects } from '@/store/auth'

interface Milestone {
  id: string; name: string; dueDate: string; completed: boolean; description?: string
}

export function MilestonePanel({
  projectId,
  milestones,
  onRefresh,
}: {
  projectId: string
  milestones: Milestone[]
  onRefresh: () => void
}) {
  const { user } = useAuthStore()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function addMilestone() {
    if (!name.trim() || !dueDate) return
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), dueDate }),
      })
      if (!res.ok) throw new Error()
      toast.success('Milestone added')
      setName(''); setDueDate(''); setAdding(false)
      onRefresh()
    } catch {
      toast.error('Failed to add milestone')
    }
  }

  async function toggleMilestone(m: Milestone) {
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !m.completed }),
      })
      if (!res.ok) throw new Error()
      onRefresh()
    } catch {
      toast.error('Failed to update milestone')
    }
  }

  const upcoming = milestones.filter((m) => !m.completed && !isPast(new Date(m.dueDate)))
  const overdue = milestones.filter((m) => !m.completed && isPast(new Date(m.dueDate)))
  const completed = milestones.filter((m) => m.completed)

  return (
    <div className="space-y-4">
      {overdue.length > 0 && (
        <div>
          <p className="text-sm font-medium text-red-600 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Overdue ({overdue.length})
          </p>
          <div className="space-y-2">
            {overdue.map((m) => (
              <MilestoneItem key={m.id} milestone={m} onToggle={toggleMilestone} />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Upcoming ({upcoming.length})</p>
          <div className="space-y-2">
            {upcoming.map((m) => (
              <MilestoneItem key={m.id} milestone={m} onToggle={toggleMilestone} />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Completed ({completed.length})</p>
          <div className="space-y-2">
            {completed.map((m) => (
              <MilestoneItem key={m.id} milestone={m} onToggle={toggleMilestone} />
            ))}
          </div>
        </div>
      )}

      {milestones.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-6">No milestones defined</p>
      )}

      {user && canManageProjects(user.role) && (
        <div>
          {adding ? (
            <div className="flex gap-2 items-end">
              <Input placeholder="Milestone name..." value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-sm w-36" />
              <Button size="sm" className="h-8" onClick={addMilestone}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Milestone
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function MilestoneItem({ milestone, onToggle }: { milestone: Milestone; onToggle: (m: Milestone) => void }) {
  const overdue = !milestone.completed && isPast(new Date(milestone.dueDate))
  return (
    <Card className={overdue ? 'border-red-200 dark:border-red-900' : ''}>
      <CardContent className="p-3 flex items-center gap-3">
        <button onClick={() => onToggle(milestone)} className="shrink-0">
          {milestone.completed
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : <Circle className={`h-5 w-5 ${overdue ? 'text-red-400' : 'text-muted-foreground'}`} />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${milestone.completed ? 'line-through text-muted-foreground' : ''}`}>
            {milestone.name}
          </p>
          {milestone.description && (
            <p className="text-xs text-muted-foreground">{milestone.description}</p>
          )}
        </div>
        <Badge variant={overdue ? 'destructive' : milestone.completed ? 'secondary' : 'outline'} className="text-xs shrink-0">
          {format(new Date(milestone.dueDate), 'MMM d, yyyy')}
        </Badge>
      </CardContent>
    </Card>
  )
}
