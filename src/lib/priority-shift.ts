import { prisma } from './prisma'

const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

function addWorkingDays(date: Date, days: number): Date {
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

/**
 * When a HIGH or CRITICAL task lands in a resource's queue, automatically push any
 * lower-priority tasks (with future start dates) to begin after the new task ends.
 * The resource is notified of what shifted; no separate manager approval is needed
 * since the task itself was already approved/assigned by a manager.
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

  // Determine when this task frees up the resource
  let newTaskEnd: Date
  if (newTask.endDate) {
    newTaskEnd = new Date(newTask.endDate)
  } else {
    const durationDays = Math.max(1, Math.ceil((newTask.estimatedHours || 8) / 8))
    const startFrom = newTask.startDate ? new Date(newTask.startDate) : today
    newTaskEnd = addWorkingDays(startFrom, durationDays)
  }

  // Get resource's active scheduled tasks (future, not in-progress or done)
  const activeTasks = await prisma.task.findMany({
    where: {
      ownerId: newTask.ownerId,
      id: { not: newTask.id },
      status: { notIn: ['COMPLETED', 'CANCELLED', 'IN_PROGRESS'] },
      startDate: { gte: today },
    },
    select: {
      id: true, name: true, priority: true,
      startDate: true, endDate: true, estimatedHours: true,
    },
  })

  // Lower-priority tasks that start on or before the new task ends (conflicting window)
  const toShift = activeTasks.filter(t => {
    const tRank = PRIORITY_RANK[t.priority] ?? 1
    return tRank < newPriorityRank && t.startDate !== null && new Date(t.startDate) <= newTaskEnd
  })

  if (toShift.length === 0) return { shiftedCount: 0 }

  const shiftedNames: string[] = []

  for (const task of toShift) {
    if (!task.startDate) continue
    const taskStart = new Date(task.startDate)
    const taskEnd = task.endDate ? new Date(task.endDate) : null
    const durationDays = taskEnd
      ? Math.max(1, Math.ceil((taskEnd.getTime() - taskStart.getTime()) / 86400000))
      : Math.max(1, Math.ceil((task.estimatedHours || 8) / 8))

    const newStart = addWorkingDays(newTaskEnd, 1)
    const newEnd = addWorkingDays(newStart, durationDays)

    await prisma.task.update({
      where: { id: task.id },
      data: { startDate: newStart, endDate: newEnd },
    })
    shiftedNames.push(task.name)
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
        message: `"${newTask.name}" (${newTask.priority}) was added to your queue. ${shiftedNames.length} lower-priority task(s) rescheduled: ${preview}${more}. Check your queue for the updated timeline.`,
        actionUrl: '/queue',
      },
    }).catch(console.error)
  }

  return { shiftedCount: shiftedNames.length }
}
