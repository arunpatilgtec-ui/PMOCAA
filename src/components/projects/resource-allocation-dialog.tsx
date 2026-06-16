'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { UserPlus } from 'lucide-react'

interface User {
  id: string; name: string; role: string; isActive: boolean
  department?: string; title?: string
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  onAllocated: () => void
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Manager', PLANNER: 'Planner',
  PROJECT_LEAD: 'Project Lead', WORKSTREAM_LEAD: 'Workstream Lead',
  RESOURCE: 'Engineer/Analyst', LEADERSHIP: 'Leadership',
}

export function ResourceAllocationDialog({ open, onOpenChange, projectId, onAllocated }: Props) {
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState('')
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
    setUserId('')
    setAllocationPct('100')
    setStartDate('')
    setEndDate('')
  }

  async function submit() {
    if (!userId) { toast.error('Select a team member'); return }
    if (!startDate || !endDate) { toast.error('Start and end dates required'); return }
    const pct = parseInt(allocationPct)
    if (isNaN(pct) || pct < 1 || pct > 100) { toast.error('Allocation must be 1–100%'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, allocationPct: pct, startDate, endDate }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      toast.success('Resource allocated to project')
      reset()
      onOpenChange(false)
      onAllocated()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to allocate')
    } finally { setSaving(false) }
  }

  const selected = users.find((u) => u.id === userId)

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" /> Add Resource to Project
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Team Member *</Label>
            <Select value={userId} onValueChange={(v) => { const s = v as string | null; if (s) setUserId(s) }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a person…" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    <span className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-xs">
                          {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      {u.name}
                      <span className="text-muted-foreground text-xs">· {ROLE_LABELS[u.role] ?? u.role}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[selected.role]}{selected.department && ` · ${selected.department}`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Allocation % *</Label>
            <Input
              type="number" min="1" max="100" placeholder="100"
              value={allocationPct} onChange={(e) => setAllocationPct(e.target.value)}
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

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              <UserPlus className="mr-1.5 h-4 w-4" />
              {saving ? 'Adding…' : 'Add Resource'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
