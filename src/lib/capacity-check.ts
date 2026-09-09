// Shared capacity-conflict detection, extracted from the "capacity reminder"
// feature that originally only ran when a user submitted a self-service
// Request (src/app/(app)/requests/page.tsx). Reused so the same "this person
// is already fully booked — review or reschedule first" check can run
// whenever ANYONE assigns work to someone else (direct assignments, task
// creation, Timeline reassignment), not just self-submitted requests.

export interface CapacityTask {
  id: string
  name: string
  description?: string | null
  status: string
  priority: string
  estimatedHours: number
  effortHours?: number
  startDate: string | null
  endDate: string | null
  assignedBy?: { id: string; name: string } | null
  workstream: { name: string; project: { name: string } }
}

export interface CapacityDay {
  person: string
  date: string
  existingHours: number
  proposedHours: number
  capacityHours: number
  tasks: Array<CapacityTask & { hoursOnDay: number }>
  otherHours: number
}

interface CapacityResource {
  id: string
  name: string
  dailyCapacityHours: number
  dailyHoursMap: Record<string, number>
  ownedTasks: CapacityTask[]
}

export function dateKeyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

export function workingDateKeys(start: string, end: string): string[] {
  const keys: string[] = []
  const current = parseDateOnly(start)
  const last = parseDateOnly(end)
  while (current <= last) {
    if (current.getDay() !== 0 && current.getDay() !== 6) keys.push(dateKeyLocal(current))
    current.setDate(current.getDate() + 1)
  }
  return keys
}

export function taskHoursOnDate(task: CapacityTask, date: string, fallbackKeys: string[]): number {
  const hours = Math.max(task.estimatedHours || 0, task.effortHours || 0)
  if (hours <= 0) return 0
  if (!task.startDate || !task.endDate) {
    return fallbackKeys.includes(date) ? hours / Math.max(1, fallbackKeys.length) : 0
  }
  const start = task.startDate.slice(0, 10)
  const end = task.endDate.slice(0, 10)
  const taskKeys = workingDateKeys(start, end)
  return taskKeys.includes(date) ? hours / Math.max(1, taskKeys.length) : 0
}

// Checks whether assigning `totalHours` of new work to `userIds` between
// startDate/endDate would push any of them over capacity on any working day
// in that range. Returns only the days that ARE over capacity, each with the
// specific existing tasks contributing to that day's load (for the reminder
// dialog to display / optionally reschedule).
export async function checkCapacityConflicts({
  userIds, startDate, endDate, totalHours, isRecurring = false,
}: {
  userIds: string[]
  startDate: string
  endDate: string
  totalHours: number
  isRecurring?: boolean
}): Promise<{ person: string; days: CapacityDay[] }> {
  if (userIds.length === 0 || !startDate || !endDate || !(totalHours > 0)) return { person: '', days: [] }
  if (parseDateOnly(endDate) < parseDateOnly(startDate)) {
    throw new Error('End date must be on or after the start date')
  }

  const keys = workingDateKeys(startDate, endDate)
  if (keys.length === 0) return { person: '', days: [] }

  const res = await fetch(`/api/resources?from=${startDate}&to=${endDate}`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not check capacity')
  const resources = await res.json()

  const hoursPerPerson = totalHours / userIds.length
  const selectedResources = Array.isArray(resources)
    ? (resources as CapacityResource[]).filter((item) => userIds.includes(item.id))
    : []

  const days = selectedResources.flatMap((resource) => {
    const proposedPerDay = isRecurring ? hoursPerPerson : hoursPerPerson / Math.max(1, keys.length)
    return keys.flatMap((date): CapacityDay[] => {
      const existingHours = resource.dailyHoursMap[date] ?? 0
      const capacityHours = resource.dailyCapacityHours || 8
      if (existingHours < capacityHours && existingHours + proposedPerDay <= capacityHours) return []
      const tasks = resource.ownedTasks
        .map((task) => ({ ...task, hoursOnDay: taskHoursOnDate(task, date, keys) }))
        .filter((task) => task.hoursOnDay > 0)
      const listedHours = tasks.reduce((sum, task) => sum + task.hoursOnDay, 0)
      return [{ person: resource.name, date, existingHours, proposedHours: proposedPerDay, capacityHours, tasks, otherHours: Math.max(0, existingHours - listedHours) }]
    })
  })
  return { person: selectedResources.map((resource) => resource.name).join(', '), days }
}
