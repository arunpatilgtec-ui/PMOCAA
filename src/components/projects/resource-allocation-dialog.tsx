'use client'

import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { UserPlus, Search, Check } from 'lucide-react'

interface User {
  id: string; name: string; role: string; isActive: boolean
  department?: string; title?: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  onAllocated: () => void
  existingUserIds?: string[]
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Manager', PLANNER: 'Planner',
  PROJECT_LEAD: 'Project Lead', WORKSTREAM_LEAD: 'Workstream Lead',
  RESOURCE: 'Engineer/Analyst', LEADERSHIP: 'Leadership',
}

export function ResourceAllocationDialog({
  open, onOpenChange, projectId, onAllocated, existingUserIds = [],
}: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [allocationPct, setAllocationPct] = useState('100')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d.filter((u: User) => u.isActive) : []))
  }, [open])

  function reset() {
    setSelectedIds(new Set())
    setSearch('')
    setAllocationPct('100')
    setStartDate('')
    setEndDate('')
  }

  function toggleUser(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(
      (u) =>
        !q ||
        u.name.toLowerCase().includes(q) ||
        (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q)
    )
  }, [users, search])

  async function submit() {
    if (selectedIds.size === 0) { toast.error('Select at least one person'); return }
    if (!startDate || !endDate) { toast.error('Start and end dates are required'); return }
    const pct = parseInt(allocationPct)
    if (isNaN(pct) || pct < 1 || pct > 100) { toast.error('Allocation must be 1–100%'); return }

    setSaving(true)
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((userId) =>
          fetch('/api/allocations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, projectId, allocationPct: pct, startDate, endDate }),
          }).then((r) => { if (!r.ok) throw new Error(); return r.json() })
        )
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed
      if (failed > 0 && succeeded === 0) {
        toast.error('All allocations failed')
      } else if (failed > 0) {
        toast.warning(`${succeeded} added, ${failed} failed`)
      } else {
        toast.success(`${succeeded} resource${succeeded !== 1 ? 's' : ''} allocated to project`)
      }
      reset()
      onOpenChange(false)
      onAllocated()
    } finally {
      setSaving(false)
    }
  }

  const count = selectedIds.size

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" /> Add Resources to Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search by name, role, or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* User list with checkboxes */}
          <div className="max-h-52 overflow-y-auto border rounded-md divide-y divide-border/50">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No people found</p>
            ) : filteredUsers.map((u) => {
              const isSelected = selectedIds.has(u.id)
              const isAlready = existingUserIds.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  disabled={isAlready}
                  onClick={() => !isAlready && toggleUser(u.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-950/30'
                      : isAlready
                      ? 'opacity-40 cursor-not-allowed bg-muted/10'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600'
                        : 'border-muted-foreground/40 bg-background'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>

                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarFallback className="text-xs bg-muted">
                      {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ROLE_LABELS[u.role] ?? u.role}
                      {u.department && ` · ${u.department}`}
                    </p>
                  </div>

                  {isAlready && (
                    <Badge variant="secondary" className="text-xs shrink-0">On team</Badge>
                  )}
                </button>
              )
            })}
          </div>

          {count > 0 && (
            <p className="text-xs font-medium text-blue-600">
              {count} person{count !== 1 ? 's' : ''} selected
            </p>
          )}

          {/* Shared allocation settings */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Allocation % <span className="text-muted-foreground font-normal">(applied to all selected)</span></Label>
              <Input
                type="number" min="1" max="100" placeholder="100"
                value={allocationPct}
                onChange={(e) => setAllocationPct(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={saving || count === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              {saving
                ? 'Adding…'
                : count > 0
                ? `Add ${count} Resource${count !== 1 ? 's' : ''}`
                : 'Add Resources'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
