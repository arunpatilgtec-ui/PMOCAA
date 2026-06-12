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
import { Plus, Search, UserCog, Shield } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

interface User {
  id: string; email: string; name: string; role: string; isActive: boolean
  capacityPct: number; department?: string; title?: string; createdAt: string
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin', MANAGER: 'Manager', PLANNER: 'Planner',
  PROJECT_LEAD: 'Project Lead', WORKSTREAM_LEAD: 'Workstream Lead',
  RESOURCE: 'Engineer', LEADERSHIP: 'Leadership',
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-700', MANAGER: 'bg-purple-100 text-purple-700',
  PLANNER: 'bg-blue-100 text-blue-700', PROJECT_LEAD: 'bg-green-100 text-green-700',
  WORKSTREAM_LEAD: 'bg-teal-100 text-teal-700', RESOURCE: 'bg-slate-100 text-slate-700',
  LEADERSHIP: 'bg-orange-100 text-orange-700',
}

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6, 'Min 6 chars'),
  role: z.enum(['ADMIN', 'MANAGER', 'PLANNER', 'PROJECT_LEAD', 'WORKSTREAM_LEAD', 'RESOURCE', 'LEADERSHIP']),
  capacityPct: z.number().min(0).max(100),
  department: z.string().optional(),
  title: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function UsersPage() {
  const { user: currentUser } = useAuthStore()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'RESOURCE', capacityPct: 100 },
  })

  useEffect(() => {
    if (currentUser?.role !== 'ADMIN') { router.push('/dashboard'); return }
    fetch('/api/users').then((r) => r.json()).then((d) => {
      setUsers(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [])

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('User created')
      reset(); setCreateOpen(false)
      fetch('/api/users').then((r) => r.json()).then(setUsers)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally { setSubmitting(false) }
  }

  async function toggleActive(id: string, isActive: boolean) {
    await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: !isActive } : u)))
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-red-500" /> User Management
          </h1>
          <p className="text-muted-foreground text-sm">{users.length} users</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" /> Add User
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search users..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => (
            <Card key={u.id} className={!u.isActive ? 'opacity-60' : ''}>
              <CardContent className="p-3 flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className={`text-xs ${ROLE_COLORS[u.role] || ''}`}>
                    {u.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{u.name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                    {!u.isActive && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {(u.title || u.department) && (
                    <p className="text-xs text-muted-foreground">{[u.title, u.department].filter(Boolean).join(' · ')}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-xs">{u.capacityPct}% cap</Badge>
                <Switch
                  checked={u.isActive}
                  onCheckedChange={() => toggleActive(u.id, u.isActive)}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input placeholder="John Doe" {...register('name')} />
                {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="john@company.com" {...register('email')} />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="Min 6 characters" {...register('password')} />
              {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select defaultValue="RESOURCE" onValueChange={(v) => setValue('role', v as FormData['role'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Capacity %</Label>
                <Input type="number" min="0" max="100" {...register('capacityPct', { valueAsNumber: true })} defaultValue={100} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input placeholder="e.g. Senior Engineer" {...register('title')} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="e.g. Mechanical" {...register('department')} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>Create User</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
