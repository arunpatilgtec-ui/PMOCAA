'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, X, Link as LinkIcon, ChevronDown, ChevronRight } from 'lucide-react'
import {
  ALL_CATEGORIES, CATEGORY_TYPES, CATEGORY_TYPE_LABELS, CATEGORY_TEMPLATES, templateTotalDays,
} from '@/lib/project-templates'
import { addWorkingDays } from '@/lib/date-utils'

interface User { id: string; name: string; role: string }

const PROJECT_CLASSIFICATIONS = [
  'DTV',
  'NPI',
  'Architecture',
  'Cost Improvement',
  'Cost Avoidance',
]

function calcEndDate(startDate: string, category: string): string {
  if (!startDate || !CATEGORY_TEMPLATES[category]) return ''
  const totalDays = templateTotalDays(category)
  if (totalDays === 0) return ''
  const end = addWorkingDays(new Date(startDate), totalDays - 1)
  return end.toISOString().slice(0, 10)
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  // Basic fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'TEARDOWN' | 'OTHER'>('TEARDOWN')
  const [priority, setPriority] = useState('MEDIUM')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [leadId, setLeadId] = useState('')
  const [classification, setClassification] = useState('')
  const [numberOfProducts, setNumberOfProducts] = useState('')

  // Teardown-specific
  const [category, setCategory] = useState('')
  const [productType, setProductType] = useState('')

  // Links
  const [links, setLinks] = useState<string[]>([''])

  // Stage preview
  const [stagesOpen, setStagesOpen] = useState(false)

  useEffect(() => {
    if (open) {
      fetch('/api/users').then((r) => r.json()).then(setUsers).catch(() => {})
    }
  }, [open])

  useEffect(() => {
    if (type === 'TEARDOWN' && category && category !== 'Other' && startDate) {
      const auto = calcEndDate(startDate, category)
      if (auto) setEndDate(auto)
    }
  }, [category, startDate, type])

  function resetForm() {
    setName(''); setDescription(''); setType('TEARDOWN'); setPriority('MEDIUM')
    setStartDate(''); setEndDate(''); setLeadId('')
    setCategory(''); setProductType('')
    setClassification(''); setNumberOfProducts('')
    setLinks([''])
    setStagesOpen(false)
  }

  function handleClose(v: boolean) {
    if (!v) resetForm()
    onOpenChange(v)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Project name required'); return }
    if (!startDate) { toast.error('Start date required'); return }
    if (!endDate && type !== 'TEARDOWN') { toast.error('End date required'); return }
    if (type === 'TEARDOWN' && !category) { toast.error('Category required for teardown projects'); return }

    const effectivePriority = type === 'TEARDOWN' ? 'HIGH' : priority
    const effectiveEndDate = endDate || (type === 'TEARDOWN' && category && category !== 'Other'
      ? calcEndDate(startDate, category)
      : startDate)

    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          type,
          priority: effectivePriority,
          startDate,
          endDate: effectiveEndDate,
          leadId: leadId || undefined,
          category: (type === 'TEARDOWN' && category) ? category : undefined,
          productType: (type === 'TEARDOWN' && productType) ? productType : undefined,
          projectLinks: links.filter((l) => l.trim()),
          projectClassification: classification || undefined,
          numberOfProducts: numberOfProducts ? parseInt(numberOfProducts, 10) : undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Project created')
      resetForm()
      onOpenChange(false)
      onCreated()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  const templateWs = type === 'TEARDOWN' && category && CATEGORY_TEMPLATES[category]
    ? CATEGORY_TEMPLATES[category]
    : null

  const totalDays = category ? templateTotalDays(category) : 0
  const selectedLeadName = users.find((u) => u.id === leadId)?.name

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">

          {/* Name + Description */}
          <div className="space-y-1.5">
            <Label>Project Name *</Label>
            <Input
              placeholder="e.g. Competitor Teardown Q3"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Type + Classification */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project Kind</Label>
              <Select
                value={type}
                onValueChange={(v) => {
                  const val = (v ?? '') as 'TEARDOWN' | 'OTHER'
                  setType(val)
                  if (val !== 'TEARDOWN') { setCategory(''); setProductType('') }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEARDOWN">Teardown</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Project Type</Label>
              <Select value={classification || 'none'} onValueChange={(v) => setClassification(!v || v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type...">{classification || null}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {PROJECT_CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Priority (non-teardown only) + Number of Products */}
          <div className="grid grid-cols-2 gap-3">
            {type !== 'TEARDOWN' && (
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v ?? 'MEDIUM')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {type === 'TEARDOWN' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <div className="h-8 flex items-center px-3 rounded-lg border border-input bg-muted/30 text-sm text-muted-foreground">
                  High (fixed for teardown)
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>No. of Products</Label>
              <Input
                type="number"
                min="0"
                placeholder="e.g. 3"
                value={numberOfProducts}
                onChange={(e) => setNumberOfProducts(e.target.value)}
              />
            </div>
          </div>

          {/* Category + Type (Teardown only) */}
          {type === 'TEARDOWN' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={category}
                  onValueChange={(v) => {
                    setCategory(v ?? '')
                    setProductType('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category...">{category || null}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Product Sub-Type</Label>
                <Select
                  value={productType}
                  onValueChange={(v) => setProductType(v ?? '')}
                  disabled={!category || category === 'Other'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type...">{productType ? (CATEGORY_TYPE_LABELS[category]?.[productType] || productType) : null}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {category && CATEGORY_TYPES[category]
                      ? CATEGORY_TYPES[category].map((pt) => (
                          <SelectItem key={pt} value={pt}>
                            {CATEGORY_TYPE_LABELS[category]?.[pt] || pt}
                          </SelectItem>
                        ))
                      : <SelectItem value="Other">Other</SelectItem>
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Start + End Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                End Date
                {templateWs && totalDays > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">(auto: {totalDays} working days)</span>
                )}
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder={templateWs ? 'Auto-calculated' : ''}
              />
            </div>
          </div>

          {/* Stage preview for templated categories */}
          {templateWs && (
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors"
                onClick={() => setStagesOpen(!stagesOpen)}
              >
                <span>
                  Project Stages Preview
                  <Badge variant="secondary" className="ml-2 text-xs">{templateWs.reduce((s, ws) => s + ws.tasks.length, 0)} tasks</Badge>
                </span>
                {stagesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {stagesOpen && (
                <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
                  {templateWs.map((ws) => (
                    <div key={ws.name}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{ws.name}</p>
                      <div className="space-y-0.5 pl-2">
                        {ws.tasks.map((task) => (
                          <div key={task.name} className="flex items-center justify-between text-xs">
                            <span>{task.name}</span>
                            <span className="text-muted-foreground">{task.durationDays}d</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project Lead */}
          <div className="space-y-1.5">
            <Label>Project Lead</Label>
            <Select
              value={leadId || 'none'}
              onValueChange={(v) => setLeadId(!v || v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select lead...">{selectedLeadName || null}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No lead</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Google Drive Links */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <LinkIcon className="h-3.5 w-3.5" /> Project Links (Google Drive, etc.)
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setLinks([...links, ''])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Link
              </Button>
            </div>
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    placeholder="https://drive.google.com/..."
                    value={link}
                    onChange={(e) => {
                      const next = [...links]
                      next[i] = e.target.value
                      setLinks(next)
                    }}
                    className="text-sm h-8"
                  />
                  {links.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                      onClick={() => setLinks(links.filter((_, j) => j !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
