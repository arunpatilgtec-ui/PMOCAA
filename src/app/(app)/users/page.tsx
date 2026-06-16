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
import {
  Plus, Search, Shield, Pencil, Trash2, KeyRound,
  UserCheck, UserX, MoreHorizontal, AlertTriangle,
  Eye, EyeOff, Copy, Check,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface User {
  id: string; email: string; name: string; role: string; isActive: boolean
  capacityPct: number; department?: string; title?: string; createdAt: string
}

const ROLES = [
  { value: 'ADMIN',           label: 'Admin',                   color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  { value: 'MANAGER',         label: 'Manager',                 color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
  { value: 'PLANNER',         label: 'Planner',                 color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  { value: 'PROJECT_LEAD',    label: 'Project Lead',            color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  { value: 'WORKSTREAM_LEAD', label: 'Workstream Lead',         color: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300' },
  { value: 'RESOURCE',        label: 'Engineer / Analyst',      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  { value: 'LEADERSHIP',      label: 'Leadership (Read-only)',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' },
]
const roleMap = Object.fromEntries(ROLES.map((r) => [r.value, r]))

const createSchema = z.object({
  name:        z.string().min(2, 'Min 2 chars'),
  email:       z.string().email('Invalid email'),
  password:    z.string().min(6, 'Min 6 chars'),
  role:        z.enum(['ADMIN','MANAGER','PLANNER','PROJECT_LEAD','WORKSTREAM_LEAD','RESOURCE','LEADERSHIP']),
  capacityPct: z.number().min(0).max(100),
  department:  z.string().optional(),
  title:       z.string().optional(),
})
const editSchema = z.object({
  name:        z.string().min(2, 'Min 2 chars'),
  email:       z.string().email('Invalid email'),
  role:        z.enum(['ADMIN','MANAGER','PLANNER','PROJECT_LEAD','WORKSTREAM_LEAD','RESOURCE','LEADERSHIP']),
  capacityPct: z.number().min(0).max(100),
  department:  z.string().optional(),
  title:       z.string().optional(),
  password:    z.string().min(6, 'Min 6 chars').optional().or(z.literal('')),
})
type CreateForm = z.infer<typeof createSchema>
type EditForm   = z.infer<typeof editSchema>

export default function UsersPage() {
  const { user: me } = useAuthStore()
  const router = useRouter()

  const [users,       setUsers]       = useState<User[]>([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [roleFilter,  setRoleFilter]  = useState<string | null>('ALL')
  const [createOpen,  setCreateOpen]  = useState(false)
  const [editTarget,  setEditTarget]  = useState<User | null>(null)
  const [deleteTarget,setDeleteTarget]= useState<User | null>(null)
  const [submitting,  setSubmitting]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)

  // Reset Password dialog state
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPwd,    setResetPwd]    = useState('')
  const [resetShow,   setResetShow]   = useState(false)
  const [resetForce,  setResetForce]  = useState(true)
  const [resetting,   setResetting]   = useState(false)
  const [resetDone,   setResetDone]   = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)

  const cForm = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { role: 'RESOURCE', capacityPct: 100 } })
  const eForm = useForm<EditForm>({ resolver: zodResolver(editSchema) })

  const load = () =>
    fetch('/api/users').then(r => r.json()).then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false) })

  useEffect(() => {
    if (me?.role !== 'ADMIN') { router.push('/dashboard'); return }
    load()
  }, [])

  function openEdit(u: User) {
    setEditTarget(u)
    eForm.reset({ name: u.name, email: u.email, role: u.role as EditForm['role'],
      capacityPct: u.capacityPct, department: u.department ?? '', title: u.title ?? '', password: '' })
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
      (!roleFilter || roleFilter === 'ALL' || u.role === roleFilter)
  })

  async function onCreate(data: CreateForm) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('User created')
      cForm.reset(); setCreateOpen(false); load()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSubmitting(false) }
  }

  async function onEdit(data: EditForm) {
    if (!editTarget) return
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = { name: data.name, email: data.email, role: data.role, capacityPct: data.capacityPct, department: data.department, title: data.title }
      if (data.password) payload.password = data.password
      const res = await fetch(`/api/users/${editTarget.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('User updated')
      setEditTarget(null); load()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSubmitting(false) }
  }

  async function onDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`${deleteTarget.name} deleted`)
      setDeleteTarget(null); load()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setDeleting(false) }
  }

  function openReset(u: User) {
    setResetTarget(u); setResetPwd(''); setResetShow(false)
    setResetForce(true); setResetDone(null); setCopied(false)
  }

  async function onReset() {
    if (!resetTarget || !resetPwd) return
    setResetting(true)
    try {
      const res = await fetch(`/api/users/${resetTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPwd, mustChangePassword: resetForce }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setResetDone(resetPwd)
      toast.success('Password reset successfully')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setResetting(false) }
  }

  async function copyPassword() {
    if (!resetDone) return
    await navigator.clipboard.writeText(resetDone)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function toggleActive(u: User) {
    try {
      await fetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !u.isActive }) })
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x))
      toast.success(u.isActive ? `${u.name} deactivated` : `${u.name} activated`)
    } catch { toast.error('Failed to update status') }
  }

  const roleCounts = ROLES.map(r => ({ ...r, count: users.filter(u => u.role === r.value).length }))

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" /> User Management
          </h1>
          <p className="text-muted-foreground text-sm">
            {users.length} total · {users.filter(u => u.isActive).length} active · {users.filter(u => !u.isActive).length} inactive
          </p>
        </div>
        <Button onClick={() => { cForm.reset({ role: 'RESOURCE', capacityPct: 100 }); setCreateOpen(true) }} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add User
        </Button>
      </div>

      {/* Role filter chips */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setRoleFilter('ALL')}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${!roleFilter || roleFilter === 'ALL' ? 'bg-foreground text-background' : 'border-border hover:bg-muted'}`}>
          All ({users.length})
        </button>
        {roleCounts.map(r => (
          <button key={r.value} onClick={() => setRoleFilter(r.value)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${roleFilter === r.value ? 'bg-foreground text-background' : 'border-border hover:bg-muted'}`}>
            {r.label} ({r.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name or email…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground">
          <Shield className="h-10 w-10 opacity-20 mb-2" /><p className="text-sm">No users found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => (
            <Card key={u.id} className={`transition-opacity ${!u.isActive ? 'opacity-50' : ''}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className={`text-xs font-semibold ${roleMap[u.role]?.color ?? ''}`}>
                    {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{u.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleMap[u.role]?.color ?? ''}`}>
                      {roleMap[u.role]?.label ?? u.role}
                    </span>
                    {!u.isActive && <Badge variant="outline" className="text-xs text-red-500 border-red-300">Inactive</Badge>}
                    {u.id === me?.id && <Badge variant="outline" className="text-xs">You</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {(u.title || u.department) && (
                    <p className="text-xs text-muted-foreground/70">{[u.title, u.department].filter(Boolean).join(' · ')}</p>
                  )}
                </div>

                <Badge variant="secondary" className="text-xs shrink-0">{u.capacityPct}% cap</Badge>

                {/* Active toggle */}
                <Switch checked={u.isActive} onCheckedChange={() => toggleActive(u)} title={u.isActive ? 'Deactivate' : 'Activate'} />

                {/* Actions dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => openEdit(u)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => openReset(u)}>
                      <KeyRound className="mr-2 h-4 w-4" /> Reset Password
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => toggleActive(u)}>
                      {u.isActive
                        ? <><UserX className="mr-2 h-4 w-4" /> Deactivate</>
                        : <><UserCheck className="mr-2 h-4 w-4" /> Activate</>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(u)}
                      disabled={u.id === me?.id}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {u.id === me?.id ? 'Cannot delete self' : 'Delete User'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <form onSubmit={cForm.handleSubmit(onCreate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input placeholder="Jane Smith" {...cForm.register('name')} />
                {cForm.formState.errors.name && <p className="text-red-500 text-xs">{cForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" placeholder="jane@company.com" {...cForm.register('email')} />
                {cForm.formState.errors.email && <p className="text-red-500 text-xs">{cForm.formState.errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Password *</Label>
              <Input type="password" placeholder="Min 6 characters" {...cForm.register('password')} />
              {cForm.formState.errors.password && <p className="text-red-500 text-xs">{cForm.formState.errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-red-500" /> Role *</Label>
              <Select defaultValue="RESOURCE" onValueChange={v => cForm.setValue('role', v as CreateForm['role'])}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="flex items-center gap-2">
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
                <Input type="number" min="0" max="100" {...cForm.register('capacityPct', { valueAsNumber: true })} defaultValue={100} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="Sr. Engineer" {...cForm.register('title')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="Mechanical" {...cForm.register('department')} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Create User</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={o => { if (!o) setEditTarget(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit — {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={eForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name *</Label>
                <Input {...eForm.register('name')} />
                {eForm.formState.errors.name && <p className="text-red-500 text-xs">{eForm.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" {...eForm.register('email')} />
                {eForm.formState.errors.email && <p className="text-red-500 text-xs">{eForm.formState.errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-red-500" /> Role</Label>
              <Select value={eForm.watch('role')} onValueChange={v => { const s = v as string | null; if (s) eForm.setValue('role', s as EditForm['role']) }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map(r => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${r.color.split(' ')[0]}`} />
                        {r.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Changing the role takes effect immediately.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Capacity %</Label>
                <Input type="number" min="0" max="100" {...eForm.register('capacityPct', { valueAsNumber: true })} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input {...eForm.register('title')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input {...eForm.register('department')} />
              </div>
            </div>
            <div className="space-y-1.5 border border-dashed rounded-lg p-3">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <KeyRound className="h-3.5 w-3.5" /> Reset Password (leave blank to keep current)
              </Label>
              <Input type="password" placeholder="New password…" {...eForm.register('password')} />
              {eForm.formState.errors.password && <p className="text-red-500 text-xs">{eForm.formState.errors.password.message}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={!!resetTarget} onOpenChange={o => { if (!o) setResetTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-500" /> Reset Password — {resetTarget?.name}
            </DialogTitle>
          </DialogHeader>
          {resetDone ? (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-green-700 dark:text-green-300">Password has been reset. Share this with the user:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white dark:bg-black border rounded px-2 py-1.5 text-sm font-mono select-all">
                    {resetDone}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyPassword} className="shrink-0 h-8 w-8 p-0">
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                {resetForce && <p className="text-xs text-green-600 dark:text-green-400">User will be required to change this on next login.</p>}
              </div>
              <Button className="w-full" onClick={() => setResetTarget(null)}>Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>New Password *</Label>
                <div className="relative">
                  <Input
                    type={resetShow ? 'text' : 'password'}
                    placeholder="Min 6 characters"
                    value={resetPwd}
                    onChange={e => setResetPwd(e.target.value)}
                    className="pr-9"
                  />
                  <button type="button" onClick={() => setResetShow(s => !s)}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    {resetShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={resetForce} onChange={e => setResetForce(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border" />
                <span className="text-sm">
                  Force user to change password on next login
                  <span className="block text-xs text-muted-foreground">Recommended when resetting a forgotten password</span>
                </span>
              </label>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
                <Button onClick={onReset} disabled={resetting || resetPwd.length < 6}>
                  <KeyRound className="mr-1.5 h-4 w-4" />
                  {resetting ? 'Resetting…' : 'Reset Password'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Delete User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
            </p>
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-700 dark:text-red-300 space-y-1">
              <p className="font-medium">This will permanently remove:</p>
              <ul className="list-disc list-inside space-y-0.5 text-red-600 dark:text-red-400">
                <li>Their account and login access</li>
                <li>All task assignments and allocations</li>
                <li>Their notifications and sessions</li>
              </ul>
              <p className="font-medium mt-2">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={onDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
                <Trash2 className="mr-1.5 h-4 w-4" />
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
