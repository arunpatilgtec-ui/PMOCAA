'use client'

import { useEffect, useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Calendar, Clock, GripVertical, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '@/store/auth'

interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string; effortHours: number; order: number
  owner?: { id: string; name: string; avatarUrl?: string }
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

interface Project { id: string; name: string }

const COLUMNS = [
  { id: 'BACKLOG', label: 'Backlog', color: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'PLANNED', label: 'Planned', color: 'bg-blue-50 dark:bg-blue-950' },
  { id: 'IN_PROGRESS', label: 'In Progress', color: 'bg-yellow-50 dark:bg-yellow-950' },
  { id: 'REVIEW', label: 'Review', color: 'bg-purple-50 dark:bg-purple-950' },
  { id: 'COMPLETED', label: 'Completed', color: 'bg-green-50 dark:bg-green-950' },
]

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'border-l-slate-300', MEDIUM: 'border-l-blue-400',
  HIGH: 'border-l-orange-400', CRITICAL: 'border-l-red-500',
}

const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600', MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700',
}

export default function KanbanPage() {
  const { user } = useAuthStore()
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [projectFilter, setProjectFilter] = useState<string | null>('ALL')
  const [ownerFilter, setOwnerFilter] = useState<string | null>('ALL')

  const load = useCallback(async () => {
    try {
      const [taskRes, projRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/projects'),
      ])
      const [taskData, projData] = await Promise.all([taskRes.json(), projRes.json()])
      setTasks(Array.isArray(taskData) ? taskData : [])
      setProjects(Array.isArray(projData) ? projData : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredTasks = tasks.filter((t) => {
    if (projectFilter && projectFilter !== 'ALL' && t.workstream.project.id !== projectFilter) return false
    if (ownerFilter === 'ME' && t.owner?.id !== user?.id) return false
    if (ownerFilter === 'UNASSIGNED' && t.owner) return false
    return true
  })

  const getColumnTasks = (status: string) =>
    filteredTasks.filter((t) => t.status === status).sort((a, b) => a.order - b.order)

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const { draggableId, destination } = result
    const newStatus = destination.droppableId
    const task = tasks.find((t) => t.id === draggableId)
    if (!task || task.status === newStatus) return

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t))
    )

    try {
      const res = await fetch(`/api/tasks/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, order: destination.index }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert on error
      setTasks((prev) =>
        prev.map((t) => (t.id === draggableId ? { ...t, status: task.status } : t))
      )
      toast.error('Failed to update task status')
    }
  }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5 shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Kanban Board</h1>
          <p className="text-muted-foreground text-sm">{filteredTasks.length} tasks</p>
        </div>
        <div className="flex gap-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-36 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Assignees</SelectItem>
              <SelectItem value="ME">My Tasks</SelectItem>
              <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div key={col.id} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-8 rounded" />
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded" />)}
            </div>
          ))}
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
            {COLUMNS.map((col) => {
              const colTasks = getColumnTasks(col.id)
              return (
                <div key={col.id} className="w-72 shrink-0 flex flex-col">
                  <div className={`rounded-t-lg px-3 py-2 ${col.color} flex items-center justify-between`}>
                    <span className="text-sm font-semibold">{col.label}</span>
                    <Badge variant="secondary" className="text-xs">{colTasks.length}</Badge>
                  </div>
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 min-h-24 rounded-b-lg p-2 space-y-2 transition-colors ${
                          snapshot.isDraggingOver ? 'bg-muted/60 ring-1 ring-primary/20' : 'bg-muted/30'
                        }`}
                      >
                        {colTasks.map((task, index) => (
                          <Draggable key={task.id} draggableId={task.id} index={index}>
                            {(drag, dragSnapshot) => (
                              <div
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                className={`bg-card rounded-lg border border-border border-l-4 ${PRIORITY_COLORS[task.priority]} p-3 shadow-sm hover:shadow-md transition-shadow ${dragSnapshot.isDragging ? 'shadow-lg rotate-1' : ''}`}
                              >
                                <div className="flex items-start gap-2">
                                  <div {...drag.dragHandleProps} className="mt-0.5 text-muted-foreground">
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium leading-tight line-clamp-2">{task.name}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                      {task.workstream.project.name} · {task.workstream.name}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_BADGE[task.priority]}`}>
                                      {task.priority}
                                    </span>
                                    {task.effortHours > 0 && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                        <Clock className="h-3 w-3" />{task.effortHours}h
                                      </span>
                                    )}
                                  </div>
                                  {task.owner ? (
                                    <Avatar className="h-5 w-5">
                                      <AvatarFallback className="text-[10px]">
                                        {task.owner.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <span className="text-xs text-muted-foreground/50">Unassigned</span>
                                  )}
                                </div>
                                {task.endDate && (
                                  <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                                    <Calendar className="h-3 w-3" />
                                    <span>{format(new Date(task.endDate), 'MMM d')}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {colTasks.length === 0 && !snapshot.isDraggingOver && (
                          <p className="text-center text-xs text-muted-foreground/50 py-4">Drop here</p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </div>
              )
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  )
}
