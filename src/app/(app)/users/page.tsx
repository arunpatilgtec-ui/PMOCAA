'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Search, Shield, Pencil, Trash2, KeyRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface User {
  id: string; email: string; name: string; role: string; isActive: boolean
  capacityPct: number; department?: string; title?: string; createdAt: string
}

const ROLES = [
  { value: 'ADMIN', label: 'Admin', color: 'bg-red-100 text-red-700' },
  { value: 'MANAGER', label: 'Manager', color: 'bg-purple-100 text-purple-700' },
  { value: 'PLANNER', label: 'Planner', color: 'bg-blue-100 text-blue-700' },
  { value: 'PROJECT_LEAD', label: 'Project Lead', color: 'bg-green-100 text-green-700' },
  { value: 'WORKSTREAM_LEAD', label: 'Workstream Lead', color: 'bg-teal-100 text-teal-700' },
  { value: 'RESOURCE', label: 'Engineer / Analyst', color: 'bg-slate-100 text-slate-700' },
  { value: 'LEADERSHIP', label: 'Leadership (Read-only)', color: 'bg-orange-100 text-orange-700' },
]

const roleMap = Object.fromEntries(ROLES.map((r) => [r.value, r]))

const createSchema = z.object({
  name: z.string().min(2, 'Min 2 chars'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Min 6 chars'),
  role: z.enum(['ADMIN', 'MANAGER', 'PLANNER', 'PROJECT_LEAD', 'WORKSTREAM_LEAD', 'RESOURCE', 'LEADERSHIP']),
  capacityPct: z.number().min(0).max(100),
  department: z.string().optional(),
  title: z.string().optional(),
})

const editSchema = z.object({
  name: z.string().min(2, 'Min 2 chars'),
  email: z.string().email('Invalid email'),
  role: z.enum(['ADMIN', 'MANAGER', 'PLANNER', 'PROJECT_LEAD', 'WORKSTREAM_LEAD', 'RESOURCE', 'LEADERSHIP']),
  capacityPct: z.number().min(0).max(100),
  department: z.string().optional(),
  title: z.string().optional(),
  password: z.string().min(6, 'Min 6 chars').optional().or(z.literal('')),
})

type CreateFormData = z.infer<typeof createSchema>
type EditFormData = z.infer<typeof editSchema>

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | null>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const createForm = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'RESOURCE', capacityPct: 100 },
  })

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  })

  const loadUsers = () =>
    fetch('/api/users').then((r) => r.json()).then((d) => {
      setUsers(Array.isArray(d) ? d : [])
      setLoading(false)
    })

  useEffect(() => {
    if (currentUser?.role !== 'ADMIN') { router.push('/dashboard'); return }
    loadUsers()
  }, [])

  function openEdit(u: User) {
    setEditTarget(u)
    editForm.reset({
      name: u.name,
      email: u.email,
      role: u.role as EditFormData['role'],
      capacityPct: u.capacityPct,
      department: u.department ?? '',
      title: u.title ?? '',
      password: '',
    })
  }

  const filtered = users.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = !roleFilter || roleFilter === 'ALL' || u.role === roleFilter
    return matchSearch && matchRole
  })

  async function onCreate(data: CreateFormData) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('User created successfully')
      createForm.reset()
      setCreateOpen(false)
      loadUsers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally { setSubmitting(false) }
  }

  async function onEdit(data: EditFormData) {
    if (!editTarget) return
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        role: data.role,
        capacityPct: data.capacityPct,
        department: data.department,
        title: data.title,
      }
      if (data.password) payload.password = data.password
      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('User updated successfully')
      setEditTarget(null)
      loadUsers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user')
    } finally { setSubmitting(false) }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: !isActive } : u))
      toast.success(isActive ? 'User deactivated' : 'User activated')
    } catch {
      toast.error('Failed to update user status')
    }
  }

  const roleCounts = ROLES.map((r) => ({
    ...r,
    count: users.filter((u) => u.role === r.value).length,
  }))

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" /> User Management
          </h1>
          <p className="text-muted-foreground text-sm">{users.length} total users · {users.filter((u) => u.isActive).length} active</p>
        </div>
        <Button onClick={() => { createForm.reset({ role: 'RESOURCE', capacityPct: 100 }); setCreateOpen(true) }} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Role summary chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setRoleFilter('ALL')}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${!roleFilter || roleFilter === 'ALL' ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}
        >
          All ({users.length})
        </button>
        {roleCounts.map((r) => (
          <button
            key={r.value}
            onClick={() => setRoleFilter(r.value)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${roleFilter === r.value ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}
          >
            {r.label} ({r.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* User list */}
      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Shield className="h-10 w-10 opacity-20 mb-2" />
          <p className="text-sm">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card key={u.id} className={`transition-opacity ${!u.isActive ? 'opacity-50' : ''}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className={`text-xs font-semibold ${roleMap[u.role]?.color ?? ''}`}>
                    {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{u.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleMap[u.role]?.color ?? 'bg-slate-100 text-slate-600'}`}>
                      {roleMap[u.role]?.label ?? u.role}
                    </span>
                    {!u.isActive && <Badge variant="outline" className="text-xs text-red-500 border-red-300">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {(u.title || u.department) && (
                    <p className="text-xs text-muted-foreground/70">{[u.title, u.department].filter(Boolean).join(' · ')}</p>
                  )}
                </div>

                <Badge variant="secondary" className="text-xs shrink-0">{u.capacityPct}% cap</Badge>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={u.isActive}
                    onCheckedChange={() => toggleActive(u.id, u.isActive)}
                    title={u.isActive ? 'Deactivate user' : 'Activate user'}
                  />
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => openEdit(u)}
                    title="Edit user"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create User Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input placeholder="Jane Smith" {...createForm.register('name')} />
                {createForm.formState.errors.name && <p className="text-red-500 text-xs">{createForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="jane@company.com" {...createForm.register('email')} />
                {createForm.formState.errors.email && <p className="text-red-500 text-xs">{createForm.formState.errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" placeholder="Min 6 characters" {...createForm.register('password')} />
              {createForm.formState.errors.password && <p className="text-red-500 text-xs">{createForm.formState.errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select defaultValue="RESOURCE" onValueChange={(v) => createForm.setValue('role', v as CreateFormData['role'])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className={`inline-flex items-center gap-1.5`}>
                        <span className={`w-2 h-2 rounded-full ${r.color.split(' ')[0]}`} />
                        {r.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Capacity %</Label>
                <Input type="number" min="0" max="100" {...createForm.register('capacityPct', { valueAsNumber: true })} defaultValue={100} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="e.g. Sr. Engineer" {...createForm.register('title')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="e.g. Mechanical" {...createForm.register('department')} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Create User</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(o) => { if (!o) setEditTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit User — {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input {...editForm.register('name')} />
                {editForm.formState.errors.name && <p className="text-red-500 text-xs">{editForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" {...editForm.register('email')} />
                {editForm.formState.errors.email && <p className="text-red-500 text-xs">{editForm.formState.errors.email.message}</p>}
              </div>
            </div>

            {/* Role — prominently displayed */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-red-500" /> Role</Label>
              <Select
                value={editForm.watch('role')}
                onValueChange={(v) => { const s = v as string | null; if (s) editForm.setValue('role', s as EditFormData['role']) }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${r.color.split(' ')[0]}`} />
                        <span>{r.label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Changing the role immediately affects what this user can see and do.</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Capacity %</Label>
                <Input type="number" min="0" max="100" {...editForm.register('capacityPct', { valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="e.g. Sr. Engineer" {...editForm.register('title')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="e.g. Mechanical" {...editForm.register('department')} />
              </div>
            </div>

            {/* Password reset */}
            <div className="space-y-1.5 border border-dashed rounded-lg p-3">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5" /> Reset Password (leave blank to keep current)
              </Label>
              <Input type="password" placeholder="New password (min 6 chars)" {...editForm.register('password')} />
              {editForm.formState.errors.password && <p className="text-red-500 text-xs">{editForm.formState.errors.password.message}</p>}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
