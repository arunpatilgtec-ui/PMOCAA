'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, X, User2, History,
  ClipboardList, Users, Scale,
} from 'lucide-react'
import { format } from 'date-fns'

interface ProductUser { id: string; name: string; role: string }

interface ProductResource {
  id: string; userId: string; subsystems: string[]; costingTypes: string[]
  user: ProductUser
}

interface Product {
  id: string; brand: string; modelNo: string; leadId?: string; resourceCount?: number; order: number
  lead?: ProductUser
  resources: ProductResource[]
}

interface HistoryEntry {
  id: string
  action: string
  data: Record<string, unknown>
  changedAt: string
  changedBy: { id: string; name: string; role: string }
  targetUser?: { id: string; name: string } | null
}

interface ProjectInfo {
  id: string
  leadId?: string
  category?: string
  numberOfProducts?: number
  allocations: Array<{ userId: string; user: ProductUser }>
}

interface ProductFormState {
  brand: string
  modelNo: string
  leadId: string
  resourceCount: string
  resources: Array<{ userId: string; subsystems: string[]; costingTypes: string[] }>
}

// ── Subsystem sets per category ──────────────────────────────────────────────

const SUBSYSTEMS_BY_CATEGORY: Record<string, string[]> = {
  Refrigeration: [
    'Cabinet', 'Compressor', 'Evaporator', 'Condenser', 'Liner',
    'Door', 'Harness', 'PCB', 'Foam', 'Thermoformed Parts', 'Motors', 'Lighting',
  ],
  Cooking: ['Chassis', 'Cooktop', 'Accessories', 'Cavity', 'Controls', 'Drawer', 'UI Console', 'Door'],
  Dishwasher: ['Racks', 'Water Delivery', 'Door & Aesthetics', 'Control System', 'Wash System', 'Tub & Chassis'],
  Laundry: ['Aesthetics', 'Structures', 'Performance Enablers', 'SES'],
  KASA: ['Steam & Milk Frother', 'Aesthetics & Cabinet', 'Brewing System', 'Grinding System', 'Heating System', 'Controls'],
  'Food Disposer': ['Accessories', 'Aesthetic', 'Structure', 'Water & Heating', 'Control'],
}

const COSTING_TYPES = ['MECHANICAL', 'HARNESS', 'PCB'] as const
const COSTING_LABELS: Record<string, string> = { MECHANICAL: 'Mechanical', HARNESS: 'Harness', PCB: 'PCB' }

function emptyForm(): ProductFormState {
  return { brand: '', modelNo: '', leadId: '', resourceCount: '', resources: [] }
}

// ── History action description ────────────────────────────────────────────────

function describeAction(entry: HistoryEntry): { label: string; detail: string } {
  const d = entry.data
  const target = entry.targetUser?.name ?? (d.userName as string) ?? '?'

  switch (entry.action) {
    case 'PRODUCT_CREATED':
      return { label: 'Product created', detail: `${d.brand || ''} ${d.modelNo || ''}`.trim() }
    case 'RESOURCE_ADDED': {
      const subs = (d.subsystems as string[]) ?? []
      const cts = (d.costingTypes as string[]) ?? []
      const parts = []
      if (subs.length) parts.push(subs.join(', '))
      if (cts.length) parts.push(`Costing: ${cts.map((c) => COSTING_LABELS[c] || c).join(', ')}`)
      return { label: `${target} assigned`, detail: parts.join(' · ') || 'No subsystems' }
    }
    case 'RESOURCE_REMOVED':
      return { label: `${target} removed`, detail: '' }
    case 'SUBSYSTEMS_CHANGED': {
      const from = (d.from as string[]) ?? []
      const to = (d.to as string[]) ?? []
      return {
        label: `${target} — subsystems updated`,
        detail: `${from.join(', ') || 'none'} → ${to.join(', ') || 'none'}`,
      }
    }
    case 'COSTING_CHANGED': {
      const from = ((d.from as string[]) ?? []).map((c) => COSTING_LABELS[c] || c)
      const to = ((d.to as string[]) ?? []).map((c) => COSTING_LABELS[c] || c)
      return {
        label: `${target} — costing updated`,
        detail: `${from.join(', ') || 'none'} → ${to.join(', ') || 'none'}`,
      }
    }
    case 'LEAD_ASSIGNED':
      return { label: 'Lead assigned', detail: d.toName as string ?? '—' }
    case 'LEAD_CHANGED': {
      const from = (d.fromName as string) || 'None'
      const to = (d.toName as string) || 'None'
      return { label: 'Lead changed', detail: `${from} → ${to}` }
    }
    default:
      return { label: entry.action.replace(/_/g, ' '), detail: '' }
  }
}

// ── ProductHistoryPanel ───────────────────────────────────────────────────────

function ProductHistoryPanel({ productId, projectId }: { productId: string; projectId: string }) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/products/${productId}/history`)
        const data = await res.json()
        setHistory(Array.isArray(data) ? data : [])
      } catch { /* silent */ } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [productId, projectId])

  if (loading) return <p className="text-xs text-muted-foreground py-2">Loading history…</p>
  if (history.length === 0) return <p className="text-xs text-muted-foreground py-2">No changes recorded yet.</p>

  return (
    <div className="space-y-2">
      {history.map((entry) => {
        const { label, detail } = describeAction(entry)
        return (
          <div key={entry.id} className="flex gap-3 text-xs">
            <div className="w-[90px] shrink-0 text-muted-foreground tabular-nums">
              {format(new Date(entry.changedAt), 'MMM d, HH:mm')}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{label}</span>
              {detail && <span className="text-muted-foreground ml-1">— {detail}</span>}
              <div className="text-muted-foreground/70">by {entry.changedBy.name}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ProductsPanel({
  project,
  onRefresh,
}: {
  project: ProjectInfo
  onRefresh: () => void
}) {
  const { user } = useAuthStore()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedTab, setExpandedTab] = useState<Record<string, 'resources' | 'history'>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null)

  const canManage =
    ['ADMIN', 'PLANNER', 'MANAGER'].includes(user?.role || '') ||
    (user?.role === 'PROJECT_LEAD' && user.id === project.leadId)

  const subsystems = SUBSYSTEMS_BY_CATEGORY[project.category ?? ''] ?? []
  const allocatedUsers = project.allocations.map((a) => a.user)

  // Also fetch all project users for lead selection (not just allocated)
  const [allUsers, setAllUsers] = useState<ProductUser[]>([])
  useEffect(() => {
    if (!canManage) return
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setAllUsers(Array.isArray(d) ? d.filter((u: ProductUser & { isActive?: boolean }) => u.isActive !== false) : []))
      .catch(() => {})
  }, [canManage])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project.id}/products`)
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    load()
  }, [load])

  function openAdd() {
    setEditingProduct(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(p: Product, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingProduct(p)
    setForm({
      brand: p.brand,
      modelNo: p.modelNo,
      leadId: p.leadId || '',
      resourceCount: p.resourceCount ? String(p.resourceCount) : '',
      resources: p.resources.map((r) => ({
        userId: r.userId,
        subsystems: [...r.subsystems],
        costingTypes: [...r.costingTypes],
      })),
    })
    setDialogOpen(true)
  }

  async function save() {
    if (!form.brand.trim()) { toast.error('Brand is required'); return }
    setSaving(true)
    try {
      const body = {
        brand: form.brand.trim(),
        modelNo: form.modelNo.trim(),
        leadId: form.leadId || null,
        resourceCount: form.resourceCount ? parseInt(form.resourceCount, 10) : null,
        resources: form.resources.filter((r) => r.userId),
      }
      let res: Response
      if (editingProduct) {
        res = await fetch(`/api/projects/${project.id}/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch(`/api/projects/${project.id}/products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(editingProduct ? 'Product updated' : 'Product added')
      setDialogOpen(false)
      load()
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function confirmDelete(p: Product) {
    setDeletingId(p.id)
    try {
      const res = await fetch(`/api/projects/${project.id}/products/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Product removed')
      load()
      onRefresh()
    } catch {
      toast.error('Failed to remove product')
    } finally { setDeletingId(null); setDeleteConfirm(null) }
  }

  function addResource() {
    setForm((f) => ({ ...f, resources: [...f.resources, { userId: '', subsystems: [], costingTypes: [] }] }))
  }

  function removeResource(i: number) {
    setForm((f) => ({ ...f, resources: f.resources.filter((_, j) => j !== i) }))
  }

  function setResourceUser(i: number, userId: string) {
    setForm((f) => {
      const next = [...f.resources]
      next[i] = { ...next[i], userId }
      return { ...f, resources: next }
    })
  }

  function toggleSubsystem(ri: number, sub: string) {
    setForm((f) => {
      const next = [...f.resources]
      const subs = next[ri].subsystems
      next[ri] = { ...next[ri], subsystems: subs.includes(sub) ? subs.filter((s) => s !== sub) : [...subs, sub] }
      return { ...f, resources: next }
    })
  }

  function toggleCostingType(ri: number, ct: string) {
    setForm((f) => {
      const next = [...f.resources]
      const cts = next[ri].costingTypes
      next[ri] = { ...next[ri], costingTypes: cts.includes(ct) ? cts.filter((c) => c !== ct) : [...cts, ct] }
      return { ...f, resources: next }
    })
  }

  function autoDistribute() {
    if (subsystems.length === 0) return
    const filledCount = form.resources.filter((r) => r.userId).length
    if (filledCount < 2) return

    setForm((f) => {
      // Prefer assigning subsystems to MECHANICAL resources; fall back to all
      const filled = f.resources.map((r, i) => ({ r, i })).filter(({ r }) => r.userId)
      const mechanical = filled.filter(({ r }) => r.costingTypes.includes('MECHANICAL'))
      const targets = mechanical.length > 0 ? mechanical : filled
      const n = targets.length
      const chunkSize = Math.floor(subsystems.length / n)
      const remainder = subsystems.length % n

      const next = f.resources.map((r) => ({ ...r, subsystems: [] as string[] }))
      targets.forEach(({ i }, ti) => {
        const start = ti * chunkSize + Math.min(ti, remainder)
        const size = chunkSize + (ti < remainder ? 1 : 0)
        next[i] = { ...next[i], subsystems: subsystems.slice(start, start + size) }
      })
      return { ...f, resources: next }
    })
  }

  function getTab(productId: string) {
    return expandedTab[productId] ?? 'resources'
  }

  function setTab(productId: string, tab: 'resources' | 'history') {
    setExpandedTab((t) => ({ ...t, [productId]: tab }))
  }

  const leadOptions = allUsers.length > 0 ? allUsers : allocatedUsers

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading products…</div>
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {products.length} product{products.length !== 1 ? 's' : ''}
          {project.numberOfProducts ? ` of ${project.numberOfProducts} planned` : ''}
        </p>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Product
          </Button>
        )}
      </div>

      {/* Empty state */}
      {products.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground border-2 border-dashed rounded-lg">
          <User2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No products added yet</p>
          {canManage && (
            <Button variant="link" className="mt-1 text-xs" onClick={openAdd}>Add the first product</Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const isOpen = expandedId === p.id
            const tab = getTab(p.id)
            const assignedCount = p.resources.length
            const plannedCount = p.resourceCount

            return (
              <Card key={p.id} className="overflow-hidden">
                {/* Card header row */}
                <CardHeader
                  className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                >
                  <div className="flex items-center gap-3">
                    {isOpen
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{p.brand}</span>
                        {p.modelNo && (
                          <span className="text-xs text-muted-foreground font-mono">{p.modelNo}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {p.lead && (
                          <Badge variant="outline" className="text-xs h-5">
                            Lead: {p.lead.name}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs h-5">
                          {assignedCount}{plannedCount ? `/${plannedCount}` : ''} resource{assignedCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit product" onClick={(e) => openEdit(p, e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          title="Remove product"
                          disabled={deletingId === p.id}
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p) }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                {/* Expanded content */}
                {isOpen && (
                  <CardContent className="p-0 border-t border-border/50">
                    {/* Tab switcher */}
                    <div className="flex gap-0 border-b border-border/50">
                      <button
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                          tab === 'resources'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setTab(p.id, 'resources')}
                      >
                        <Users className="h-3.5 w-3.5" /> Resources
                      </button>
                      <button
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
                          tab === 'history'
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setTab(p.id, 'history')}
                      >
                        <History className="h-3.5 w-3.5" /> History
                      </button>
                    </div>

                    <div className="p-3">
                      {/* Resources tab */}
                      {tab === 'resources' && (
                        <>
                          {p.resources.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-3 text-center">
                              No resources assigned
                              {plannedCount && assignedCount < plannedCount && (
                                <span> ({plannedCount - assignedCount} slot{plannedCount - assignedCount !== 1 ? 's' : ''} open)</span>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {p.resources.map((r) => (
                                <div key={r.id} className="rounded-md border p-2.5">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[10px] font-bold text-blue-700 dark:text-blue-300 shrink-0">
                                      {r.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="text-sm font-medium">{r.user.name}</span>
                                      <span className="text-xs text-muted-foreground ml-1.5 capitalize">
                                        {r.user.role.replace(/_/g, ' ').toLowerCase()}
                                      </span>
                                    </div>
                                  </div>
                                  {r.subsystems.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className="text-xs text-muted-foreground mr-0.5">Subsystems:</span>
                                      {r.subsystems.map((s) => (
                                        <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{s}</span>
                                      ))}
                                    </div>
                                  )}
                                  {r.costingTypes.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className="text-xs text-muted-foreground mr-0.5">Costing:</span>
                                      {r.costingTypes.map((c) => (
                                        <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">{COSTING_LABELS[c] || c}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Workload distribution (shown when 2+ resources and category has subsystems) */}
                          {p.resources.length >= 2 && subsystems.length > 0 && (
                            <div className="mt-3 pt-2.5 border-t border-border/40 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <Scale className="h-3 w-3 text-muted-foreground" />
                                <p className="text-xs font-medium text-muted-foreground">Workload Distribution</p>
                              </div>
                              {p.resources.map((r) => {
                                const pct = Math.round((r.subsystems.length / subsystems.length) * 100)
                                return (
                                  <div key={r.id} className="flex items-center gap-2">
                                    <span className="text-xs w-20 truncate shrink-0 text-foreground/70">
                                      {r.user.name.split(' ')[0]}
                                    </span>
                                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums w-16 text-right">
                                      {r.subsystems.length}/{subsystems.length} · {pct}%
                                    </span>
                                  </div>
                                )
                              })}
                              {(() => {
                                const assigned = new Set(p.resources.flatMap((r) => r.subsystems))
                                const uncovered = subsystems.filter((s) => !assigned.has(s))
                                if (uncovered.length === subsystems.length) return null
                                return uncovered.length > 0 ? (
                                  <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-0.5">
                                    ⚠ {uncovered.length} subsystem{uncovered.length !== 1 ? 's' : ''} not yet assigned
                                  </p>
                                ) : (
                                  <p className="text-[11px] text-green-600 dark:text-green-400 pt-0.5">
                                    ✓ All {subsystems.length} subsystems assigned
                                  </p>
                                )
                              })()}
                            </div>
                          )}

                          {canManage && (
                            <Button
                              variant="outline" size="sm" className="h-7 text-xs mt-3 w-full"
                              onClick={(e) => openEdit(p, e)}
                            >
                              <Pencil className="h-3 w-3 mr-1" /> Edit / Reassign Resources
                            </Button>
                          )}
                        </>
                      )}

                      {/* History tab */}
                      {tab === 'history' && (
                        <ProductHistoryPanel productId={p.id} projectId={project.id} />
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Basic fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand *</Label>
                <Input
                  placeholder="e.g. Samsung"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Model Number</Label>
                <Input
                  placeholder="e.g. RS27T5200SR"
                  value={form.modelNo}
                  onChange={(e) => setForm((f) => ({ ...f, modelNo: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Product Lead</Label>
                <Select
                  value={form.leadId || 'none'}
                  onValueChange={(v) => { const s = v as string | null; setForm((f) => ({ ...f, leadId: !s || s === 'none' ? '' : s })) }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No lead">
                      {leadOptions.find((u) => u.id === form.leadId)?.name || null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lead</SelectItem>
                    {leadOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Planned Resources</Label>
                <Input
                  type="number" min="0" placeholder="e.g. 3"
                  value={form.resourceCount}
                  onChange={(e) => setForm((f) => ({ ...f, resourceCount: e.target.value }))}
                />
              </div>
            </div>

            {/* Resources */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Assigned Resources</Label>
                <div className="flex items-center gap-1.5">
                  {form.resources.filter((r) => r.userId).length >= 2 && subsystems.length > 0 && (
                    <Button
                      type="button" variant="outline" size="sm"
                      className="h-6 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={autoDistribute}
                    >
                      <Scale className="h-3 w-3" /> Auto-Distribute
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addResource}>
                    <Plus className="h-3 w-3 mr-1" /> Add Person
                  </Button>
                </div>
              </div>

              {form.resources.length === 0 && (
                <p className="text-xs text-muted-foreground">No resources assigned yet.</p>
              )}

              {form.resources.map((r, i) => {
                const personName = leadOptions.find((u) => u.id === r.userId)?.name
                return (
                  <div key={i} className="rounded-md border p-3 space-y-3 bg-muted/20">
                    {/* Person selector */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select
                          value={r.userId || 'none'}
                          onValueChange={(v) => { const s = v as string | null; setResourceUser(i, !s || s === 'none' ? '' : s) }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select person…">{personName || null}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select person…</SelectItem>
                            {leadOptions.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {subsystems.length > 0 && r.subsystems.length > 0 && (
                        <span className="text-xs font-semibold text-blue-600 shrink-0 tabular-nums">
                          {Math.round((r.subsystems.length / subsystems.length) * 100)}%
                        </span>
                      )}
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0"
                        onClick={() => removeResource(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Subsystem assignment */}
                    {subsystems.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Subsystems</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {subsystems.map((sub) => (
                            <button
                              key={sub} type="button"
                              onClick={() => toggleSubsystem(i, sub)}
                              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                                r.subsystems.includes(sub)
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-border hover:border-blue-400 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Costing types */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Costing Responsibility</Label>
                      <div className="flex gap-2">
                        {COSTING_TYPES.map((ct) => (
                          <button
                            key={ct} type="button"
                            onClick={() => toggleCostingType(i, ct)}
                            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                              r.costingTypes.includes(ct)
                                ? 'bg-orange-500 text-white border-orange-500'
                                : 'border-border hover:border-orange-400 text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {COSTING_LABELS[ct]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : editingProduct ? 'Save Changes' : 'Add Product'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={(v) => { if (!v) setDeleteConfirm(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Remove Product</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <strong>{deleteConfirm?.brand} {deleteConfirm?.modelNo}</strong> and all its resource assignments? This cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!!deletingId}
              onClick={() => deleteConfirm && confirmDelete(deleteConfirm)}
            >
              {deletingId ? 'Removing…' : 'Remove Product'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
