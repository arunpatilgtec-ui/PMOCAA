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

// Sequences tasks into calendar date ranges starting from `startDate`.
// Consecutive 0.5-day tasks are packed into the same working day (AM then PM).
// A lone 0.5-day task followed by a full-day task shifts the full-day to the next morning.
export function sequenceTasks(
  tasks: ReadonlyArray<{ durationDays: number }>,
  startDate: Date
): Array<{ startDate: Date; endDate: Date }> {
  const result: Array<{ startDate: Date; endDate: Date }> = []
  let cursor = new Date(startDate)
  let halfDayUsed = false

  for (const task of tasks) {
    if (task.durationDays <= 0.5) {
      result.push({ startDate: new Date(cursor), endDate: new Date(cursor) })
      if (!halfDayUsed) {
        halfDayUsed = true // hold cursor — second half still free
      } else {
        halfDayUsed = false
        cursor = addWorkingDays(cursor, 1) // day full, advance
      }
    } else {
      if (halfDayUsed) {
        cursor = addWorkingDays(cursor, 1) // spare half day — start full task on next day
        halfDayUsed = false
      }
      const duration = Math.ceil(task.durationDays)
      const taskStart = new Date(cursor)
      const taskEnd = addWorkingDays(new Date(cursor), duration - 1)
      result.push({ startDate: taskStart, endDate: taskEnd })
      cursor = addWorkingDays(taskEnd, 1)
    }
  }

  return result
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
