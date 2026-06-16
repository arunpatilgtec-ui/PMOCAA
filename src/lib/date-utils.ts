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
