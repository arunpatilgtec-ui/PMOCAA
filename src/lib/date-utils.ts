// Pure date utilities — no server-only imports, safe for client components

export function addWorkingDays(date: Date, days: number): Date {
  if (days === 0) return new Date(date)
  const result = new Date(date)
  let added = 0
  const direction = days > 0 ? 1 : -1
  const target = Math.abs(days)
  while (added < target) {
    result.setDate(result.getDate() + direction)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

// Count Mon–Fri days from `from` to `to` inclusive (minimum 1)
export function countWorkingDays(from: Date, to: Date): number {
  let count = 0
  const curr = new Date(from)
  curr.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (curr <= end) {
    const dow = curr.getDay()
    if (dow !== 0 && dow !== 6) count++
    curr.setDate(curr.getDate() + 1)
  }
  return Math.max(1, count)
}

// Working days strictly between from (exclusive) and to (inclusive). Returns 0 if to <= from.
export function workingDaysDiff(from: Date, to: Date): number {
  if (to <= from) return 0
  let count = 0
  const curr = new Date(from)
  curr.setHours(0, 0, 0, 0)
  curr.setDate(curr.getDate() + 1)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)
  while (curr <= end) {
    const dow = curr.getDay()
    if (dow !== 0 && dow !== 6) count++
    curr.setDate(curr.getDate() + 1)
  }
  return count
}
