import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

// Native <input type="date"> silently rejects most pasted text -- Chrome/Firefox
// only accept keystrokes into the currently-focused y/m/d segment, so pasting a
// full date copied from Excel, another field, or a chat message does nothing.
// This parses whatever was pasted and, if it looks like a date, writes it in
// directly so copy/paste of dates works the way people expect everywhere in the app.
function parseAnyDate(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) // YYYY-MM-DD or YYYY/MM/DD
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`

  m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/) // MM/DD/YYYY or MM-DD-YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`

  const parsed = new Date(text) // fallback: textual dates like "Aug 28, 2026"
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const mo = String(parsed.getMonth() + 1).padStart(2, "0")
    const d = String(parsed.getDate()).padStart(2, "0")
    return `${y}-${mo}-${d}`
  }

  return null
}

function Input({ className, type, onPaste, ...props }: React.ComponentProps<"input">) {
  const handleDatePaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      const iso = parseAnyDate(e.clipboardData.getData("text"))
      if (iso) {
        e.preventDefault()
        const target = e.currentTarget
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set
        setter?.call(target, iso)
        target.dispatchEvent(new Event("input", { bubbles: true }))
      }
      onPaste?.(e)
    },
    [onPaste]
  )

  return (
    <InputPrimitive
      type={type}
      onPaste={type === "date" ? handleDatePaste : onPaste}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
