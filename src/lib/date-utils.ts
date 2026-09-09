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
//
// Tasks sharing the same non-null/non-empty `parallelGroup` value all start
// on the same date, however far apart they are in the list — the group is
// scheduled as a whole the first time ANY of its members is reached (using
// the earliest member's position), and the schedule resumes after the
// LONGEST task in that group. Output stays in the same order as the input
// list (result[i] always describes tasks[i]) regardless of grouping. Tasks
// with no group (or a group of size 1) are unaffected and this produces
// identical output to plain series scheduling.
export function sequenceTasks(
  tasks: ReadonlyArray<{ durationDays: number; parallelGroup?: string | null }>,
  startDate: Date
): Array<{ startDate: Date; endDate: Date }> {
  // Group task indices by parallelGroup (ignoring null/empty/singleton groups).
  const indicesByGroup = new Map<string, number[]>()
  tasks.forEach((t, idx) => {
    if (!t.parallelGroup) return
    const list = indicesByGroup.get(t.parallelGroup) ?? []
    list.push(idx)
    indicesByGroup.set(t.parallelGroup, list)
  })

  const results: Array<{ startDate: Date; endDate: Date } | null> = tasks.map(() => null)
  const scheduled = new Set<number>()
  let cursor = new Date(startDate)
  let halfDayUsed = false

  for (let i = 0; i < tasks.length; i++) {
    if (scheduled.has(i)) continue
    const task = tasks[i]
    const group = task.parallelGroup ? indicesByGroup.get(task.parallelGroup) : undefined
    const clusterIndices = group && group.length > 1 ? group : [i]

    if (clusterIndices.length === 1 && task.durationDays <= 0.5) {
      results[i] = { startDate: new Date(cursor), endDate: new Date(cursor) }
      scheduled.add(i)
      if (!halfDayUsed) {
        halfDayUsed = true // hold cursor — second half still free
      } else {
        halfDayUsed = false
        cursor = addWorkingDays(cursor, 1) // day full, advance
      }
      continue
    }

    if (halfDayUsed) {
      cursor = addWorkingDays(cursor, 1) // spare half day — start full task(s) on next day
      halfDayUsed = false
    }
    const clusterStart = new Date(cursor)
    let maxDuration = 1
    for (const idx of clusterIndices) {
      const duration = Math.max(1, Math.ceil(tasks[idx].durationDays))
      const taskEnd = addWorkingDays(new Date(clusterStart), duration - 1)
      results[idx] = { startDate: new Date(clusterStart), endDate: taskEnd }
      scheduled.add(idx)
      maxDuration = Math.max(maxDuration, duration)
    }
    cursor = addWorkingDays(clusterStart, maxDuration)
  }

  return results as Array<{ startDate: Date; endDate: Date }>
}

// Total working-day span (first start → last end, inclusive) that
// `sequenceTasks` would actually produce for this task list — the single
// source of truth for "how many days will this schedule really take" used
// by both the admin template preview and the project setup wizard.
export function templateScheduleDays(
  tasks: ReadonlyArray<{ durationDays: number; parallelGroup?: string | null }>
): number {
  if (tasks.length === 0) return 0
  const slots = sequenceTasks(tasks, new Date(2000, 0, 3)) // arbitrary Monday anchor
  const minStart = slots.reduce((m, s) => (s.startDate < m ? s.startDate : m), slots[0].startDate)
  const maxEnd = slots.reduce((m, s) => (s.endDate > m ? s.endDate : m), slots[0].endDate)
  return countWorkingDays(minStart, maxEnd)
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
