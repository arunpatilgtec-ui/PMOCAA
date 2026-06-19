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
  ListTodo,
  PlayCircle,
  Eye,
} from 'lucide-react'
import Link from 'next/link'
import { format, isPast } from 'date-fns'
import { motion, type Variants } from 'framer-motion'

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
  _count: { workstreams: number }
}

interface Task {
  id: string; name: string; status: string; priority: string
  startDate?: string; endDate?: string
  workstream: { name: string; project: { id: string; name: string } }
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

const priorityColors: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
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

const container: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
}
const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [myTasks, setMyTasks] = useState<Task[]>([])
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [loading, setLoading] = useState(true)

  const isResource = user?.role === 'RESOURCE'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    async function loadData() {
      try {
        if (isResource) {
          const [projRes, taskRes] = await Promise.all([
            fetch('/api/projects'),
            fetch('/api/tasks'),
          ])
          const [proj, tasks] = await Promise.all([projRes.json(), taskRes.json()])
          setProjects(Array.isArray(proj) ? proj : [])
          setMyTasks(Array.isArray(tasks) ? tasks : [])
        } else {
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
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [isResource])

  const activeProjects = projects.filter((p) => p.status === 'ACTIVE')
  const delayedProjects = projects.filter(isProjectDelayed)
  const overloadedResources = resources.filter((r) => r.isOverloaded)

  const activeTasks = myTasks.filter((t) => !['COMPLETED', 'CANCELLED'].includes(t.status))
  const inProgressTasks = myTasks.filter((t) => t.status === 'IN_PROGRESS')
  const plannedTasks = myTasks.filter((t) => t.status === 'PLANNED')
  const reviewTasks = myTasks.filter((t) => t.status === 'REVIEW' || t.status === 'REWORK')
  const completedTasks = myTasks.filter((t) => t.status === 'COMPLETED')

  const stats = isResource
    ? [
        { label: 'In Progress', value: inProgressTasks.length, icon: PlayCircle,  href: '/kanban',    gradient: 'from-amber-500 to-orange-500',  ring: 'ring-amber-500/20' },
        { label: 'Planned',     value: plannedTasks.length,    icon: ListTodo,     href: '/kanban',    gradient: 'from-blue-500 to-cyan-500',     ring: 'ring-blue-500/20' },
        { label: 'In Review',   value: reviewTasks.length,     icon: Eye,          href: '/kanban',    gradient: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/20' },
        { label: 'Completed',   value: completedTasks.length,  icon: CheckCircle2, href: '/kanban',    gradient: 'from-emerald-500 to-green-600', ring: 'ring-emerald-500/20' },
      ]
    : [
        { label: 'Active Projects',       value: activeProjects.length,      icon: FolderKanban,   href: '/projects',   gradient: 'from-blue-500 to-indigo-600',    ring: 'ring-blue-500/20' },
        { label: 'Delayed Projects',      value: delayedProjects.length,     icon: AlertTriangle,  href: '/projects',   gradient: 'from-red-500 to-rose-600',       ring: 'ring-red-500/20' },
        { label: 'Pending Approvals',     value: pendingApprovals,           icon: Clock,          href: '/approvals',  gradient: 'from-amber-500 to-orange-500',   ring: 'ring-amber-500/20' },
        { label: 'Overloaded Resources',  value: overloadedResources.length, icon: Users,          href: '/resources',  gradient: 'from-violet-500 to-purple-600',  ring: 'ring-violet-500/20' },
      ]

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  return (
    <motion.div
      className="p-4 sm:p-6 space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold">
          <span className="gradient-text">{greeting},</span>{' '}
          <span className="text-foreground">{user?.name?.split(' ')[0]}</span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </p>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <motion.div key={stat.label} variants={item}>
              <Link href={stat.href}>
                <div className={`card-hover relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 ring-1 ${stat.ring} cursor-pointer`}>
                  <div className={`absolute -top-6 -right-6 h-20 w-20 rounded-full bg-gradient-to-br ${stat.gradient} opacity-10 blur-xl`} />
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${stat.gradient} mb-3 shadow-sm`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </motion.div>

      <motion.div
        className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Main column */}
        <motion.div className="lg:col-span-2" variants={item}>
          {isResource ? (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                    <ListTodo className="h-3.5 w-3.5 text-white" />
                  </div>
                  My Active Tasks
                </CardTitle>
                <Link href="/kanban">
                  <Button variant="ghost" size="sm" className="text-xs">
                    Open Kanban <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-1">
                {activeTasks.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">
                    No active tasks — check back after a manager assigns work to you
                  </p>
                ) : (
                  activeTasks.slice(0, 8).map((task) => {
                    const isOverdue = task.endDate && isPast(new Date(task.endDate))
                    const statusColors: Record<string, string> = {
                      PLANNED: 'bg-blue-500', IN_PROGRESS: 'bg-amber-500',
                      REVIEW: 'bg-violet-500', REWORK: 'bg-red-400', BACKLOG: 'bg-slate-400',
                    }
                    return (
                      <Link key={task.id} href="/kanban">
                        <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 transition-colors group">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${statusColors[task.status] ?? 'bg-slate-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{task.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {task.workstream.project.name === '__direct_assignments__'
                                ? 'Direct Assignment'
                                : `${task.workstream.project.name} · ${task.workstream.name}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className={`text-xs px-1.5 ${priorityColors[task.priority]}`}>
                              {task.priority}
                            </Badge>
                            {task.endDate && (
                              <span className={`text-xs hidden sm:block ${isOverdue ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}>
                                {isOverdue ? '⚠ ' : ''}due {format(new Date(task.endDate), 'MMM d')}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })
                )}
                {activeTasks.length > 8 && (
                  <Link href="/kanban">
                    <p className="text-xs text-center text-muted-foreground hover:text-foreground py-1">
                      +{activeTasks.length - 8} more tasks — open Kanban to see all
                    </p>
                  </Link>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                    <FolderKanban className="h-3.5 w-3.5 text-white" />
                  </div>
                  Active Projects
                </CardTitle>
                <Link href="/projects">
                  <Button variant="ghost" size="sm" className="text-xs">
                    View all <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeProjects.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No active projects</p>
                ) : (
                  activeProjects.slice(0, 6).map((project) => {
                    const progress = getProjectProgress(project)
                    const delayed = isProjectDelayed(project)
                    return (
                      <Link key={project.id} href={`/projects/${project.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/60 transition-colors group cursor-pointer">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate">{project.name}</span>
                              {delayed && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                              <Badge className={`text-xs px-1.5 shrink-0 ${priorityColors[project.priority]}`}>
                                {project.priority}
                              </Badge>
                              <Badge variant="outline" className="text-xs px-1.5 shrink-0">
                                {project.type}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <Progress value={progress} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground shrink-0 w-8 text-right">{progress}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Due {format(new Date(project.endDate), 'MMM d, yyyy')}
                              {project.lead && ` · ${project.lead.name}`}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                      </Link>
                    )
                  })
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Right column */}
        <div className="space-y-4">
          <motion.div variants={item}>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                    <AlertTriangle className="h-3.5 w-3.5 text-white" />
                  </div>
                  Delayed Projects
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {delayedProjects.length === 0 ? (
                  <div className="flex flex-col items-center py-4 gap-1">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500/60" />
                    <p className="text-muted-foreground text-sm">All on track</p>
                  </div>
                ) : (
                  delayedProjects.slice(0, 5).map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`}>
                      <div className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/60 transition-colors">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.type} · {p.status.replace('_', ' ')}</p>
                          <p className="text-xs text-red-500 font-medium">
                            End {format(new Date(p.endDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {!isResource && (
            <motion.div variants={item}>
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                      <TrendingUp className="h-3.5 w-3.5 text-white" />
                    </div>
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6 shrink-0">
                            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-violet-600 text-white">
                              {r.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">{r.name}</span>
                        </div>
                        <span className={`text-xs font-semibold shrink-0 ${r.isOverloaded ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {r.utilizationPct}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(r.utilizationPct, 100)}
                        className={`h-1.5 ${r.isOverloaded ? '[&>div]:bg-gradient-to-r [&>div]:from-red-500 [&>div]:to-rose-600' : '[&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-indigo-600'}`}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
