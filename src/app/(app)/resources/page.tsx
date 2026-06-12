'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Users, Briefcase, Clock, Search } from 'lucide-react'

interface Resource {
  id: string; name: string; email: string; role: string
  capacityPct: number; utilizationPct: number; isOverloaded: boolean
  activeTasks: number; department?: string; title?: string
  allocations: Array<{
    allocationPct: number
    project: { id: string; name: string; status: string }
  }>
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Manager', PLANNER: 'Planner',
  PROJECT_LEAD: 'Project Lead', WORKSTREAM_LEAD: 'Workstream Lead',
  RESOURCE: 'Engineer/Analyst', LEADERSHIP: 'Leadership',
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>('ALL')

  useEffect(() => {
    fetch('/api/resources').then((r) => r.json()).then((d) => {
      setResources(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [])

  const filtered = resources.filter((r) => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      !filter || filter === 'ALL' ||
      (filter === 'OVERLOADED' && r.isOverloaded) ||
      (filter === 'AVAILABLE' && !r.isOverloaded && r.utilizationPct < 80)
    return matchSearch && matchFilter
  })

  const overloaded = resources.filter((r) => r.isOverloaded).length
  const available = resources.filter((r) => !r.isOverloaded && r.utilizationPct < 80).length
  const avgUtil = resources.length
    ? Math.round(resources.reduce((s, r) => s + r.utilizationPct, 0) / resources.length)
    : 0

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Resource Planning</h1>
        <p className="text-muted-foreground text-sm">{resources.length} team members</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{overloaded}</p>
              <p className="text-sm text-muted-foreground">Overloaded</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{available}</p>
              <p className="text-sm text-muted-foreground">Available</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{avgUtil}%</p>
              <p className="text-sm text-muted-foreground">Avg Utilization</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search resources..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Resources</SelectItem>
            <SelectItem value="OVERLOADED">Overloaded</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Card key={r.id} className={r.isOverloaded ? 'border-red-200 dark:border-red-900' : ''}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={`text-sm ${r.isOverloaded ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {r.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
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

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Utilization</span>
                    <span className={`font-medium ${r.isOverloaded ? 'text-red-600' : ''}`}>
                      {r.utilizationPct}% / {r.capacityPct}%
                    </span>
                  </div>
                  <Progress
                    value={Math.min(r.utilizationPct / r.capacityPct * 100, 100)}
                    className={`h-2 ${r.isOverloaded ? '[&>div]:bg-red-500' : r.utilizationPct > 70 ? '[&>div]:bg-orange-500' : '[&>div]:bg-green-500'}`}
                  />
                </div>

                {r.allocations.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Assigned Projects</p>
                    <div className="space-y-1">
                      {r.allocations.map((a) => (
                        <div key={a.project.id} className="flex items-center justify-between">
                          <span className="text-xs truncate">{a.project.name}</span>
                          <Badge variant="secondary" className="text-xs">{a.allocationPct}%</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
