'use client'

import { useState } from 'react'
import { useAuthStore, canManageProjects } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Plus, ChevronDown, ChevronRight, Users, Clock, CheckCircle2
} from 'lucide-react'
import { format } from 'date-fns'
import { CreateTaskDialog } from './create-task-dialog'

interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string; effortHours: number
  owner?: { id: string; name: string; avatarUrl?: string }
}

interface Workstream {
  id: string; name: string; status: string; order: number
  lead?: { id: string; name: string }
  tasks: Task[]
}

interface Project {
  id: string; name: string
  workstreams: Workstream[]
}

const TASK_STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-slate-100 text-slate-600',
  PLANNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
}

export function WorkstreamPanel({ project, onRefresh }: { project: Project; onRefresh: () => void }) {
  const { user } = useAuthStore()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [addingWs, setAddingWs] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [createTaskWsId, setCreateTaskWsId] = useState<string | null>(null)

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }))

  async function addWorkstream() {
    if (!newWsName.trim()) return
    try {
      const res = await fetch('/api/workstreams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWsName.trim(), projectId: project.id }),
      })
      if (!res.ok) throw new Error()
      toast.success('Workstream created')
      setNewWsName('')
      setAddingWs(false)
      onRefresh()
    } catch {
      toast.error('Failed to create workstream')
    }
  }

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
                    ws.tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[task.priority]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{task.name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${TASK_STATUS_COLORS[task.status]}`}>
                              {task.status.replace('_', ' ')}
                            </span>
                          </div>
                          {(task.startDate || task.endDate) && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.startDate && format(new Date(task.startDate), 'MMM d')}
                              {task.endDate && ` – ${format(new Date(task.endDate), 'MMM d')}`}
                              {task.effortHours > 0 && ` · ${task.effortHours}h`}
                            </p>
                          )}
                        </div>
                        {task.owner && (
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-xs">
                              {task.owner.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {user && canManageProjects(user.role) && (
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

      {/* Add workstream */}
      {user && canManageProjects(user.role) && (
        <div>
          {addingWs ? (
            <div className="flex gap-2">
              <Input
                placeholder="Workstream name..."
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
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Workstream
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
        />
      )}
    </div>
  )
}
