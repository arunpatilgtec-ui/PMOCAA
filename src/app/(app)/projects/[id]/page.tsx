'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore, canManageProjects } from '@/store/auth'
import { toast } from 'sonner'
import { format } from 'date-fns'
import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft, Calendar, Users, Plus, Layers, GitBranch, CheckSquare, FileText,
  MoreHorizontal, Edit2, Trash2
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WorkstreamPanel } from '@/components/projects/workstream-panel'
import { MilestonePanel } from '@/components/projects/milestone-panel'

interface Task {
  id: string; name: string; status: string; priority: string; startDate?: string; endDate?: string
  effortHours: number; owner?: { id: string; name: string; avatarUrl?: string }
}

interface Workstream {
  id: string; name: string; status: string; order: number
  lead?: { id: string; name: string }
  tasks: Task[]
}

interface Milestone {
  id: string; name: string; dueDate: string; completed: boolean; description?: string
}

interface Allocation {
  userId: string; allocationPct: number
  user: { id: string; name: string; avatarUrl?: string; role: string }
}

interface Project {
  id: string; name: string; description?: string; type: string; status: string
  priority: string; startDate: string; endDate: string
  lead?: { id: string; name: string; email: string }
  planner?: { id: string; name: string; email: string }
  workstreams: Workstream[]
  milestones: Milestone[]
  allocations: Allocation[]
}

const STATUS_COLORS: Record<string, string> = {
  PLANNING: 'bg-slate-100 text-slate-700', ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-yellow-100 text-yellow-700', COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) { router.push('/projects'); return }
      setProject(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    )
  }

  if (!project) return null

  const allTasks = project.workstreams.flatMap((ws) => ws.tasks)
  const progress = allTasks.length
    ? Math.round((allTasks.filter((t) => t.status === 'COMPLETED').length / allTasks.length) * 100)
    : 0

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{project.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[project.status]}`}>
              {project.status.replace('_', ' ')}
            </span>
            <Badge variant="outline" className="text-xs">{project.type}</Badge>
            <Badge variant="outline" className="text-xs">{project.priority}</Badge>
          </div>
          {project.description && (
            <p className="text-muted-foreground text-sm mt-1">{project.description}</p>
          )}
        </div>
        {user && canManageProjects(user.role) && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem><Edit2 className="mr-2 h-4 w-4" /> Edit Project</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Timeline</p>
            <p className="text-sm font-medium mt-0.5">
              {format(new Date(project.startDate), 'MMM d')} – {format(new Date(project.endDate), 'MMM d, yyyy')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Progress</p>
            <div className="flex items-center gap-2 mt-1">
              <Progress value={progress} className="flex-1 h-1.5" />
              <span className="text-sm font-medium">{progress}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Lead</p>
            <p className="text-sm font-medium mt-0.5">{project.lead?.name || '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Team</p>
            <div className="flex -space-x-1 mt-1">
              {project.allocations.slice(0, 5).map((a) => (
                <Avatar key={a.userId} className="h-6 w-6 border-2 border-background">
                  <AvatarFallback className="text-xs">
                    {a.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {project.allocations.length > 5 && (
                <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                  <span className="text-xs text-muted-foreground">+{project.allocations.length - 5}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workstreams">
        <TabsList>
          <TabsTrigger value="workstreams">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Workstreams
          </TabsTrigger>
          <TabsTrigger value="milestones">
            <CheckSquare className="mr-1.5 h-3.5 w-3.5" /> Milestones
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="mr-1.5 h-3.5 w-3.5" /> Team
          </TabsTrigger>
          <TabsTrigger value="gantt">
            <GitBranch className="mr-1.5 h-3.5 w-3.5" /> Gantt
          </TabsTrigger>
          <TabsTrigger value="docs">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Docs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workstreams" className="mt-4">
          <WorkstreamPanel project={project} onRefresh={load} />
        </TabsContent>

        <TabsContent value="milestones" className="mt-4">
          <MilestonePanel projectId={project.id} milestones={project.milestones} onRefresh={load} />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Allocated Resources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {project.allocations.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No resources allocated</p>
                ) : (
                  project.allocations.map((a) => (
                    <div key={a.userId} className="flex items-center gap-3 p-2 rounded-md border">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {a.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{a.user.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{a.user.role.toLowerCase().replace('_', ' ')}</p>
                      </div>
                      <Badge variant="secondary">{a.allocationPct}%</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gantt" className="mt-4">
          <Link href={`/gantt?projectId=${project.id}`}>
            <Button variant="outline" size="sm">Open Project Gantt View</Button>
          </Link>
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              Document management coming soon. Upload PDFs, Excel files, and presentations.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
