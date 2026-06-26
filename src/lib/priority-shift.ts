import { addWorkingDays } from './date-utils'

export { addWorkingDays }
export const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }


export interface ScheduledTask {
  id: string
  name: string
  priority: string
  startDate: Date
  endDate: Date
  estimatedHours: number
  wasUndated: boolean
}

/**
 * Generates a sequential priority-ordered schedule for all active tasks belonging
 * to `ownerId`. Tasks are sorted CRITICAL→HIGH→MEDIUM→LOW; within the same priority
 * tasks that already have dates come first (preserving their relative order), then
 * undated tasks. Each task is assigned consecutive working days from `startFrom`.
 *
 * Returns the proposed schedule without writing to DB — the caller decides whether
 * to apply it.
 */
export function generatePrioritySchedule(
  tasks: Array<{ id: string; name: string; priority: string; startDate: Date | null; endDate: Date | null; estimatedHours: number }>,
  startFrom: Date
): ScheduledTask[] {
  const sorted = [...tasks].sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 1
    const pb = PRIORITY_RANK[b.priority] ?? 1
    if (pb !== pa) return pb - pa
    // Within same priority: dated tasks first (by startDate), then undated
    if (a.startDate && b.startDate) return a.startDate.getTime() - b.startDate.getTime()
    if (a.startDate) return -1
    if (b.startDate) return 1
    return 0
  })

  const result: ScheduledTask[] = []
  let cursor = new Date(startFrom)
  cursor.setHours(0, 0, 0, 0)

  for (const task of sorted) {
    const durationDays = Math.max(1, Math.ceil((task.estimatedHours || 8) / 8))
    const newStart = new Date(cursor)
    const newEnd = addWorkingDays(newStart, durationDays - 1)

    result.push({
      id: task.id,
      name: task.name,
      priority: task.priority,
      startDate: newStart,
      endDate: newEnd,
      estimatedHours: task.estimatedHours,
      wasUndated: !task.startDate,
    })

    // Next task starts the working day after this one ends
    cursor = addWorkingDays(newEnd, 1)
  }

  return result
}


