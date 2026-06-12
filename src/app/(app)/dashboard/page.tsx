'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FolderKanban,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  TrendingUp,
  AlertCircle,
  ChevronRight,
  Milestone,
} from 'lucide-react'
import Link from 'next/link'
import { format, isPast, isWithinInterval, addDays } from 'date-fns'

interface Project {
  id: string
  name: string
  type: string
  status: string
  priority: string
  startDate: string
  endDate: string
  lead?: { id: string; name: string; avatarUrl?: string }
  workstreams: Array<{
    tasks: Array<{ id: string; status: string; priority: string }>
  }>
  milestones: Array<{ id: string; name: string; dueDate: string; completed: boolean }>
  _count: { workstreams: number }
}

interface Resource {
  id: string
  name: string
  role: string
  capacityPct: number
  utilizationPct: number
  isOverloaded: boolean
  activeTasks: number
}

const statusColors: Record<string, string> = {
  PLANNING: 'bg-slate-100 text-slate-700',
  ACTIVE: 'bg-green-100 text-green-700',
  ON_HOLD: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
}

function getProjectProgress(project: Project): number {
  const tasks = project.workstreams.flatMap((ws) => ws.tasks)
  if (tasks.length === 0) return 0
  const done = tasks.filter((t) => t.status === 'COMPLETED').length
  return Math.round((done / tasks.length) * 100)
}

function isProjectDelayed(project: Project): boolean {
  return isPast(new Date(project.endDate)) && project.status !== 'COMPLETED'
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [projRes, resRes, changesRes] = await Promise.all([
          fetch('/api/projects'),
          fetch('/api/resources'),
          fetch('/api/schedule-changes?status=PENDING'),
        ])
        const [proj, res, changes] = await Promise.all([
          projRes.json(),
          resRes.json(),
          changesRes.json(),
        ])
        setProjects(Array.isArray(proj) ? proj : [])
        setResources(Array.isArray(res) ? res : [])
        setPendingApprovals(Array.isArray(changes) ? changes.length : 0)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE')
  const delayedProjects = projects.filter(isProjectDelayed)
  const overloadedResources = resources.filter((r) => r.isOverloaded)

  const upcomingMilestones = projects
    .flatMap((p) =>
      p.milestones
        .filter((m) => !m.completed)
        .map((m) => ({ ...m, projectName: p.name, projectId: p.id }))
    )
    .filter((m) =>
      isWithinInterval(new Date(m.dueDate), {
        start: new Date(),
        end: addDays(new Date(), 14),
      })
    )
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  const stats = [
    {
      label: 'Active Projects',
      value: activeProjects.length,
      icon: FolderKanban,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      href: '/projects',
    },
    {
      label: 'Delayed Projects',
      value: delayedProjects.length,
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-50',
      href: '/projects',
    },
    {
      label: 'Pending Approvals',
      value: pendingApprovals,
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      href: '/approvals',
    },
    {
      label: 'Overloaded Resources',
      value: overloadedResources.length,
      icon: Users,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      href: '/resources',
    },
  ]

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Projects */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Active Projects</CardTitle>
              <Link href="/projects">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeProjects.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">
                  No active projects
                </p>
              ) : (
                activeProjects.slice(0, 6).map((project) => {
                  const progress = getProjectProgress(project)
                  const delayed = isProjectDelayed(project)
                  return (
                    <Link key={project.id} href={`/projects/${project.id}`}>
                      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm truncate">{project.name}</span>
                            {delayed && (
                              <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            )}
                            <Badge className={`text-xs px-1.5 shrink-0 ${priorityColors[project.priority]}`}>
                              {project.priority}
                            </Badge>
                            <Badge variant="outline" className="text-xs px-1.5 shrink-0">
                              {project.type}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground shrink-0">{progress}%</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Due {format(new Date(project.endDate), 'MMM d, yyyy')}
                            {project.lead && ` · ${project.lead.name}`}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Upcoming Milestones */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Milestone className="h-4 w-4 text-blue-500" />
                Upcoming Milestones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingMilestones.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  No milestones in the next 14 days
                </p>
              ) : (
                upcomingMilestones.slice(0, 5).map((m) => (
                  <Link key={m.id} href={`/projects/${m.projectId}`}>
                    <div className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.projectName}</p>
                        <p className="text-xs text-orange-600">
                          Due {format(new Date(m.dueDate), 'MMM d')}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          {/* Resource Utilization */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                Resource Load
              </CardTitle>
              <Link href="/resources">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {resources.slice(0, 5).map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-xs">
                          {r.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate max-w-[120px]">{r.name}</span>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        r.isOverloaded ? 'text-red-600' : 'text-muted-foreground'
                      }`}
                    >
                      {r.utilizationPct}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(r.utilizationPct, 100)}
                    className={`h-1 ${r.isOverloaded ? '[&>div]:bg-red-500' : ''}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
