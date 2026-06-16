'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'

const PROJECT_TYPES = ['DTV', 'NPI', 'Architecture', 'Cost Improvement', 'Cost Avoidance', 'Teardown'] as const
type ProjectTypeOption = (typeof PROJECT_TYPES)[number]

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (projectId?: string) => void
}) {
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState('')
  const [projectType, setProjectType] = useState<ProjectTypeOption | ''>('')
  const [numberOfProducts, setNumberOfProducts] = useState('')
  const [startDate, setStartDate] = useState('')

  function reset() {
    setName(''); setProjectType(''); setNumberOfProducts(''); setStartDate('')
  }

  function handleClose(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Project name required'); return }
    if (!projectType) { toast.error('Project type required'); return }
    if (!startDate) { toast.error('Start date required'); return }

    const isTeardown = projectType === 'Teardown'
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type: isTeardown ? 'TEARDOWN' : 'OTHER',
          priority: isTeardown ? 'HIGH' : 'MEDIUM',
          startDate,
          endDate: startDate,
          projectClassification: isTeardown ? undefined : projectType,
          numberOfProducts: numberOfProducts ? parseInt(numberOfProducts, 10) : undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const project = await res.json()
      toast.success('Project created — complete setup to generate the schedule')
      reset()
      onOpenChange(false)
      onCreated(project.id)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  const isTeardown = projectType === 'Teardown'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-1">

          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input
              placeholder="e.g. Whirlpool WRB573 Teardown"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Project Type *</Label>
            <Select value={projectType} onValueChange={(v) => setProjectType(v as ProjectTypeOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type…">{projectType || null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isTeardown && (
              <p className="text-xs text-muted-foreground">Priority is automatically set to High for Teardown projects.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>No. of Products</Label>
              <Input
                type="number" min="0" placeholder="e.g. 3"
                value={numberOfProducts}
                onChange={(e) => setNumberOfProducts(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          {projectType && (
            <p className="text-xs bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-md px-3 py-2">
              {isTeardown
                ? "After creating, select the product category to auto-generate the full teardown schedule."
                : "After creating, a setup wizard will help you configure remaining details."}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !projectType}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
