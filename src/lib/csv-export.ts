'use client'

// Shared client-side "export the current table to CSV" helper. Escapes per
// RFC 4180 (quotes doubled, field wrapped in quotes if it contains a comma,
// quote, or newline) and triggers a browser download — no server round trip,
// so it always reflects exactly what's currently on screen (filters included).

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, columns: Array<{ key: string; label: string }>) {
  const csv = toCsv(rows, columns)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
