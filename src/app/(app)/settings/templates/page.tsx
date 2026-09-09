'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Image from 'next/image'
import {
  Plus, Pencil, Trash2, X, Check, ChevronUp, ChevronDown,
  LayoutTemplate, Layers, ListTree, Wrench, EyeOff, Eye, Tags, ImageIcon, Upload, GitBranch,
  GitFork, Copy, Save,
} from 'lucide-react'
import { templateScheduleDays } from '@/lib/date-utils'

interface ModelType { id: string; code: string; label: string; order: number }
interface TaskT { id: string; name: string; durationDays: number; estimatedHours: number; order: number; parallelGroup: string | null }
interface Workstream { id: string; name: string; order: number; modelTypeId: string | null; tasks: TaskT[] }
interface Category {
  id: string; name: string; order: number; isActive: boolean
  modelTypes: ModelType[]; workstreams: Workstream[]
}
interface CostingType { id: string; code: string; label: string; order: number }
interface ProjectType { id: string; name: string; order: number }

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function TemplatesSettingsPage() {
  const { user } = useAuthStore()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [costingTypes, setCostingTypes] = useState<CostingType[]>([])
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')

  // Only the very first load shows the full-page "Loading…" state. Every reload
  // after an edit (adding a task, renaming a phase, etc.) refetches quietly in
  // the background instead -- previously this blanked the whole page on every
  // single save, which made adding several tasks in a row unbearable.
  const load = useCallback(async () => {
    try {
      const [cats, costs, types] = await Promise.all([
        api('/api/admin/template-config/categories', 'GET'),
        api('/api/admin/template-config/costing-types', 'GET'),
        api('/api/admin/template-config/project-types', 'GET'),
      ])
      setCategories(cats)
      setCostingTypes(costs)
      setProjectTypes(types)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      router.replace('/settings')
      return
    }
    load()
  }, [user, router, load])

  if (!user || user.role !== 'ADMIN') return null

  const selected = categories.find((c) => c.id === selectedId) ?? null

  async function createCategory() {
    if (!newCategoryName.trim()) return
    try {
      await api('/api/admin/template-config/categories', 'POST', { name: newCategoryName.trim() })
      setNewCategoryName('')
      toast.success('Category added')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add category')
    }
  }

  async function renameCategory(id: string, name: string) {
    try {
      await api(`/api/admin/template-config/categories/${id}`, 'PATCH', { name })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename category')
    }
  }

  async function toggleCategoryActive(cat: Category) {
    try {
      await api(`/api/admin/template-config/categories/${cat.id}`, 'PATCH', { isActive: !cat.isActive })
      toast.success(cat.isActive ? 'Category hidden from new-project setup' : 'Category re-enabled')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update category')
    }
  }

  async function deleteCategory(cat: Category) {
    if (!confirm(`Delete "${cat.name}"? This removes its templates, model types, and subsystems too.`)) return
    try {
      await api(`/api/admin/template-config/categories/${cat.id}`, 'DELETE', undefined)
      if (selectedId === cat.id) setSelectedId(null)
      toast.success('Category deleted')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete category')
    }
  }

  async function moveCategory(cat: Category, dir: -1 | 1) {
    const sorted = [...categories].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((c) => c.id === cat.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    try {
      await Promise.all([
        api(`/api/admin/template-config/categories/${cat.id}`, 'PATCH', { order: swapWith.order }),
        api(`/api/admin/template-config/categories/${swapWith.id}`, 'PATCH', { order: cat.order }),
      ])
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder')
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutTemplate className="h-6 w-6 text-blue-500" /> Templates & Categories
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage product categories, teardown/costing templates, subsystems, and costing types —
          no code changes required. Edits here apply immediately to new project setups.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Category list */}
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {[...categories].sort((a, b) => a.order - b.order).map((cat, i, arr) => (
                <div
                  key={cat.id}
                  onClick={() => setSelectedId(cat.id)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer text-sm group ${
                    selectedId === cat.id ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'hover:bg-muted/60'
                  } ${!cat.isActive ? 'opacity-50' : ''}`}
                >
                  <span className="flex-1 truncate">{cat.name}</span>
                  {!cat.isActive && <Badge variant="secondary" className="text-[10px] h-4 px-1">hidden</Badge>}
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); moveCategory(cat, -1) }} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); moveCategory(cat, 1) }} disabled={i === arr.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); toggleCategoryActive(cat) }} className="p-0.5 text-muted-foreground hover:text-foreground" title={cat.isActive ? 'Hide from setup' : 'Re-enable'}>
                      {cat.isActive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteCategory(cat) }} className="p-0.5 text-muted-foreground hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-1.5 pt-2 border-t mt-2">
                <Input
                  placeholder="New category…"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createCategory() }}
                  className="h-8 text-sm"
                />
                <Button size="sm" className="h-8 shrink-0" onClick={createCategory}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Detail panel */}
          <div className="space-y-6">
            {selected ? (
              <CategoryDetail key={selected.id} category={selected} onRename={renameCategory} onReload={load} />
            ) : (
              <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
                Select a category on the left, or add a new one, to edit its model types, subsystems, and teardown/costing template.
              </CardContent></Card>
            )}

            <CostingTypesCard costingTypes={costingTypes} onReload={load} />
            <ProjectTypesCard projectTypes={projectTypes} onReload={load} />
            <DashboardBannerCard />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category detail (model types, subsystems, workstreams/tasks) ──────────────

function CategoryDetail({
  category, onRename, onReload,
}: { category: Category; onRename: (id: string, name: string) => void; onReload: () => void }) {
  const [nameDraft, setNameDraft] = useState(category.name)
  const [editingName, setEditingName] = useState(false)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {editingName ? (
            <>
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-8 text-sm max-w-[240px]"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') { onRename(category.id, nameDraft); setEditingName(false) } }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { onRename(category.id, nameDraft); setEditingName(false) }}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setNameDraft(category.name); setEditingName(false) }}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              {category.name}
              <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="workstreams">
          <TabsList>
            <TabsTrigger value="workstreams"><ListTree className="h-3.5 w-3.5 mr-1" /> Workstreams & Tasks</TabsTrigger>
            <TabsTrigger value="modeltypes"><Layers className="h-3.5 w-3.5 mr-1" /> Model Types</TabsTrigger>
          </TabsList>

          <TabsContent value="workstreams" className="pt-4">
            <WorkstreamsEditor category={category} onReload={onReload} />
          </TabsContent>
          <TabsContent value="modeltypes" className="pt-4">
            <ModelTypesEditor category={category} onReload={onReload} />
          </TabsContent>
        </Tabs>
        <p className="text-xs text-muted-foreground mt-3">
          Subsystems shown in the Products tab come directly from the <strong>Tear Down</strong> phase&apos;s task names above —
          rename or add tasks there to change what shows up for resource/costing assignment.
        </p>
      </CardContent>
    </Card>
  )
}

// ── Model types ─────────────────────────────────────────────────────────────

function ModelTypesEditor({ category, onReload }: { category: Category; onReload: () => void }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')

  async function add() {
    if (!code.trim()) return
    try {
      await api(`/api/admin/template-config/categories/${category.id}/model-types`, 'POST', { code: code.trim(), label: label.trim() || code.trim() })
      setCode(''); setLabel('')
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add model type')
    }
  }

  async function remove(id: string, label: string) {
    if (!confirm(
      `Delete model type "${label}"? This also deletes every workstream/task scoped to it, and any ` +
      `existing project using this model type code will lose that assignment. This can't be undone.`
    )) return
    try {
      await api(`/api/admin/template-config/model-types/${id}`, 'DELETE', undefined)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    }
  }

  async function updateLabel(id: string, newLabel: string) {
    try {
      await api(`/api/admin/template-config/model-types/${id}`, 'PATCH', { label: newLabel })
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Model-type codes shown in the "Product Type" dropdown when setting up a {category.name} project.
      </p>
      <div className="space-y-1.5">
        {category.modelTypes.map((mt) => (
          <div key={mt.id} className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono w-16 justify-center shrink-0">{mt.code}</Badge>
            <Input
              defaultValue={mt.label}
              onBlur={(e) => { if (e.target.value !== mt.label) updateLabel(mt.id, e.target.value) }}
              className="h-8 text-sm flex-1"
            />
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0" onClick={() => remove(mt.id, mt.label)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {category.modelTypes.length === 0 && <p className="text-xs text-muted-foreground italic">No model types yet.</p>}
      </div>
      <div className="flex gap-1.5 pt-2 border-t">
        <Input placeholder="Code (e.g. BM)" value={code} onChange={(e) => setCode(e.target.value)} className="h-8 text-sm w-32" />
        <Input placeholder="Label (e.g. Bottom Mount)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-sm flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <Button size="sm" className="h-8 shrink-0" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  )
}

// ── Workstreams & tasks ─────────────────────────────────────────────────────

function WorkstreamsEditor({ category, onReload }: { category: Category; onReload: () => void }) {
  const [newWsName, setNewWsName] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set(category.workstreams.map((w) => w.id)))
  // null = "Shared" scope (modelTypeId === null, applies to every model type in this category).
  // Otherwise a TemplateModelType id — that tab shows shared phases plus that type's own.
  const [scopeId, setScopeId] = useState<string | null>(null)

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const scopedWorkstreams = category.workstreams.filter((w) =>
    scopeId === null ? w.modelTypeId === null : w.modelTypeId === null || w.modelTypeId === scopeId
  )

  async function addWorkstream() {
    if (!newWsName.trim()) return
    try {
      await api(`/api/admin/template-config/categories/${category.id}/workstreams`, 'POST', { name: newWsName.trim(), modelTypeId: scopeId })
      setNewWsName('')
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add workstream')
    }
  }

  async function renameWorkstream(id: string, name: string) {
    try {
      await api(`/api/admin/template-config/workstreams/${id}`, 'PATCH', { name })
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to rename')
    }
  }

  async function deleteWorkstream(id: string, name: string) {
    if (!confirm(`Delete workstream "${name}" and all its tasks?`)) return
    try {
      await api(`/api/admin/template-config/workstreams/${id}`, 'DELETE', undefined)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete')
    }
  }

  async function moveWorkstream(ws: Workstream, dir: -1 | 1) {
    const sorted = [...scopedWorkstreams].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((w) => w.id === ws.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    try {
      await Promise.all([
        api(`/api/admin/template-config/workstreams/${ws.id}`, 'PATCH', { order: swapWith.order }),
        api(`/api/admin/template-config/workstreams/${swapWith.id}`, 'PATCH', { order: ws.order }),
      ])
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder')
    }
  }

  async function setWorkstreamScope(ws: Workstream, newScopeId: string | null) {
    // Reassigning a SHARED phase to one model type doesn't create independent
    // copies -- it strips the phase (and every task in it) from every other
    // model type in the category. Use "Split by Model Type" for that instead.
    if (ws.modelTypeId === null && newScopeId !== null) {
      const otherTypes = category.modelTypes.filter((mt) => mt.id !== newScopeId)
      if (otherTypes.length > 0 && !confirm(
        `"${ws.name}" is currently shared across all model types. Scoping it to one model type will ` +
        `remove it (and all its tasks) from ${otherTypes.map((m) => m.code).join(', ')}. ` +
        `Use "Split by Model Type" instead if you want each type to keep its own independent copy. Continue anyway?`
      )) return
    }
    try {
      await api(`/api/admin/template-config/workstreams/${ws.id}`, 'PATCH', { modelTypeId: newScopeId })
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update scope')
    }
  }

  // Turns a single shared phase into one independent copy per model type, so
  // each can diverge (different tasks/days) without affecting the others. The
  // original shared phase is removed afterward -- otherwise it would still
  // apply everywhere *in addition to* the new copies, doubling every task.
  async function splitByModelType(ws: Workstream) {
    if (category.modelTypes.length === 0) return
    if (!confirm(
      `Give each model type (${category.modelTypes.map((m) => m.code).join(', ')}) its own independent copy of "${ws.name}"? ` +
      `The shared version will be replaced by ${category.modelTypes.length} separate copies you can edit independently.`
    )) return
    try {
      for (const mt of category.modelTypes) {
        const newWs = await api(`/api/admin/template-config/categories/${category.id}/workstreams`, 'POST', {
          name: ws.name, modelTypeId: mt.id,
        })
        for (const t of [...ws.tasks].sort((a, b) => a.order - b.order)) {
          await api(`/api/admin/template-config/workstreams/${newWs.id}/tasks`, 'POST', {
            name: t.name, durationDays: t.durationDays, parallelGroup: t.parallelGroup,
          })
        }
      }
      await api(`/api/admin/template-config/workstreams/${ws.id}`, 'DELETE', undefined)
      toast.success(`Split "${ws.name}" into ${category.modelTypes.length} independent copies`)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to split phase')
    }
  }

  // One-time, one-directional copy of the current scope's Tear Down tasks into
  // its Costing phase (creating the phase if needed) -- a starting point admins
  // then edit independently. Never runs the other way (Costing -> Tear Down).
  async function copyTearDownToCosting() {
    const tearDown = scopedWorkstreams.find((w) => w.name === 'Tear Down')
    if (!tearDown || tearDown.tasks.length === 0) {
      toast.error('No Tear Down tasks to copy for this scope')
      return
    }
    try {
      const existingCosting = scopedWorkstreams.find((w) => w.name === 'Costing')
      const costing: { id: string } = existingCosting ?? await api(`/api/admin/template-config/categories/${category.id}/workstreams`, 'POST', {
        name: 'Costing', modelTypeId: scopeId,
      })
      for (const t of [...tearDown.tasks].sort((a, b) => a.order - b.order)) {
        await api(`/api/admin/template-config/workstreams/${costing.id}/tasks`, 'POST', {
          name: t.name, durationDays: t.durationDays, parallelGroup: t.parallelGroup,
        })
      }
      toast.success(`Copied ${tearDown.tasks.length} task(s) to Costing`)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to copy tasks')
    }
  }

  const orderedTasks = [...scopedWorkstreams]
    .sort((a, b) => a.order - b.order)
    .flatMap((w) => [...w.tasks].sort((a, b) => a.order - b.order))
  const totalDays = templateScheduleDays(orderedTasks)
  const totalTasks = orderedTasks.length
  const groupCounts = new Map<string, number>()
  for (const t of orderedTasks) {
    if (t.parallelGroup) groupCounts.set(t.parallelGroup, (groupCounts.get(t.parallelGroup) ?? 0) + 1)
  }
  const activeGroups = [...groupCounts.entries()].filter(([, count]) => count > 1)
  const parallelCount = activeGroups.reduce((s, [, count]) => s + count, 0)
  const allGroupLabels = [...groupCounts.keys()].sort()
  const scopeLabel = scopeId === null ? 'every model type' : category.modelTypes.find((m) => m.id === scopeId)?.label ?? 'this model type'

  return (
    <div className="space-y-3">
      {category.modelTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pb-1">
          <button
            onClick={() => setScopeId(null)}
            className={`text-xs px-2.5 py-1 rounded-full border ${scopeId === null ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/60'}`}
          >
            All Model Types
          </button>
          {category.modelTypes.map((mt) => (
            <button
              key={mt.id}
              onClick={() => setScopeId(mt.id)}
              className={`text-xs px-2.5 py-1 rounded-full border ${scopeId === mt.id ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted/60'}`}
            >
              {mt.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground flex-1 min-w-[240px]">
          This is the schedule auto-generated when a {category.name} project is set up for <strong>{scopeLabel}</strong>:{' '}
          <strong>{scopedWorkstreams.length} phases · {totalTasks} tasks · ~{totalDays} working days</strong>
          {parallelCount > 0 && <> ({parallelCount} task{parallelCount !== 1 ? 's' : ''} across {activeGroups.length} parallel group{activeGroups.length !== 1 ? 's' : ''})</>}.
          {scopeId !== null && <> Phases marked <Badge variant="outline" className="text-[10px] h-4 px-1 align-middle">shared</Badge> also apply to every other model type.</>}
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={copyTearDownToCosting}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Copy Tear Down → Costing
        </Button>
      </div>
      <div className="space-y-2">
        {[...scopedWorkstreams].sort((a, b) => a.order - b.order).map((ws, i, arr) => (
          <div key={ws.id} className="rounded-md border">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/30">
              <button onClick={() => toggle(ws.id)} className="text-muted-foreground hover:text-foreground shrink-0">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded.has(ws.id) ? '' : '-rotate-90'}`} />
              </button>
              <WorkstreamNameField ws={ws} onRename={renameWorkstream} />
              {ws.modelTypeId === null ? (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">shared</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                  {category.modelTypes.find((m) => m.id === ws.modelTypeId)?.code ?? 'model'}-only
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px] h-5 shrink-0">{ws.tasks.length} tasks</Badge>
              {category.modelTypes.length > 0 && (
                <select
                  value={ws.modelTypeId ?? ''}
                  onChange={(e) => setWorkstreamScope(ws, e.target.value || null)}
                  className="h-6 text-[10px] rounded border bg-transparent px-1 shrink-0"
                  title="Which model types this phase applies to"
                >
                  <option value="">Shared (all model types)</option>
                  {category.modelTypes.map((mt) => (
                    <option key={mt.id} value={mt.id}>{mt.label} only</option>
                  ))}
                </select>
              )}
              {ws.modelTypeId === null && category.modelTypes.length > 0 && (
                <button
                  onClick={() => splitByModelType(ws)}
                  className="p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                  title={`Give each model type its own independent copy of "${ws.name}"`}
                >
                  <GitFork className="h-3.5 w-3.5" />
                </button>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => moveWorkstream(ws, -1)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => moveWorkstream(ws, 1)} disabled={i === arr.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteWorkstream(ws.id, ws.name)} className="p-0.5 text-muted-foreground hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {expanded.has(ws.id) && (
              <TasksEditor workstream={ws} category={category} scopeId={scopeId} existingGroupLabels={allGroupLabels} onReload={onReload} />
            )}
          </div>
        ))}
        {scopedWorkstreams.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No phases yet for {scopeLabel}.</p>
        )}
      </div>
      <div className="flex gap-1.5 pt-2 border-t">
        <Input
          placeholder={scopeId === null ? 'New shared phase name…' : `New phase name (only for ${scopeLabel})…`}
          value={newWsName}
          onChange={(e) => setNewWsName(e.target.value)}
          className="h-8 text-sm flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') addWorkstream() }}
        />
        <Button size="sm" className="h-8 shrink-0" onClick={addWorkstream}><Plus className="h-3.5 w-3.5" /> Phase</Button>
      </div>
    </div>
  )
}

function WorkstreamNameField({ ws, onRename }: { ws: Workstream; onRename: (id: string, name: string) => void }) {
  const [value, setValue] = useState(ws.name)
  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value.trim() && value !== ws.name) onRename(ws.id, value.trim()) }}
      className="h-7 text-sm font-medium flex-1 border-transparent bg-transparent hover:border-input focus:border-input"
    />
  )
}

const GROUP_COLORS = [
  'bg-violet-500', 'bg-blue-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
]
function groupColor(label: string) {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return GROUP_COLORS[hash % GROUP_COLORS.length]
}

interface DraftTask { tempId: string; name: string; durationDays: string }

function TasksEditor({
  workstream, category, scopeId, existingGroupLabels, onReload,
}: { workstream: Workstream; category: Category; scopeId: string | null; existingGroupLabels: string[]; onReload: () => void }) {
  const [name, setName] = useState('')
  const [days, setDays] = useState('1')
  const [drafts, setDrafts] = useState<DraftTask[]>([])
  const [saving, setSaving] = useState(false)
  const datalistId = `group-labels-${workstream.id}`

  // Adding just appends to a local, unsaved list -- no request, no reload, so
  // typing in several tasks in a row doesn't get interrupted each time.
  function stageTask() {
    if (!name.trim()) return
    setDrafts((prev) => [...prev, { tempId: `draft-${Date.now()}-${Math.random()}`, name: name.trim(), durationDays: days }])
    setName(''); setDays('1')
  }

  function updateDraft(tempId: string, patch: Partial<DraftTask>) {
    setDrafts((prev) => prev.map((d) => (d.tempId === tempId ? { ...d, ...patch } : d)))
  }

  function removeDraft(tempId: string) {
    setDrafts((prev) => prev.filter((d) => d.tempId !== tempId))
  }

  // If this phase is shared but a specific model-type tab is active, saving a
  // new task here directly would silently apply it to every model type -- the
  // exact bug reported. Instead, split the phase into independent copies (same
  // as the manual "Split by Model Type" button) first, then return the id of
  // the copy matching the active tab, so the new task lands only there.
  async function ensureScopedWorkstreamId(): Promise<{ workstreamId: string; taskIdMap: Map<string, string> }> {
    if (scopeId === null || workstream.modelTypeId === scopeId) {
      return { workstreamId: workstream.id, taskIdMap: new Map() }
    }
    let targetId: string | null = null
    let targetTaskIdMap = new Map<string, string>()
    for (const mt of category.modelTypes) {
      const newWs = await api(`/api/admin/template-config/categories/${category.id}/workstreams`, 'POST', {
        name: workstream.name, modelTypeId: mt.id,
      })
      const taskIdMap = new Map<string, string>()
      for (const t of [...workstream.tasks].sort((a, b) => a.order - b.order)) {
        const newTask = await api(`/api/admin/template-config/workstreams/${newWs.id}/tasks`, 'POST', {
          name: t.name, durationDays: t.durationDays, parallelGroup: t.parallelGroup,
        })
        taskIdMap.set(t.id, newTask.id)
      }
      if (mt.id === scopeId) { targetId = newWs.id; targetTaskIdMap = taskIdMap }
    }
    await api(`/api/admin/template-config/workstreams/${workstream.id}`, 'DELETE')
    if (!targetId) throw new Error('Could not resolve the current model type after splitting')
    return { workstreamId: targetId, taskIdMap: targetTaskIdMap }
  }

  async function saveDrafts() {
    if (drafts.length === 0) return
    setSaving(true)
    try {
      const willSplit = scopeId !== null && workstream.modelTypeId === null
      const { workstreamId: targetId } = await ensureScopedWorkstreamId()
      for (const d of drafts) {
        await api(`/api/admin/template-config/workstreams/${targetId}/tasks`, 'POST', {
          name: d.name, durationDays: parseFloat(d.durationDays) || 1,
        })
      }
      setDrafts([])
      toast.success(
        willSplit
          ? `Split "${workstream.name}" into independent copies per model type, then saved ${drafts.length} task(s) here`
          : `Saved ${drafts.length} task(s)`
      )
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save tasks')
    } finally {
      setSaving(false)
    }
  }

  // Editing/deleting/reordering a task that still lives in a SHARED phase would
  // otherwise mutate that phase directly -- visible to every model type. So
  // this splits first (same as saveDrafts) and remaps the acted-on task id(s)
  // to their copies in the scope actually being viewed.
  async function updateTask(id: string, patch: { name?: string; durationDays?: number; parallelGroup?: string | null }) {
    try {
      const { taskIdMap } = await ensureScopedWorkstreamId()
      const targetTaskId = taskIdMap.get(id) ?? id
      await api(`/api/admin/template-config/tasks/${targetTaskId}`, 'PATCH', patch)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update task')
    }
  }

  async function removeTask(id: string) {
    try {
      const { taskIdMap } = await ensureScopedWorkstreamId()
      const targetTaskId = taskIdMap.get(id) ?? id
      await api(`/api/admin/template-config/tasks/${targetTaskId}`, 'DELETE', undefined)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove task')
    }
  }

  async function moveTask(task: TaskT, dir: -1 | 1) {
    const sorted = [...workstream.tasks].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((t) => t.id === task.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    try {
      const { taskIdMap } = await ensureScopedWorkstreamId()
      const taskId = taskIdMap.get(task.id) ?? task.id
      const swapWithId = taskIdMap.get(swapWith.id) ?? swapWith.id
      await Promise.all([
        api(`/api/admin/template-config/tasks/${taskId}`, 'PATCH', { order: swapWith.order }),
        api(`/api/admin/template-config/tasks/${swapWithId}`, 'PATCH', { order: task.order }),
      ])
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder')
    }
  }

  return (
    <div className="px-2.5 py-2 space-y-1 border-t">
      <datalist id={datalistId}>
        {existingGroupLabels.map((g) => <option key={g} value={g} />)}
      </datalist>
      {[...workstream.tasks].sort((a, b) => a.order - b.order).map((t, i, arr) => (
        <div key={t.id} className="flex items-center gap-1.5">
          <div className="relative shrink-0">
            <Input
              list={datalistId}
              defaultValue={t.parallelGroup ?? ''}
              placeholder="—"
              title="Group label — any tasks sharing the same label run in parallel with each other"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v !== (t.parallelGroup ?? '')) updateTask(t.id, { parallelGroup: v || null })
              }}
              className={`h-7 text-xs w-14 text-center ${t.parallelGroup ? 'border-violet-400' : ''}`}
            />
            {t.parallelGroup && (
              <span className={`absolute -top-1 -right-1 h-2 w-2 rounded-full ${groupColor(t.parallelGroup)}`} />
            )}
          </div>
          <Input
            defaultValue={t.name}
            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== t.name) updateTask(t.id, { name: e.target.value.trim() }) }}
            className="h-7 text-xs flex-1"
          />
          <Input
            type="number" step="0.25" min="0.25"
            defaultValue={t.durationDays}
            onBlur={(e) => { const v = parseFloat(e.target.value); if (v > 0 && v !== t.durationDays) updateTask(t.id, { durationDays: v }) }}
            className="h-7 text-xs w-16 text-center"
          />
          <span className="text-[10px] text-muted-foreground shrink-0">days</span>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => moveTask(t, -1)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronUp className="h-3 w-3" />
            </button>
            <button onClick={() => moveTask(t, 1)} disabled={i === arr.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
              <ChevronDown className="h-3 w-3" />
            </button>
            <button onClick={() => removeTask(t.id)} className="p-0.5 text-muted-foreground hover:text-red-500">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      ))}

      {drafts.length > 0 && (
        <div className="space-y-1 rounded-md border border-dashed border-blue-300 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-1.5">
          {drafts.map((d) => (
            <div key={d.tempId} className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[9px] h-5 shrink-0 border-blue-300 text-blue-600 dark:text-blue-400">unsaved</Badge>
              <Input
                value={d.name}
                onChange={(e) => updateDraft(d.tempId, { name: e.target.value })}
                className="h-7 text-xs flex-1"
              />
              <Input
                type="number" step="0.25" min="0.25"
                value={d.durationDays}
                onChange={(e) => updateDraft(d.tempId, { durationDays: e.target.value })}
                className="h-7 text-xs w-16 text-center"
              />
              <span className="text-[10px] text-muted-foreground shrink-0">days</span>
              <button onClick={() => removeDraft(d.tempId)} className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground pl-1 flex items-center gap-1">
        <GitBranch className="h-3 w-3 text-violet-500 shrink-0" />
        Give two or more tasks the same group label (e.g. "A") to run them in parallel — any number of tasks, anywhere in the category, not just next to each other.
      </p>
      <div className="flex items-center gap-1.5 pt-1">
        <Input placeholder="New task…" value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs flex-1"
          onKeyDown={(e) => { if (e.key === 'Enter') stageTask() }} />
        <Input type="number" step="0.25" min="0.25" value={days} onChange={(e) => setDays(e.target.value)} className="h-7 text-xs w-16 text-center" />
        <span className="text-[10px] text-muted-foreground shrink-0">days</span>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={stageTask} title="Add to list">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {drafts.length > 0 && (
        <div className="flex justify-end pt-1">
          <Button size="sm" className="h-7 text-xs" onClick={saveDrafts} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? 'Saving…' : `Save ${drafts.length} new task${drafts.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Costing types (global) ─────────────────────────────────────────────────

function CostingTypesCard({ costingTypes, onReload }: { costingTypes: CostingType[]; onReload: () => void }) {
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')

  async function add() {
    if (!code.trim()) return
    try {
      await api('/api/admin/template-config/costing-types', 'POST', { code: code.trim(), label: label.trim() || code.trim() })
      setCode(''); setLabel('')
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add costing type')
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/admin/template-config/costing-types/${id}`, 'DELETE', undefined)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-blue-500" /> Costing Types
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Shared across all categories — used as the "Costing Responsibility" options for products with no subsystems defined.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {costingTypes.map((ct) => (
            <div key={ct.id} className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono w-24 justify-center shrink-0">{ct.code}</Badge>
              <span className="text-sm flex-1">{ct.label}</span>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0" onClick={() => remove(ct.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 pt-2 border-t">
          <Input placeholder="Code (e.g. MECHANICAL)" value={code} onChange={(e) => setCode(e.target.value)} className="h-8 text-sm w-40" />
          <Input placeholder="Label (e.g. Mechanical)" value={label} onChange={(e) => setLabel(e.target.value)} className="h-8 text-sm flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <Button size="sm" className="h-8 shrink-0" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Project types (global) ─────────────────────────────────────────────────

function ProjectTypesCard({ projectTypes, onReload }: { projectTypes: ProjectType[]; onReload: () => void }) {
  const [name, setName] = useState('')

  async function add() {
    if (!name.trim()) return
    try {
      await api('/api/admin/template-config/project-types', 'POST', { name: name.trim() })
      setName('')
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add project type')
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/admin/template-config/project-types/${id}`, 'DELETE', undefined)
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove')
    }
  }

  async function move(pt: ProjectType, dir: -1 | 1) {
    const sorted = [...projectTypes].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((p) => p.id === pt.id)
    const swapWith = sorted[idx + dir]
    if (!swapWith) return
    try {
      await Promise.all([
        api(`/api/admin/template-config/project-types/${pt.id}`, 'PATCH', { order: swapWith.order }),
        api(`/api/admin/template-config/project-types/${swapWith.id}`, 'PATCH', { order: pt.order }),
      ])
      onReload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reorder')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tags className="h-4 w-4 text-blue-500" /> Project Types
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The "Project Type" dropdown shown when creating a new project. Note: the type named exactly{' '}
          <strong>Teardown</strong> is special-cased to auto-generate the category schedule and set High priority — renaming
          it will remove that behavior.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {[...projectTypes].sort((a, b) => a.order - b.order).map((pt, i, arr) => (
            <div key={pt.id} className="flex items-center gap-2">
              <span className="text-sm flex-1">{pt.name}</span>
              <button onClick={() => move(pt, -1)} disabled={i === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => move(pt, 1)} disabled={i === arr.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0" onClick={() => remove(pt.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 pt-2 border-t">
          <Input placeholder="New project type…" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <Button size="sm" className="h-8 shrink-0" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Dashboard banner image ──────────────────────────────────────────────────

function DashboardBannerCard() {
  const [title, setTitle] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadBanner = useCallback(async () => {
    try {
      const data = await api('/api/config/dashboard-banner', 'GET')
      if (data) {
        setTitle(data.title)
        setImageUrl(data.imageUrl)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => { loadBanner() }, [loadBanner])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  async function save() {
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      if (file) formData.append('image', file)
      const res = await fetch('/api/admin/dashboard-banner', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setImageUrl(data.imageUrl)
      setTitle(data.title)
      setFile(null)
      setPreview(null)
      toast.success('Dashboard banner updated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save banner')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-blue-500" /> Dashboard Image
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The image and title shown at the bottom of everyone's dashboard.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {(preview || imageUrl) && (
          <div className="rounded-md border overflow-hidden bg-muted/20">
            <Image
              src={preview || imageUrl!}
              alt={title || 'Dashboard banner preview'}
              width={800}
              height={300}
              unoptimized
              className="w-full h-auto max-h-56 object-contain"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" placeholder="e.g. 2027 CAA Project Plan" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Replace image (PNG, JPEG, WEBP, or GIF — under 10MB)</Label>
          <Input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFileChange} className="h-9 text-sm" />
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> {saving ? 'Saving…' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}
