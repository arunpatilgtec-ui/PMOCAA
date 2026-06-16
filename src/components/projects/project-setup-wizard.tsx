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
  Loader2, X, Plus, ChevronRight, ChevronLeft, Wand2, Check, Calendar, Layers,
} from 'lucide-react'
import {
  ALL_CATEGORIES, CATEGORY_TEMPLATES, CATEGORY_TYPES, CATEGORY_TYPE_LABELS, templateTotalDays,
} from '@/lib/project-templates'
import { addWorkingDays } from '@/lib/date-utils'
import { format } from 'date-fns'

interface User {
  id: string
  name: string
  role: string
  isActive: boolean
}

export interface ProjectSetupWizardProps {
  projectId: string
  projectType: string
  projectClassification?: string
  startDate: string
  onComplete: () => void
  onDismiss: () => void
}

export function ProjectSetupWizard({
  projectId,
  projectType,
  projectClassification,
  startDate,
  onComplete,
  onDismiss,
}: ProjectSetupWizardProps) {
  const isTeardown = projectType === 'TEARDOWN'
  const totalSteps = isTeardown ? 4 : 3

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [users, setUsers] = useState<User[]>([])

  // Teardown-specific
  const [category, setCategory] = useState('')
  const [productType, setProductType] = useState('')

  // Non-teardown
  const [endDate, setEndDate] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  // Common
  const [leadId, setLeadId] = useState('')
  const [links, setLinks] = useState<string[]>([''])

  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((d) => setUsers(Array.isArray(d) ? d.filter((u: User) => u.isActive !== false) : []))
      .catch(() => {})
  }, [])

  // Client-side end-date preview from template
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
  const totalDays = hasTemplate ? templateTotalDays(category) : 0

  function canProceed() {
    if (isTeardown) {
      if (step === 1) return !!category
      return true
    } else {
      if (step === 1) return !!endDate
      return true
    }
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        leadId: leadId || null,
        projectLinks: links.filter((l) => l.trim()),
      }

      if (isTeardown) {
        body.category = category || null
        body.productType = productType || null
      } else {
        body.endDate = endDate
        body.priority = priority
      }

      const res = await fetch(`/api/projects/${projectId}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Setup failed')
      toast.success(hasTemplate ? 'Schedule generated!' : 'Project setup saved!')
      onComplete()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  function updateLink(i: number, val: string) {
    const next = [...links]
    next[i] = val
    setLinks(next)
  }

  const isLastStep = step === totalSteps

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <div className="flex items-center gap-2">
              <Wand2 className="h-4.5 w-4.5 text-blue-600" />
              <h2 className="text-base font-semibold">Project Setup</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Step {step} of {totalSteps}
              {isTeardown ? ' — Teardown configuration' : ` — ${projectClassification || 'Project'} configuration`}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 min-h-[220px]">

          {/* ── Teardown steps ── */}

          {isTeardown && step === 1 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Product Category</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select the product category to auto-generate the teardown schedule.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select value={category} onValueChange={(v) => { const s = v as string | null; if (s) { setCategory(s); setProductType('') } }}>
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
                  <Select value={productType} onValueChange={(v) => { const s = v as string | null; if (s) setProductType(s) }}>
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
                    {workstreamCount} phases · {taskCount} tasks · {totalDays} working days
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Est. completion: <strong>{format(previewEndDate, 'MMM d, yyyy')}</strong>
                  </p>
                </div>
              )}
              {category === 'Other' && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  No template available for "Other". You can add workstreams and tasks manually after setup.
                </p>
              )}
            </>
          )}

          {isTeardown && step === 2 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Assign Project Lead</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The lead manages task updates and submits plans for approval.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Project Lead</Label>
                <Select value={leadId || 'none'} onValueChange={(v) => { const s = v as string | null; setLeadId(!s || s === 'none' ? '' : s) }}>
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

          {isTeardown && step === 3 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Project Links</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Attach Google Drive folders, datasheets, or reference documents.
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
                <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => setLinks([...links, ''])}>
                  <Plus className="h-3 w-3 mr-1" /> Add Another Link
                </Button>
              </div>
            </>
          )}

          {isTeardown && step === 4 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Review & Generate</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirm the details below, then generate the project schedule.
                </p>
              </div>
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
                  <span className="font-medium">{users.find((u) => u.id === leadId)?.name || '—'}</span>
                </div>
                {previewEndDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. End Date</span>
                    <span className="font-medium">{format(previewEndDate, 'MMM d, yyyy')}</span>
                  </div>
                )}
                {hasTemplate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Schedule</span>
                    <span className="font-medium">{workstreamCount} phases, {taskCount} tasks</span>
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
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Phases to be created:</p>
                  <div className="space-y-0.5">
                    {CATEGORY_TEMPLATES[category].map((ws) => (
                      <div key={ws.name} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/40">
                        <span className="flex items-center gap-1.5">
                          <Layers className="h-3 w-3 text-muted-foreground" /> {ws.name}
                        </span>
                        <span className="text-muted-foreground">{ws.tasks.length} tasks</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Non-teardown steps ── */}

          {!isTeardown && step === 1 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Project Details</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Set the target completion date and priority for this {projectClassification || 'project'}.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>End Date *</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => { const s = v as string | null; if (s) setPriority(s) }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {!isTeardown && step === 2 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Assign Project Lead</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The lead manages task updates and submits plans for approval.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Project Lead</Label>
                <Select value={leadId || 'none'} onValueChange={(v) => { const s = v as string | null; setLeadId(!s || s === 'none' ? '' : s) }}>
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

          {!isTeardown && step === 3 && (
            <>
              <div>
                <h3 className="text-sm font-semibold">Project Links</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optionally attach reference links, then save the project setup.
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
                <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => setLinks([...links, ''])}>
                  <Plus className="h-3 w-3 mr-1" /> Add Another Link
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t bg-muted/20">
          <Button
            variant="ghost" size="sm"
            onClick={step === 1 ? onDismiss : () => setStep((s) => s - 1)}
          >
            {step === 1
              ? 'Skip for now'
              : <><ChevronLeft className="h-4 w-4 mr-1" />Back</>
            }
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
              disabled={submitting || !canProceed()}
              onClick={handleSubmit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                : <><Check className="h-4 w-4 mr-1.5" />{isTeardown && hasTemplate ? 'Generate Schedule' : 'Save Setup'}</>
              }
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
