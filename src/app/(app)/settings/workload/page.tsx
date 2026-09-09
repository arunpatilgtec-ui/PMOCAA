'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Gauge, Search, ListTree, Trash2, Lock, CalendarRange, RotateCcw } from 'lucide-react'

interface UserRow {
  id: string; name: string; email: string; role: string
  capacityPct: number
  isActive: boolean; department?: string; title?: string
}

interface TaskRow {
  id: string; name: string; status: string; priority: string
  startDate?: string | null; endDate?: string | null
  estimatedHours: number; effortHours: number; ownerId: string | null
  workstream: { id: string; name: string; project: { id: string; name: string } }
}

interface OverrideRow {
  id: string; userId: string; fromDate: string; toDate: string; pct: number; createdAt: string
}

const STATUSES = ['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'REWORK', 'COMPLETED', 'CANCELLED']

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function todayInRange(fromDate: string, toDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return fromDate.slice(0, 10) <= today && today <= toDate.slice(0, 10)
}

// Re-checked fresh every visit -- deliberately no session flag is stored.
function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [passcode, setPasscode] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!passcode) return
    setChecking(true)
    setError(null)
    try {
      await api('/api/admin/panel-passcode/verify', 'POST', { passcode })
      onUnlock()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to verify')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-sm w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4 text-blue-500" /> Admin Panel
          </CardTitle>
          <p className="text-xs text-muted-foreground">Enter the admin panel passphrase to continue.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            placeholder="Passphrase"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
            autoFocus
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button size="sm" className="w-full" onClick={submit} disabled={checking || !passcode}>
            {checking ? 'Checking…' : 'Unlock'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default function WorkloadAdminPage() {
  const { user: me } = useAuthStore()
  const router = useRouter()

  const [unlocked, setUnlocked] = useState(false)

  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)

  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [loadingOverrides, setLoadingOverrides] = useState(false)
  const [newFrom, setNewFrom] = useState('')
  const [newTo, setNewTo] = useState('')
  const [newPct, setNewPct] = useState(100)
  const [addingOverride, setAddingOverride] = useState(false)

  const [capacityDraft, setCapacityDraft] = useState(100)
  const [savingCapacity, setSavingCapacity] = useState(false)

  useEffect(() => {
    if (me && me.role !== 'ADMIN') { router.replace('/settings'); return }
    if (!unlocked) return
    api('/api/users', 'GET')
      .then((d) => setUsers(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoadingUsers(false))
  }, [me, router, unlocked])

  const selected = users.find((u) => u.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) return
    setCapacityDraft(selected.capacityPct)
  }, [selected])

  const loadTasks = useCallback((id: string) => {
    setLoadingTasks(true)
    api(`/api/tasks?ownerId=${id}`, 'GET')
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load tasks'))
      .finally(() => setLoadingTasks(false))
  }, [])

  const loadOverrides = useCallback((id: string) => {
    setLoadingOverrides(true)
    api(`/api/admin/utilization-overrides?userId=${id}`, 'GET')
      .then((d) => setOverrides(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Failed to load overrides'))
      .finally(() => setLoadingOverrides(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    loadTasks(selectedId)
    loadOverrides(selectedId)
    const today = new Date().toISOString().slice(0, 10)
    setNewFrom(today); setNewTo(today); setNewPct(100)
  }, [selectedId, loadTasks, loadOverrides])

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { projectName: string; tasks: TaskRow[] }>()
    for (const t of tasks) {
      const key = t.workstream.project.id
      if (!groups.has(key)) groups.set(key, { projectName: t.workstream.project.name, tasks: [] })
      groups.get(key)!.tasks.push(t)
    }
    return [...groups.values()].sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [tasks])

  async function saveCapacity() {
    if (!selected) return
    setSavingCapacity(true)
    try {
      await api(`/api/users/${selected.id}`, 'PATCH', { capacityPct: capacityDraft })
      setUsers((prev) => prev.map((u) => u.id === selected.id ? { ...u, capacityPct: capacityDraft } : u))
      toast.success('Saved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSavingCapacity(false)
    }
  }

  async function addOverride() {
    if (!selected || !newFrom || !newTo) return
    setAddingOverride(true)
    try {
      await api('/api/admin/utilization-overrides', 'POST', {
        userId: selected.id, fromDate: newFrom, toDate: newTo, pct: newPct,
      })
      toast.success('Override added')
      loadOverrides(selected.id)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to add override')
    } finally {
      setAddingOverride(false)
    }
  }

  async function removeOverride(id: string) {
    if (!selected) return
    try {
      await api(`/api/admin/utilization-overrides/${id}`, 'DELETE')
      setOverrides((prev) => prev.filter((o) => o.id !== id))
      toast.success('Override removed')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove override')
    }
  }

  const activeOverrides = overrides.filter((o) => todayInRange(o.fromDate, o.toDate))

  async function restoreNormal() {
    if (!selected || activeOverrides.length === 0) return
    try {
      await Promise.all(activeOverrides.map((o) => api(`/api/admin/utilization-overrides/${o.id}`, 'DELETE')))
      setOverrides((prev) => prev.filter((o) => !todayInRange(o.fromDate, o.toDate)))
      toast.success('Restored to normal (calculated) utilization')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to restore')
    }
  }

  async function updateTask(taskId: string, patch: Record<string, unknown>) {
    try {
      await api(`/api/tasks/${taskId}`, 'PATCH', patch)
      if (patch.ownerId !== undefined && patch.ownerId !== selectedId) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
      } else {
        setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...patch } as TaskRow : t))
      }
      toast.success('Task updated')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update task')
    }
  }

  async function removeTask(taskId: string) {
    if (!confirm('Delete this task permanently?')) return
    try {
      await api(`/api/tasks/${taskId}`, 'DELETE')
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      toast.success('Task deleted')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete task')
    }
  }

  if (!me || me.role !== 'ADMIN') return null
  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gauge className="h-6 w-6 text-blue-500" /> Admin
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Person list */}
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">People</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search…" className="h-8 pl-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {loadingUsers ? (
              <div className="space-y-1.5">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
            ) : (
              <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
                {filtered.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedId(u.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm ${
                      selectedId === u.id ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'hover:bg-muted/60'
                    }`}
                  >
                    <span className="truncate">{u.name}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-xs text-muted-foreground italic px-2 py-3">No matches.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        {!selected ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            Select a person on the left to manage their capacity, utilization display, and tasks.
          </CardContent></Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{selected.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{selected.email}{selected.title ? ` · ${selected.title}` : ''}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Capacity % <span className="text-muted-foreground font-normal">(drives their utilization calculation)</span></Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={0} max={100}
                      value={capacityDraft}
                      onChange={(e) => setCapacityDraft(Number(e.target.value))}
                      className="h-8 text-sm w-28"
                    />
                    <Button size="sm" onClick={saveCapacity} disabled={savingCapacity || capacityDraft === selected.capacityPct}>
                      {savingCapacity ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-blue-500" /> Check Utilization
                  {activeOverrides.length > 0 && (
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={restoreNormal}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Restore Normal
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">From</Label>
                    <Input type="date" value={newFrom} onChange={(e) => setNewFrom(e.target.value)} className="h-8 text-sm w-36" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">To</Label>
                    <Input type="date" value={newTo} onChange={(e) => setNewTo(e.target.value)} className="h-8 text-sm w-36" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Utilization %</Label>
                    <Input type="number" min={0} max={200} value={newPct} onChange={(e) => setNewPct(Number(e.target.value))} className="h-8 text-sm w-24" />
                  </div>
                  <Button size="sm" onClick={addOverride} disabled={addingOverride || !newFrom || !newTo}>
                    {addingOverride ? 'Adding…' : 'Add Override'}
                  </Button>
                </div>

                {loadingOverrides ? (
                  <div className="space-y-1.5">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
                ) : overrides.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No overrides set for this person.</p>
                ) : (
                  <div className="space-y-1.5">
                    {overrides.map((o) => (
                      <div key={o.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm">
                        <span className="flex-1">
                          {o.fromDate.slice(0, 10) === o.toDate.slice(0, 10)
                            ? o.fromDate.slice(0, 10)
                            : `${o.fromDate.slice(0, 10)} → ${o.toDate.slice(0, 10)}`}
                        </span>
                        <Badge variant="secondary" className="text-xs">{o.pct}%</Badge>
                        {todayInRange(o.fromDate, o.toDate) && (
                          <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">active this week</Badge>
                        )}
                        <button onClick={() => removeOverride(o.id)} className="p-1 text-muted-foreground hover:text-red-500 shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListTree className="h-4 w-4 text-blue-500" /> Tasks ({tasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingTasks ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}</div>
                ) : tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No tasks assigned to this person.</p>
                ) : (
                  groupedTasks.map((g) => (
                    <div key={g.projectName} className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.projectName}</p>
                      <div className="space-y-1.5">
                        {g.tasks.map((t) => (
                          <div key={t.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1.5">
                            <span className="text-xs flex-1 min-w-0 truncate" title={t.name}>{t.name}</span>

                            <Select value={t.status} onValueChange={(v) => v && updateTask(t.id, { status: v })}>
                              <SelectTrigger className="h-7 text-[10px] w-28 shrink-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                              </SelectContent>
                            </Select>

                            <Input
                              type="date"
                              defaultValue={t.startDate ? t.startDate.slice(0, 10) : ''}
                              onBlur={(e) => updateTask(t.id, { startDate: e.target.value || null })}
                              className="h-7 text-[10px] w-32 shrink-0"
                            />
                            <Input
                              type="date"
                              defaultValue={t.endDate ? t.endDate.slice(0, 10) : ''}
                              onBlur={(e) => updateTask(t.id, { endDate: e.target.value || null })}
                              className="h-7 text-[10px] w-32 shrink-0"
                            />
                            <Input
                              type="number" step="0.5" min="0"
                              defaultValue={t.estimatedHours}
                              onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== t.estimatedHours) updateTask(t.id, { estimatedHours: v }) }}
                              className="h-7 text-[10px] w-16 shrink-0 text-center"
                              title="Estimated hours"
                            />

                            <Select value={t.ownerId ?? 'none'} onValueChange={(v) => v && updateTask(t.id, { ownerId: v === 'none' ? null : v })}>
                              <SelectTrigger className="h-7 text-[10px] w-32 shrink-0"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                              </SelectContent>
                            </Select>

                            <button onClick={() => removeTask(t.id)} className="p-1 text-muted-foreground hover:text-red-500 shrink-0">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
