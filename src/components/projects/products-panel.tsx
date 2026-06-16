'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, X, User2 } from 'lucide-react'

interface ProductUser { id: string; name: string; role: string }

interface ProductResource {
  id: string
  userId: string
  subsystems: string[]
  costingTypes: string[]
  user: ProductUser
}

interface Product {
  id: string
  brand: string
  modelNo: string
  leadId?: string
  order: number
  lead?: ProductUser
  resources: ProductResource[]
}

interface ProjectInfo {
  id: string
  leadId?: string
  category?: string
  numberOfProducts?: number
  allocations: Array<{ userId: string; user: ProductUser }>
}

const REFRIGERATION_SUBSYSTEMS = [
  'Cabinet', 'Compressor', 'Evaporator', 'Condenser', 'Liner',
  'Door', 'Harness', 'PCB', 'Foam', 'Thermoformed Parts', 'Motors', 'Lighting',
]

const COSTING_TYPES = ['MECHANICAL', 'HARNESS', 'PCB']
const COSTING_LABELS: Record<string, string> = {
  MECHANICAL: 'Mechanical', HARNESS: 'Harness', PCB: 'PCB',
}

function getSubsystemsForCategory(category?: string): string[] {
  if (category === 'Refrigeration') return REFRIGERATION_SUBSYSTEMS
  return []
}

interface ProductFormState {
  brand: string
  modelNo: string
  leadId: string
  resources: Array<{ userId: string; subsystems: string[]; costingTypes: string[] }>
}

function emptyForm(): ProductFormState {
  return { brand: '', modelNo: '', leadId: '', resources: [] }
}

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
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductFormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canManage =
    ['ADMIN', 'PLANNER', 'MANAGER'].includes(user?.role || '') ||
    (user?.role === 'PROJECT_LEAD' && user.id === project.leadId)

  const subsystems = getSubsystemsForCategory(project.category)
  const allocatedUsers = project.allocations.map((a) => a.user)

  async function load() {
    try {
      const res = await fetch(`/api/projects/${project.id}/products`)
      const data = await res.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [project.id])

  function openAdd() {
    setEditingProduct(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(p: Product) {
    setEditingProduct(p)
    setForm({
      brand: p.brand,
      modelNo: p.modelNo,
      leadId: p.leadId || '',
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
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function deleteProduct(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/projects/${project.id}/products/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Product removed')
      load()
    } catch {
      toast.error('Failed to remove product')
    } finally { setDeletingId(null) }
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

  function toggleSubsystem(resourceIdx: number, sub: string) {
    setForm((f) => {
      const next = [...f.resources]
      const subs = next[resourceIdx].subsystems
      next[resourceIdx] = {
        ...next[resourceIdx],
        subsystems: subs.includes(sub) ? subs.filter((s) => s !== sub) : [...subs, sub],
      }
      return { ...f, resources: next }
    })
  }

  function toggleCostingType(resourceIdx: number, ct: string) {
    setForm((f) => {
      const next = [...f.resources]
      const cts = next[resourceIdx].costingTypes
      next[resourceIdx] = {
        ...next[resourceIdx],
        costingTypes: cts.includes(ct) ? cts.filter((c) => c !== ct) : [...cts, ct],
      }
      return { ...f, resources: next }
    })
  }

  const selectedLeadName = allocatedUsers.find((u) => u.id === form.leadId)?.name

  if (loading) {
    return <div className="text-sm text-muted-foreground p-4">Loading products…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {products.length} product{products.length !== 1 ? 's' : ''}
            {project.numberOfProducts ? ` · ${project.numberOfProducts} planned` : ''}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Product
          </Button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <User2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No products added yet</p>
          {canManage && (
            <Button variant="link" className="mt-1 text-xs" onClick={openAdd}>Add the first product</Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {products.map((p) => {
            const isOpen = expandedId === p.id
            return (
              <Card key={p.id}>
                <CardHeader
                  className="p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isOpen ? null : p.id)}
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-sm font-semibold">{p.brand}</CardTitle>
                        {p.modelNo && <span className="text-xs text-muted-foreground">· {p.modelNo}</span>}
                        {p.lead && (
                          <Badge variant="outline" className="text-xs">Lead: {p.lead.name}</Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {p.resources.length} person{p.resources.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteProduct(p.id)}
                          disabled={deletingId === p.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                {isOpen && (
                  <CardContent className="p-3 pt-0 border-t border-border/50">
                    {p.resources.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">No resources assigned</p>
                    ) : (
                      <div className="space-y-2 mt-2">
                        {p.resources.map((r) => (
                          <div key={r.id} className="rounded-md border p-2 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-700 shrink-0">
                                {r.user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-medium text-sm">{r.user.name}</span>
                              <span className="text-xs text-muted-foreground capitalize">· {r.user.role.replace(/_/g, ' ').toLowerCase()}</span>
                            </div>
                            {r.subsystems.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-xs text-muted-foreground mr-1">Teardown:</span>
                                {r.subsystems.map((s) => (
                                  <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{s}</span>
                                ))}
                              </div>
                            )}
                            {r.costingTypes.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                <span className="text-xs text-muted-foreground mr-1">Costing:</span>
                                {r.costingTypes.map((c) => (
                                  <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">{COSTING_LABELS[c] || c}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Brand *</Label>
                <Input
                  placeholder="e.g. Samsung"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Model No.</Label>
                <Input
                  placeholder="e.g. RS27T5200SR"
                  value={form.modelNo}
                  onChange={(e) => setForm((f) => ({ ...f, modelNo: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Product Lead</Label>
              <Select
                value={form.leadId || 'none'}
                onValueChange={(v) => setForm((f) => ({ ...f, leadId: !v || v === 'none' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select lead...">{selectedLeadName || null}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead</SelectItem>
                  {allocatedUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resources */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Team Members on this Product</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addResource}>
                  <Plus className="h-3 w-3 mr-1" /> Add Person
                </Button>
              </div>
              {form.resources.length === 0 && (
                <p className="text-xs text-muted-foreground">No team members assigned to this product.</p>
              )}
              {form.resources.map((r, i) => {
                const personName = allocatedUsers.find((u) => u.id === r.userId)?.name
                return (
                  <div key={i} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Select
                          value={r.userId || 'none'}
                          onValueChange={(v) => setResourceUser(i, !v || v === 'none' ? '' : v)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select person...">{personName || null}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select person…</SelectItem>
                            {allocatedUsers.map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500" onClick={() => removeResource(i)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Subsystem assignment (for teardown) */}
                    {subsystems.length > 0 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Teardown Subsystems</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {subsystems.map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => toggleSubsystem(i, sub)}
                              className={`text-xs px-2 py-1 rounded border transition-colors ${
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
                            key={ct}
                            type="button"
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
    </div>
  )
}
