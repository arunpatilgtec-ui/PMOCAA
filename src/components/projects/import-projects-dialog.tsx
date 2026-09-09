'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Upload, Download, CheckCircle2, XCircle } from 'lucide-react'
import { useTemplateConfig } from '@/lib/use-template-config'

const COLUMNS = ['name', 'category', 'productType', 'projectType', 'startDate', 'priority', 'quarter', 'region', 'numberOfProducts', 'status'] as const
const COLUMN_HEADERS: Record<(typeof COLUMNS)[number], string> = {
  name: 'Project Name', category: 'Category', productType: 'Product Type', projectType: 'Project Type',
  startDate: 'Start Date', priority: 'Priority', quarter: 'Quarter', region: 'Region', numberOfProducts: 'Number of Products', status: 'Status',
}
const TEMPLATE_ROW = [
  '2026#Example_Project_NAR', 'KASA', 'Blender', 'Teardown', '2026-03-02', 'HIGH', 'Q1', 'NAR', '3', 'Planning',
]

// Minimal RFC 4180-ish CSV parser: handles quoted fields, embedded commas,
// escaped double-quotes (""), and both \n and \r\n line endings.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row) }
  return rows
}

interface RowResult { row: number; name: string; status: 'created' | 'error'; error?: string; projectId?: string }

export function ImportProjectsDialog({
  open, onOpenChange, onImported,
}: { open: boolean; onOpenChange: (v: boolean) => void; onImported: () => void }) {
  const { projectTypes } = useTemplateConfig()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([])
  const [parseError, setParseError] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<RowResult[] | null>(null)

  function reset() {
    setFileName(''); setParsedRows([]); setParseError(''); setResults(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose(v: boolean) {
    if (!v) reset()
    onOpenChange(v)
  }

  function downloadTemplate() {
    const csv = [COLUMNS.map((c) => COLUMN_HEADERS[c]).join(','), TEMPLATE_ROW.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'project-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(file: File) {
    setFileName(file.name)
    setResults(null)
    setParseError('')
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result || '')
        const table = parseCsv(text)
        if (table.length < 2) throw new Error('CSV needs a header row plus at least one project row')
        const headerRow = table[0].map((h) => h.trim().toLowerCase())
        const headerToKey = new Map<string, (typeof COLUMNS)[number]>()
        for (const key of COLUMNS) {
          headerToKey.set(COLUMN_HEADERS[key].toLowerCase(), key)
          headerToKey.set(key.toLowerCase(), key)
        }
        const keyByCol = headerRow.map((h) => headerToKey.get(h))
        if (!keyByCol.includes('name')) throw new Error(`Missing required "${COLUMN_HEADERS.name}" column`)

        const rows = table.slice(1).map((cells) => {
          const obj: Record<string, string> = {}
          keyByCol.forEach((key, idx) => { if (key) obj[key] = (cells[idx] ?? '').trim() })
          return obj
        })
        setParsedRows(rows)
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Failed to parse CSV')
        setParsedRows([])
      }
    }
    reader.readAsText(file)
  }

  async function submit() {
    if (parsedRows.length === 0) return
    setLoading(true)
    try {
      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      setResults(data.results)
      if (data.created > 0) { toast.success(`Created ${data.created} project(s)`); onImported() }
      if (data.failed > 0) toast.error(`${data.failed} row(s) failed — see details below`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Projects from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Upload a CSV to create multiple projects at once. Each row generates its schedule the same way
              a manually created project does.
            </p>
            <p>
              Required columns: <strong>Project Name</strong>, <strong>Category</strong>, <strong>Project Type</strong>, <strong>Start Date</strong> (YYYY-MM-DD).
              {' '}<strong>Product Type</strong> is required for categories that have model types (e.g. KASA, Dishwasher) — either the code (e.g. "IN") or full label (e.g. "Insinkerator") works.
              Optional: Priority (default MEDIUM), Quarter (Q1–Q4), Region (ASIA/LAR/NAR/EMEA/Other), Number of Products, Status (default Planning).
            </p>
            {projectTypes.length > 0 && (
              <p>
                <strong>Project Type</strong> must be one of:{' '}
                {projectTypes.map((t) => t.name).join(', ')}
              </p>
            )}
            <p>
              <strong>Status</strong> must be one of: Planning, Active, On Hold, Completed, Cancelled.
              Setting a project to Completed here does not mark its generated tasks as completed —
              only the project&apos;s own status.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download CSV template
            </Button>
          </div>

          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Choose CSV file
            </Button>
            {fileName && <span className="ml-2 text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {parseError && <p className="text-sm text-red-600">{parseError}</p>}

          {parsedRows.length > 0 && !results && (
            <div className="border rounded-md overflow-x-auto max-h-64">
              <table className="text-xs w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">#</th>
                    <th className="text-left px-2 py-1.5">Name</th>
                    <th className="text-left px-2 py-1.5">Category</th>
                    <th className="text-left px-2 py-1.5">Product Type</th>
                    <th className="text-left px-2 py-1.5">Project Type</th>
                    <th className="text-left px-2 py-1.5">Start Date</th>
                    <th className="text-left px-2 py-1.5">Region</th>
                    <th className="text-left px-2 py-1.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground">{i + 2}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.category}</td>
                      <td className="px-2 py-1">{r.productType}</td>
                      <td className="px-2 py-1">{r.projectType}</td>
                      <td className="px-2 py-1">{r.startDate}</td>
                      <td className="px-2 py-1">{r.region}</td>
                      <td className="px-2 py-1">{r.status || 'Planning'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {results && (
            <div className="border rounded-md overflow-x-auto max-h-64">
              <table className="text-xs w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5">Row</th>
                    <th className="text-left px-2 py-1.5">Name</th>
                    <th className="text-left px-2 py-1.5">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.row} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground">{r.row}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">
                        {r.status === 'created' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Created
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <XCircle className="h-3.5 w-3.5" /> {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
            {results ? 'Close' : 'Cancel'}
          </Button>
          {!results && (
            <Button type="button" onClick={submit} disabled={parsedRows.length === 0 || loading}>
              {loading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Import {parsedRows.length > 0 ? `${parsedRows.length} project(s)` : ''}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
