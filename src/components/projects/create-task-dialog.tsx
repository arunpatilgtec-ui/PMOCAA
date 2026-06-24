'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['BACKLOG', 'PLANNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED']),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  effortHours: z.number().min(0).optional(),
  estimatedHours: z.number().min(0).optional(),
  ownerId: z.string().optional(),
})

type FormData = z.infer<typeof schema>
interface User { id: string; name: string; role: string }

export function CreateTaskDialog({
  open, onOpenChange, workstreamId, productId, onCreated, allowedUsers,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  workstreamId: string
  productId?: string
  onCreated: () => void
  allowedUsers?: Array<{ id: string; name: string; role: string }>
}) {
  const [loading, setLoading] = useState(false)
  const [fetchedUsers, setFetchedUsers] = useState<User[]>([])
  const users = allowedUsers ?? fetchedUsers

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'MEDIUM', status: 'BACKLOG', effortHours: 0, estimatedHours: 0 },
  })

  useEffect(() => {
    if (open && !allowedUsers) {
      const load = async () => {
        try {
          const r = await fetch('/api/users')
          const data = await r.json()
          setFetchedUsers(data)
        } catch { /* silent */ }
      }
      load()
    }
  }, [open, allowedUsers])

  async function onSubmit(data: FormData) {
    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, workstreamId, ...(productId ? { productId } : {}) }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Task created')
      reset()
      onOpenChange(false)
      onCreated()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Task Name</Label>
            <Input placeholder="Task name..." {...register('name')} />
            {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select defaultValue="MEDIUM" onValueChange={(v) => setValue('priority', v as FormData['priority'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select defaultValue="BACKLOG" onValueChange={(v) => setValue('status', v as FormData['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BACKLOG">Backlog</SelectItem>
                  <SelectItem value="PLANNED">Planned</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="REVIEW">Review</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" {...register('startDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" {...register('endDate')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Est. Hours</Label>
              <Input type="number" min="0" step="0.5" {...register('estimatedHours', { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Effort Hours</Label>
              <Input type="number" min="0" step="0.5" {...register('effortHours', { valueAsNumber: true })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assigned To</Label>
            <Select onValueChange={(v) => { const s = v as string | null; setValue('ownerId', !s || s === 'none' ? undefined : s) }}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
