'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertTriangle, Users, Briefcase, Clock, Search,
  ClipboardCheck, UserPlus, CalendarDays, Layers,
} from 'lucide-react'
import { AssignWorkDialog } from '@/components/assign-work-dialog'

interface AssignedTask {
  id: string
  name: string
  status: string
  priority: string
  estimatedHours: number
  startDate: string | null
  endDate: string | null
  workstream: {
    id: string
    name: string
    project: { id: string; name: string }
  }
}

interface Resource {
  id: string; name: string; email: string; role: string
  capacityPct: number
  utilizationPct: number
  thisWeekHours: number
  maxDailyHours: number
  weeklyCapacityHours: number
  dailyCapacityHours: number
  totalTaskHours: number
  directTaskHours?: number
  isOverloaded: boolean
  isOverloadedWeekly: boolean
  isOverloadedDaily: boolean
  overloadReason: 'daily' | 'weekly' | 'both' | null
  activeTasks: number
  department?: string; title?: string
  dailyHoursMap: Record<string, number>
  allocations: Array<{
    allocationPct: number
    project: { id: string; name: string; status: string }
  }>
  ownedTasks: AssignedTask[]
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Manager', PLANNER: 'Planner',
  PROJECT_LEAD: 'Project Lead', WORKSTREAM_LEAD: 'Workstream Lead',
  RESOURCE: 'Engineer/Analyst', LEADERSHIP: 'Leadership',
}

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  PLANNED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  REVIEW: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
}

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600', MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function EmployeeDetailDialog({ resource, open, onOpenChange }: {
  resource: Resource | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  if (!resource) return null

  const utilBar = Math.min(resource.utilizationPct, 150)
  const grouped: Record<string, AssignedTask[]> = {}
  for (const t of resource.ownedTasks) {
    const key = t.workstream.project.name === '__direct_assignments__'
      ? 'Direct Assignments'
      : t.workstream.project.name
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  }

  const totalHours = resource.ownedTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback className={`text-sm font-bold ${resource.isOverloaded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                {resource.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <span className="text-base">{resource.name}</span>
              <p className="text-xs font-normal text-muted-foreground">
                {resource.title || ROLE_LABELS[resource.role]}
                {resource.department && ` · ${resource.department}`}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Utilization summary */}
        <div className="grid grid-cols-4 gap-2 text-center py-2">
          <div className="border rounded-lg p-2">
            <p className={`text-lg font-bold ${resource.isOverloadedWeekly ? 'text-red-600' : 'text-blue-600'}`}>
              {resource.thisWeekHours}h
            </p>
            <p className="text-xs text-muted-foreground">This week</p>
            <p className="text-xs text-muted-foreground">cap {resource.weeklyCapacityHours}h</p>
          </div>
          <div className="border rounded-lg p-2">
            <p className={`text-lg font-bold ${resource.isOverloadedDaily ? 'text-red-600' : 'text-orange-600'}`}>
              {resource.maxDailyHours}h
            </p>
            <p className="text-xs text-muted-foreground">Peak day</p>
            <p className="text-xs text-muted-foreground">cap {resource.dailyCapacityHours}h</p>
          </div>
          <div className="border rounded-lg p-2">
            <p className="text-lg font-bold text-green-600">{resource.utilizationPct}%</p>
            <p className="text-xs text-muted-foreground">Utilized</p>
            <p className="text-xs text-muted-foreground">weekly</p>
          </div>
          <div className="border rounded-lg p-2">
            <p className="text-lg font-bold">{Math.round(totalHours)}h</p>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xs text-muted-foreground">backlog</p>
          </div>
        </div>

        {/* Weekly bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Weekly: {resource.thisWeekHours}h / {resource.weeklyCapacityHours}h (45h cap)</span>
            {resource.isOverloadedWeekly && <span className="text-red-600 font-medium">OVER LIMIT</span>}
          </div>
          <Progress
            value={Math.min(resource.thisWeekHours / Math.max(resource.weeklyCapacityHours, 1) * 100, 100)}
            className={`h-2 ${resource.isOverloadedWeekly ? '[&>div]:bg-red-500' : resource.utilizationPct > 70 ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
          />
        </div>

        {/* Day-by-day breakdown */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">This week — daily hours (8h/day limit)</p>
          <div className="grid grid-cols-5 gap-1.5">
            {Object.entries(resource.dailyHoursMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, hours]) => {
              const over = hours > resource.dailyCapacityHours
              const pct  = Math.min(hours / Math.max(resource.dailyCapacityHours, 1) * 100, 100)
              const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
              return (
                <div key={date} className="text-center space-y-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <div className="h-16 bg-muted rounded relative flex items-end overflow-hidden">
                    <div
                      className={`w-full rounded transition-all ${over ? 'bg-red-500' : pct > 70 ? 'bg-orange-400' : 'bg-green-500'}`}
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <p className={`text-xs font-medium ${over ? 'text-red-600' : ''}`}>
                    {Math.round(hours * 10) / 10}h
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tasks list */}
        <div className="flex-1 overflow-y-auto space-y-4 mt-1">
          {Object.keys(grouped).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No active tasks assigned</div>
          ) : (
            Object.entries(grouped).map(([projectName, tasks]) => (
              <div key={projectName}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{projectName}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0)}h total
                  </span>
                </div>
                <div className="space-y-1.5">
                  {tasks.map(task => (
                    <div key={task.id} className="border rounded-lg px-3 py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {task.workstream.name}
                          {task.startDate && ` · ${fmtDate(task.startDate)} – ${fmtDate(task.endDate)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                          {task.priority}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status] ?? ''}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                        <span className="text-xs font-semibold text-blue-600 w-10 text-right">
                          {task.estimatedHours > 0 ? `${task.estimatedHours}h` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Project allocations */}
          {resource.allocations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Project Allocations</span>
              </div>
              <div className="space-y-1">
                {resource.allocations.map(a => (
                  <div key={a.project.id} className="flex items-center justify-between border rounded px-3 py-2">
                    <span className="text-sm truncate">{a.project.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{a.project.status}</Badge>
                      <span className="text-sm font-semibold text-blue-600">{a.allocationPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function ResourcesPage() {
  const { user } = useAuthStore()
  const [resources, setResources] = useState<Resource[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState<string | null>('ALL')

  const [detailResource, setDetailResource] = useState<Resource | null>(null)
  const [detailOpen,     setDetailOpen]     = useState(false)

  const [assignOpen,   setAssignOpen]   = useState(false)
  const [assignTarget, setAssignTarget] = useState<{ id: string; name: string } | null>(null)

  const canAssign = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)
  const canViewDetail = user && ['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)

  const load = () =>
    fetch('/api/resources').then(r => r.json()).then(d => {
      setResources(Array.isArray(d) ? d : [])
      setLoading(false)
    })

  useEffect(() => {
    setLoading(true)
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  const filtered = resources.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      !filter || filter === 'ALL' ||
      (filter === 'OVERLOADED' && r.isOverloaded) ||
      (filter === 'AVAILABLE' && !r.isOverloaded && r.utilizationPct < 80)
    return matchSearch && matchFilter
  })

  const overloaded = resources.filter(r => r.isOverloaded).length
  const available  = resources.filter(r => !r.isOverloaded && r.utilizationPct < 80).length
  const avgUtil    = resources.length
    ? Math.round(resources.reduce((s, r) => s + r.utilizationPct, 0) / resources.length)
    : 0

  function openAssign(r: Resource, e: React.MouseEvent) {
    e.stopPropagation()
    setAssignTarget({ id: r.id, name: r.name })
    setAssignOpen(true)
  }

  function openDetail(r: Resource) {
    if (!canViewDetail) return
    setDetailResource(r)
    setDetailOpen(true)
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resource Planning</h1>
          <p className="text-muted-foreground text-sm">
            {resources.length} team members · based on 8h/day, 5-day week
          </p>
        </div>
        {canAssign && (
          <Button onClick={() => { setAssignTarget(null); setAssignOpen(true) }} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <UserPlus className="mr-1.5 h-4 w-4" /> Assign Work
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-2xl font-bold text-red-600">{overloaded}</p><p className="text-sm text-muted-foreground">Overloaded</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><Users className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-2xl font-bold text-green-600">{available}</p><p className="text-sm text-muted-foreground">Available</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Clock className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-2xl font-bold text-blue-600">{avgUtil}%</p><p className="text-sm text-muted-foreground">Avg Utilization</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search resources..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Resources</SelectItem>
            <SelectItem value="OVERLOADED">Overloaded</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(r => (
            <Card
              key={r.id}
              className={`transition-colors ${r.isOverloaded ? 'border-red-200 dark:border-red-900' : ''} ${canViewDetail ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-700' : ''}`}
              onClick={() => openDetail(r)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={`text-sm ${r.isOverloaded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {r.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      {r.isOverloaded && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{r.title || ROLE_LABELS[r.role]}</p>
                    {r.department && <p className="text-xs text-muted-foreground">{r.department}</p>}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{r.activeTasks} tasks</Badge>
                </div>

                {/* Hours-based utilization */}
                <div className="space-y-1.5">
                  {/* Weekly bar */}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> Week
                    </span>
                    <span className={`font-semibold ${r.isOverloadedWeekly ? 'text-red-600' : ''}`}>
                      {r.thisWeekHours}h / {r.weeklyCapacityHours}h
                    </span>
                  </div>
                  <Progress
                    value={Math.min(r.thisWeekHours / Math.max(r.weeklyCapacityHours, 1) * 100, 100)}
                    className={`h-1.5 ${r.isOverloadedWeekly ? '[&>div]:bg-red-500' : r.utilizationPct > 70 ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
                  />
                  {/* Daily bar */}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Peak day
                    </span>
                    <span className={`font-semibold ${r.isOverloadedDaily ? 'text-red-600' : ''}`}>
                      {r.maxDailyHours}h / {r.dailyCapacityHours}h
                    </span>
                  </div>
                  <Progress
                    value={Math.min(r.maxDailyHours / Math.max(r.dailyCapacityHours, 1) * 100, 100)}
                    className={`h-1.5 ${r.isOverloadedDaily ? '[&>div]:bg-red-500' : r.maxDailyHours / r.dailyCapacityHours > 0.7 ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
                  />
                  {/* Overload reason chip */}
                  {r.isOverloaded && (
                    <p className="text-xs text-red-600 font-medium">
                      {r.overloadReason === 'both'
                        ? `Overloaded: ${r.thisWeekHours}h/week & ${r.maxDailyHours}h/day peak`
                        : r.overloadReason === 'weekly'
                        ? `Weekly limit exceeded (${r.thisWeekHours}h > ${r.weeklyCapacityHours}h)`
                        : `Daily limit exceeded (${r.maxDailyHours}h > ${r.dailyCapacityHours}h/day)`}
                    </p>
                  )}
                  {r.totalTaskHours > 0 && (
                    <p className="text-xs text-muted-foreground">{r.totalTaskHours}h total backlog</p>
                  )}
                </div>

                {r.allocations.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Assigned Projects</p>
                    <div className="space-y-1">
                      {r.allocations.slice(0, 2).map(a => (
                        <div key={a.project.id} className="flex items-center justify-between">
                          <span className="text-xs truncate">{a.project.name}</span>
                          <Badge variant="secondary" className="text-xs">{a.allocationPct}%</Badge>
                        </div>
                      ))}
                      {r.allocations.length > 2 && (
                        <p className="text-xs text-muted-foreground">+{r.allocations.length - 2} more</p>
                      )}
                    </div>
                  </div>
                )}

                {canViewDetail && (
                  <p className="text-xs text-blue-500 text-center">Click to view task details</p>
                )}

                {canAssign && (
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={e => openAssign(r, e)}>
                    <ClipboardCheck className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                    Assign Work to {r.name.split(' ')[0]}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EmployeeDetailDialog
        resource={detailResource}
        open={detailOpen}
        onOpenChange={v => { setDetailOpen(v); if (!v) setDetailResource(null) }}
      />

      <AssignWorkDialog
        open={assignOpen}
        onOpenChange={v => { setAssignOpen(v); if (!v) setAssignTarget(null) }}
        prefillUserId={assignTarget?.id}
        prefillName={assignTarget?.name}
        onAssigned={load}
      />
    </div>
  )
}
