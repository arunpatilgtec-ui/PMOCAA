'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore, canManageProjects } from '@/store/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Plus, Search, FolderKanban, Calendar, Users, AlertCircle, Filter
} from 'lucide-react'
import { format, isPast } from 'date-fns'
import { CreateProjectDialog } from '@/components/projects/create-project-dialog'

interface Project {
  id: string; name: string; type: string; status: string; priority: string
  startDate: string; endDate: string
  lead?: { id: string; name: string }
  planner?: { id: string; name: string }
  workstreams: Array<{ tasks: Array<{ id: string; status: string }> }>
  allocations: Array<{ user: { id: string; name: string } }>
  _count: { workstreams: number }
}

const STATUS_COLORS: Record<string, string> = {
  PLANNING: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  ON_HOLD: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'border-slate-300 text-slate-500',
  MEDIUM: 'border-blue-300 text-blue-600',
  HIGH: 'border-orange-400 text-orange-600',
  CRITICAL: 'border-red-500 text-red-600',
}

export default function ProjectsPage() {
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | null>('ALL')
  const [typeFilter, setTypeFilter] = useState<string | null>('ALL')
  const [createOpen, setCreateOpen] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      setProjects(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = projects.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter
    const matchType = typeFilter === 'ALL' || p.type === typeFilter
    return matchSearch && matchStatus && matchType
  })

  function getProgress(p: Project) {
    const tasks = p.workstreams.flatMap((w) => w.tasks)
    if (!tasks.length) return 0
    return Math.round((tasks.filter((t) => t.status === 'COMPLETED').length / tasks.length) * 100)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        {user && canManageProjects(user.role) && (
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" /> New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search projects..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PLANNING">Planning</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="TEARDOWN">Teardown</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderKanban className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No projects found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const progress = getProgress(p)
            const delayed = isPast(new Date(p.endDate)) && p.status !== 'COMPLETED' && p.status !== 'CANCELLED'
            const taskCount = p.workstreams.flatMap((w) => w.tasks).length

            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="hover:shadow-md transition-all cursor-pointer border border-border hover:border-primary/30 h-full">
                  <CardContent className="p-4 flex flex-col h-full gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight line-clamp-2">{p.name}</h3>
                      <div className="flex items-center gap-1 shrink-0">
                        {delayed && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_COLORS[p.status]}`}>
                          {p.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${PRIORITY_COLORS[p.priority]}`}>
                        {p.priority}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">{p.type}</Badge>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{progress}% ({taskCount} tasks)</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        <span>{format(new Date(p.startDate), 'MMM d')} – {format(new Date(p.endDate), 'MMM d, yyyy')}</span>
                      </div>
                      {p.lead && (
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3" />
                          <span>Lead: {p.lead.name}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  )
}
