'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Loader2, X, Plus, ChevronRight, ChevronLeft, Wand2, Check, Calendar, Layers, AlertTriangle,
} from 'lucide-react'
import {
  ALL_CATEGORIES, CATEGORY_TEMPLATES, CATEGORY_TYPES, CATEGORY_TYPE_LABELS,
} from '@/lib/project-templates'
import { addWorkingDays } from '@/lib/date-utils'
import { format } from 'date-fns'

interface User {
  id: string
  name: string
  role: string
  isActive: boolean
}

interface ProductDraft {
  brand: string
  modelNo: string
  leadId: string
  resourceIds: string[]
}

export interface ProjectSetupWizardProps {
  projectId: string
  projectType: string
  projectClassification?: string
  startDate: string
  numberOfProducts?: number
  hasWorkstreams?: boolean
  onComplete: () => void
  onDismiss: () => void
}

export function ProjectSetupWizard({
  projectId,
  projectType,
  projectClassification,
  startDate,
  numberOfProducts,
  hasWorkstreams = false,
  onComplete,
  onDismiss,
}: ProjectSetupWizardProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  // Step: Category
  const [category, setCategory] = useState('')
  const [productType, setProductType] = useState('')
  // Step: Lead
  const [leadId, setLeadId] = useState('')
  // Step: Products (new projects only)
  const [productDrafts, setProductDrafts] = useState<ProductDraft[]>(() => {
    const count = numberOfProducts && numberOfProducts > 0 ? numberOfProducts : 1
    return Array.from({ length: count }, () => ({ brand: '', modelNo: '', leadId: '', resourceIds: [] }))
  })
  // Step: Links
  const [links, setLinks] = useState<string[]>([''])

  // Reconfigure skips the products step (products already exist)
  const STEP_NAMES: string[] = hasWorkstreams
    ? ['Category', 'Lead', 'Links', 'Review']
    : ['Category', 'Lead', 'Products', 'Links', 'Review']
  const TOTAL_STEPS = STEP_NAMES.length
  const currentStepName = STEP_NAMES[step - 1]

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d.filter((u: User) => u.isActive !== false) : []))
      .catch(() => {})
  }, [])

  const hasTemplate = !!(category && CATEGORY_TEMPLATES[category])
  let previewEndDate: Date | null = null
  if (hasTemplate && startDate) {
    let cursor = new Date(startDate)
    for (const ws of CATEGORY_TEMPLATES[category]) {
      for (const task of ws.tasks) {
        cursor = addWorkingDays(cursor, task.durationDays)
      }
    }
    previewEndDate = cursor
  }

  const productTypeOptions = category ? (CATEGORY_TYPES[category] ?? []) : []
  const productTypeLabels = category ? (CATEGORY_TYPE_LABELS[category] ?? {}) : {}
  const taskCount = hasTemplate
    ? CATEGORY_TEMPLATES[category].reduce((s, ws) => s + ws.tasks.length, 0)
    : 0
  const workstreamCount = hasTemplate ? CATEGORY_TEMPLATES[category].length : 0

  function canProceed() {
    if (currentStepName === 'Category') return !!category
    return true
  }

  function updateProduct(i: number, field: keyof ProductDraft, value: string) {
    setProductDrafts((d) => d.map((p, j) => (j === i ? { ...p, [field]: value } : p)))
  }

  function addProductRow() {
    setProductDrafts((d) => [...d, { brand: '', modelNo: '', leadId: '', resourceIds: [] }])
  }

  function addResourceToProduct(i: number, uid: string) {
    setProductDrafts((d) =>
      d.map((p, j) => j === i ? { ...p, resourceIds: [...p.resourceIds, uid] } : p)
    )
  }

  function removeResourceFromProduct(i: number, uid: string) {
    setProductDrafts((d) =>
      d.map((p, j) => j === i ? { ...p, resourceIds: p.resourceIds.filter((r) => r !== uid) } : p)
    )
  }

  function removeProductRow(i: number) {
    setProductDrafts((d) => d.filter((_, j) => j !== i))
  }

  function updateLink(i: number, val: string) {
    const next = [...links]
    next[i] = val
    setLinks(next)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: category || null,
          productType: productType || null,
          leadId: leadId || null,
          projectLinks: links.filter((l) => l.trim()),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Setup failed')

      // Create products for new projects only
      if (!hasWorkstreams) {
        const validProducts = productDrafts.filter((p) => p.brand.trim())
        if (validProducts.length > 0) {
          await Promise.all(
            validProducts.map((p) =>
              fetch(`/api/projects/${projectId}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  brand: p.brand.trim(),
                  modelNo: p.modelNo.trim(),
                  leadId: p.leadId || null,
                  resourceCount: p.resourceIds.length > 0 ? p.resourceIds.length : null,
                  resources: p.resourceIds.map((uid) => ({ userId: uid, subsystems: [], costingTypes: [] })),
                }),
              })
            )
          )
        }
      }

      toast.success(hasTemplate ? 'Schedule generated! Check the Timeline tab.' : 'Project setup saved!')
      onComplete()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  const isLastStep = step === TOTAL_STEPS
  const projectLabel = projectType === 'TEARDOWN' ? 'Teardown' : (projectClassification || 'Project')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Wand2 className="h-4.5 w-4.5 text-blue-600" />
              <h2 className="text-base font-semibold">Project Setup</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {step} of {TOTAL_STEPS} — {projectLabel} configuration
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted shrink-0">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* ── Category + Product Type ── */}
          {currentStepName === 'Category' && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Product Category</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select the product category to auto-generate the project schedule.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={category}
                  onValueChange={(v) => { const s = v as string | null; if (s) { setCategory(s); setProductType('') } }}
                >
                  <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                  <SelectContent>
                    {ALL_CATEGORIES.filter((c) => c !== 'Other').map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="Other">Other (no auto-schedule)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {productTypeOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Product Type</Label>
                  <Select
                    value={productType}
                    onValueChange={(v) => { const s = v as string | null; if (s) setProductType(s) }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                    <SelectContent>
                      {productTypeOptions.map((t) => (
                        <SelectItem key={t} value={t}>{productTypeLabels[t] || t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {previewEndDate && (
                <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2.5 space-y-0.5">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Auto-calculated timeline
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    {workstreamCount} phases · {taskCount} tasks
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Est. completion: <strong>{format(previewEndDate, 'MMM d, yyyy')}</strong>
                  </p>
                </div>
              )}
              {category === 'Other' && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    <strong>No template for &quot;Other&quot;.</strong> You can still save the project setup and add workstreams and tasks manually from the Timeline tab.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Project Lead ── */}
          {currentStepName === 'Lead' && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Assign Project Lead</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The lead manages task updates and submits plans for approval.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Project Lead</Label>
                <Select
                  value={leadId || 'none'}
                  onValueChange={(v) => { const s = v as string | null; setLeadId(!s || s === 'none' ? '' : s) }}
                >
                  <SelectTrigger><SelectValue placeholder="No lead" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lead assigned</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} <span className="text-muted-foreground text-xs">({u.role.replace(/_/g, ' ')})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* ── Products (new project only) ── */}
          {currentStepName === 'Products' && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Products</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter the brand and model for each product. Leave brand blank to skip a row.
                </p>
              </div>
              <div className="space-y-2">
                {productDrafts.map((p, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Product {i + 1}</span>
                      {productDrafts.length > 1 && (
                        <Button
                          variant="ghost" size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={() => removeProductRow(i)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Brand *"
                        value={p.brand}
                        onChange={(e) => updateProduct(i, 'brand', e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Input
                        placeholder="Model No."
                        value={p.modelNo}
                        onChange={(e) => updateProduct(i, 'modelNo', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Select
                      value={p.leadId || 'none'}
                      onValueChange={(v) => {
                        const s = v as string | null
                        updateProduct(i, 'leadId', !s || s === 'none' ? '' : s)
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Assign lead (optional)…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No lead</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Multi-resource assignment */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Resources (optional)</p>
                      {p.resourceIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {p.resourceIds.map((uid) => {
                            const u = users.find((u) => u.id === uid)
                            if (!u) return null
                            return (
                              <span key={uid} className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-full text-blue-700 dark:text-blue-300">
                                {u.name.split(' ')[0]}
                                <button
                                  type="button"
                                  onClick={() => removeResourceFromProduct(i, uid)}
                                  className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                      )}
                      <Select
                        value="__pick__"
                        onValueChange={(v) => {
                          const s = v as string | null
                          if (s && s !== '__pick__' && !p.resourceIds.includes(s)) {
                            addResourceToProduct(i, s)
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Add a resource…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__pick__">Add a resource…</SelectItem>
                          {users
                            .filter((u) => !p.resourceIds.includes(u.id))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))
                          }
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline" size="sm"
                className="h-7 text-xs w-full"
                onClick={addProductRow}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Product
              </Button>
            </>
          )}

          {/* ── Links ── */}
          {currentStepName === 'Links' && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Project Links</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Attach Google Drive folders, datasheets, or reference documents (optional).
                </p>
              </div>
              <div className="space-y-2">
                {links.map((link, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      placeholder="https://drive.google.com/…"
                      value={link}
                      onChange={(e) => updateLink(i, e.target.value)}
                      className="h-8 text-sm"
                    />
                    {links.length > 1 && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => setLinks(links.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline" size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => setLinks([...links, ''])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Another Link
                </Button>
              </div>
            </>
          )}

          {/* ── Review + Generate ── */}
          {currentStepName === 'Review' && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Review &amp; Generate</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirm the details below, then generate the project schedule.
                </p>
              </div>

              {hasWorkstreams && (
                <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md px-3 py-2 flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-800 dark:text-orange-300">
                    <strong>Existing schedule will be replaced.</strong>{' '}
                    Current workstreams and tasks will be deleted and regenerated from the template.
                  </p>
                </div>
              )}

              <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium">{category || '—'}</span>
                </div>
                {productType && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product Type</span>
                    <span className="font-medium">{productType}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Project Lead</span>
                  <span className="font-medium">{users.find((u) => u.id === leadId)?.name || 'None'}</span>
                </div>
                {!hasWorkstreams && productDrafts.filter((p) => p.brand.trim()).length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Products</span>
                    <span className="font-medium">{productDrafts.filter((p) => p.brand.trim()).length} product(s)</span>
                  </div>
                )}
                {previewEndDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. End Date</span>
                    <span className="font-medium">{format(previewEndDate, 'MMM d, yyyy')}</span>
                  </div>
                )}
                {hasTemplate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule</span>
                    <span className="font-medium">{workstreamCount} phases · {taskCount} tasks</span>
                  </div>
                )}
                {links.filter((l) => l.trim()).length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Links</span>
                    <span className="font-medium">{links.filter((l) => l.trim()).length} link(s)</span>
                  </div>
                )}
              </div>

              {hasTemplate && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Phases &amp; Tasks
                  </p>
                  <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                    {CATEGORY_TEMPLATES[category].map((ws) => (
                      <div key={ws.name} className="rounded-md border border-border/60 overflow-hidden">
                        <div className="flex items-center justify-between text-xs py-1.5 px-2.5 bg-muted/30">
                          <span className="flex items-center gap-1.5 font-semibold">
                            <Layers className="h-3 w-3 text-blue-500" /> {ws.name}
                          </span>
                          <span className="text-muted-foreground">{ws.tasks.length} tasks</span>
                        </div>
                        <div className="px-2.5 py-1 space-y-0.5">
                          {ws.tasks.map((t) => (
                            <p key={t.name} className="text-xs text-muted-foreground py-0.5 flex items-center justify-between">
                              <span>· {t.name}</span>
                              <span className="text-blue-500/70 text-[10px] shrink-0 ml-2">{t.durationDays}d</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hasTemplate && category === 'Other' && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  No auto-schedule for &quot;Other&quot; category. Workstreams and tasks can be added manually from the Timeline tab.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t bg-muted/20 shrink-0">
          <Button
            variant="ghost" size="sm"
            onClick={step === 1 ? onDismiss : () => setStep((s) => s - 1)}
          >
            {step === 1 ? 'Skip for now' : <><ChevronLeft className="h-4 w-4 mr-1" />Back</>}
          </Button>

          {!isLastStep ? (
            <Button
              size="sm"
              disabled={!canProceed()}
              onClick={() => setStep((s) => s + 1)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={submitting}
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                : <><Check className="h-4 w-4 mr-1.5" />
                    {hasWorkstreams ? 'Replace Schedule' : (hasTemplate ? 'Generate Schedule' : 'Save Setup')}
                  </>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
