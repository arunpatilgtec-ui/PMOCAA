import { prisma } from './prisma'

export const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

export function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

interface IncomingTask {
  id: string
  name: string
  priority: string
  startDate: Date | null
  endDate: Date | null
  estimatedHours: number
  ownerId: string | null
}

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

/**
 * When a HIGH or CRITICAL task lands in a resource's queue, automatically push any
 * lower-priority tasks that conflict with its window. Also assigns dates to previously
 * undated lower-priority tasks so they slot in after the new task.
 */
export async function applyPriorityShift(
  newTask: IncomingTask,
  assignerId: string
): Promise<{ shiftedCount: number }> {
  if (!newTask.ownerId) return { shiftedCount: 0 }
  if (!['HIGH', 'CRITICAL'].includes(newTask.priority)) return { shiftedCount: 0 }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const newPriorityRank = PRIORITY_RANK[newTask.priority] ?? 1

  // Determine when the new task frees up the resource
  let newTaskEnd: Date
  if (newTask.endDate) {
    newTaskEnd = new Date(newTask.endDate)
  } else {
    const durationDays = Math.max(1, Math.ceil((newTask.estimatedHours || 8) / 8))
    const startFrom = newTask.startDate ? new Date(newTask.startDate) : today
    newTaskEnd = addWorkingDays(startFrom, durationDays)
  }

  // Get all active tasks for the resource (including undated ones)
  const activeTasks = await prisma.task.findMany({
    where: {
      ownerId: newTask.ownerId,
      id: { not: newTask.id },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'IN_PROGRESS'] },
    },
    select: {
      id: true, name: true, priority: true,
      startDate: true, endDate: true, estimatedHours: true,
    },
  })

  // Tasks that need to move: lower priority AND either conflicting with the new task's window
  // OR have no dates (will be placed after the new task)
  const toShift = activeTasks.filter(t => {
    const tRank = PRIORITY_RANK[t.priority] ?? 1
    if (tRank >= newPriorityRank) return false
    if (!t.startDate) return true // undated lower-priority → assign dates after new task
    const tStart = new Date(t.startDate)
    return tStart >= today && tStart <= newTaskEnd // conflicts with new task window
  })

  if (toShift.length === 0) return { shiftedCount: 0 }

  const shiftedNames: string[] = []
  // Start placing shifted tasks the day after the new task ends
  let cursor = addWorkingDays(newTaskEnd, 1)

  // Sort toShift by priority DESC then by existing startDate
  toShift.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 1
    const pb = PRIORITY_RANK[b.priority] ?? 1
    if (pb !== pa) return pb - pa
    if (a.startDate && b.startDate) return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    if (a.startDate) return -1
    if (b.startDate) return 1
    return 0
  })

  for (const task of toShift) {
    const taskEnd = task.endDate ? new Date(task.endDate) : null
    const taskStart = task.startDate ? new Date(task.startDate) : null
    const durationDays = (taskStart && taskEnd)
      ? Math.max(1, Math.ceil((taskEnd.getTime() - taskStart.getTime()) / 86400000))
      : Math.max(1, Math.ceil((task.estimatedHours || 8) / 8))

    const newStart = new Date(cursor)
    const newEnd = addWorkingDays(newStart, durationDays - 1)

    await prisma.task.update({
      where: { id: task.id },
      data: { startDate: newStart, endDate: newEnd },
    })
    shiftedNames.push(task.name)
    cursor = addWorkingDays(newEnd, 1)
  }

  if (shiftedNames.length > 0 && newTask.ownerId !== assignerId) {
    const preview = shiftedNames.slice(0, 2).map(n => `"${n}"`).join(', ')
    const more = shiftedNames.length > 2 ? ` +${shiftedNames.length - 2} more` : ''
    await prisma.notification.create({
      data: {
        userId: newTask.ownerId,
        senderId: assignerId,
        type: 'TASK_UPDATED',
        title: 'Queue Reordered — Priority Task Added',
        message: `"${newTask.name}" (${newTask.priority}) was added to your queue. ${shiftedNames.length} task(s) rescheduled: ${preview}${more}. View your updated plan.`,
        actionUrl: '/queue',
      },
    }).catch(console.error)
  }

  return { shiftedCount: shiftedNames.length }
}
