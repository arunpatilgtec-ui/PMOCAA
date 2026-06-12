'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart3, TrendingUp, Target, Users, FolderKanban } from 'lucide-react'

interface Project {
  id: string; name: string; type: string; status: string; priority: string
  workstreams: Array<{ tasks: Array<{ id: string; status: string }> }>
}

interface Resource {
  id: string; name: string; role: string; utilizationPct: number; isOverloaded: boolean; activeTasks: number
}

export default function ReportsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then((r) => r.json()),
      fetch('/api/resources').then((r) => r.json()),
    ]).then(([p, r]) => {
      setProjects(Array.isArray(p) ? p : [])
      setResources(Array.isArray(r) ? r : [])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-6"><Skeleton className="h-96 rounded-lg" /></div>

  const byStatus = {
    PLANNING: projects.filter((p) => p.status === 'PLANNING').length,
    ACTIVE: projects.filter((p) => p.status === 'ACTIVE').length,
    ON_HOLD: projects.filter((p) => p.status === 'ON_HOLD').length,
    COMPLETED: projects.filter((p) => p.status === 'COMPLETED').length,
    CANCELLED: projects.filter((p) => p.status === 'CANCELLED').length,
  }

  const byType = {
    TEARDOWN: projects.filter((p) => p.type === 'TEARDOWN').length,
    OTHER: projects.filter((p) => p.type === 'OTHER').length,
  }

  const allTasks = projects.flatMap((p) => p.workstreams.flatMap((ws) => ws.tasks))
  const tasksByStatus = {
    BACKLOG: allTasks.filter((t) => t.status === 'BACKLOG').length,
    PLANNED: allTasks.filter((t) => t.status === 'PLANNED').length,
    IN_PROGRESS: allTasks.filter((t) => t.status === 'IN_PROGRESS').length,
    REVIEW: allTasks.filter((t) => t.status === 'REVIEW').length,
    COMPLETED: allTasks.filter((t) => t.status === 'COMPLETED').length,
  }

  const completionRate = allTasks.length
    ? Math.round((tasksByStatus.COMPLETED / allTasks.length) * 100)
    : 0

  const avgUtilization = resources.length
    ? Math.round(resources.reduce((s, r) => s + r.utilizationPct, 0) / resources.length)
    : 0

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-blue-500" /> Portfolio Reports
        </h1>
        <p className="text-muted-foreground text-sm">Snapshot as of today</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Projects</p>
            <p className="text-3xl font-bold mt-1">{projects.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{byStatus.ACTIVE} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Task Completion</p>
            <p className="text-3xl font-bold mt-1">{completionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{tasksByStatus.COMPLETED}/{allTasks.length} done</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avg Utilization</p>
            <p className="text-3xl font-bold mt-1">{avgUtilization}%</p>
            <p className="text-xs text-muted-foreground mt-1">{resources.filter((r) => r.isOverloaded).length} overloaded</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Team Size</p>
            <p className="text-3xl font-bold mt-1">{resources.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{resources.filter((r) => r.activeTasks > 0).length} active</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Status Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-blue-500" /> Project Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{status.replace('_', ' ')}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <Progress value={projects.length ? (count / projects.length) * 100 : 0} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Task Distribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-green-500" /> Task Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(tasksByStatus).map(([status, count]) => (
              <div key={status} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{status.replace('_', ' ')}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <Progress value={allTasks.length ? (count / allTasks.length) * 100 : 0} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Project Type Split */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(byType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-4">
                <div className="w-24 text-sm text-muted-foreground">{type}</div>
                <Progress value={projects.length ? (count / projects.length) * 100 : 0} className="flex-1 h-3" />
                <div className="w-10 text-right text-sm font-medium">{count}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Resource Utilization */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" /> Resource Utilization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {resources.slice(0, 8).map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-sm w-28 truncate text-muted-foreground">{r.name.split(' ')[0]}</span>
                <Progress
                  value={r.utilizationPct}
                  className={`flex-1 h-2 ${r.isOverloaded ? '[&>div]:bg-red-500' : r.utilizationPct > 70 ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
                />
                <span className={`text-xs w-8 text-right font-medium ${r.isOverloaded ? 'text-red-600' : ''}`}>
                  {r.utilizationPct}%
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
