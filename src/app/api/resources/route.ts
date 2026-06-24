import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export const HOURS_PER_DAY = 8   // daily limit per person (at 100% capacity)
export const HOURS_PER_WEEK = 45  // weekly limit per person (at 100% capacity)

export function getWeekBounds() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + daysToMon)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)
  return { weekStart, weekEnd }
}

// Count working (Mon–Fri) days between two dates inclusive
function countWorkingDays(start: Date, end: Date): number {
  let count = 0
  const curr = new Date(start)
  curr.setHours(0, 0, 0, 0)
  const endDay = new Date(end)
  endDay.setHours(23, 59, 59, 999)
  while (curr <= endDay) {
    const dow = curr.getDay()
    if (dow !== 0 && dow !== 6) count++
    curr.setDate(curr.getDate() + 1)
  }
  return Math.max(1, count)
}

// Returns a map of ISO-date → hours for every working day in the current week
export function calcDailyHours(
  tasks: Array<{ estimatedHours: number; startDate: Date | null; endDate: Date | null }>,
  weekStart: Date,
  weekEnd: Date
): Record<string, number> {
  const daily: Record<string, number> = {}

  // Pre-populate all Mon–Fri days in the range with 0
  const populateDay = new Date(weekStart)
  populateDay.setHours(0, 0, 0, 0)
  const populateEnd = new Date(weekEnd)
  populateEnd.setHours(23, 59, 59, 999)
  while (populateDay <= populateEnd) {
    const dow = populateDay.getDay()
    if (dow !== 0 && dow !== 6) {
      daily[populateDay.toISOString().slice(0, 10)] = 0
    }
    populateDay.setDate(populateDay.getDate() + 1)
  }

  const workingKeys = Object.keys(daily)

  for (const task of tasks) {
    const hrs = task.estimatedHours || 0
    if (hrs === 0) continue

    if (!task.startDate || !task.endDate) {
      // No dates → spread equally across Mon–Fri of this week
      const hpd = hrs / (workingKeys.length || 5)
      for (const key of workingKeys) daily[key] += hpd
      continue
    }

    // Overlap of task with this week
    const overlapStart = new Date(Math.max(task.startDate.getTime(), weekStart.getTime()))
    const overlapEnd   = new Date(Math.min(task.endDate.getTime(), weekEnd.getTime()))
    if (overlapStart > overlapEnd) continue

    // Rate = estimated hours ÷ total working days of the full task span
    const totalWorkingDays = countWorkingDays(task.startDate, task.endDate)
    const hpd = hrs / totalWorkingDays

    // Distribute into each overlapping working day
    const curr = new Date(overlapStart)
    curr.setHours(0, 0, 0, 0)
    while (curr <= overlapEnd) {
      const dow = curr.getDay()
      if (dow !== 0 && dow !== 6) {
        const key = curr.toISOString().slice(0, 10)
        if (key in daily) daily[key] += hpd
      }
      curr.setDate(curr.getDate() + 1)
    }
  }

  return daily
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role')
    const fromParam = searchParams.get('from')
    const toParam   = searchParams.get('to')

    const { weekStart, weekEnd } = getWeekBounds()
    // For gantt requests, use the requested range; otherwise default to current week
    const rangeStart = fromParam ? new Date(fromParam + 'T00:00:00') : weekStart
    const rangeEnd   = toParam   ? new Date(toParam   + 'T23:59:59') : weekEnd

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(role ? { role: role as never } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        capacityPct: true,
        department: true,
        title: true,
        allocations: {
          include: {
            project: { select: { id: true, name: true, status: true } },
          },
        },
        ownedTasks: {
          where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
            estimatedHours: true,
            startDate: true,
            endDate: true,
            workstream: {
              select: {
                id: true,
                name: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ endDate: 'asc' }, { priority: 'asc' }],
        },
        assignedRequests: {
          where: { status: { in: ['SUBMITTED', 'REVIEW'] } },
          select: {
            id: true,
            title: true,
            status: true,
            estimatedHours: true,
            hoursPerDay: true,
            isRecurring: true,
            startDate: true,
            endDate: true,
          },
        },
        leaves: {
          where: {
            endDate:   { gte: rangeStart },
            startDate: { lte: rangeEnd },
          },
          select: { startDate: true, endDate: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const withUtilization = users.map((user) => {
      // Limits scaled by this person's capacity setting
      const weeklyCapacityHours = Math.round(HOURS_PER_WEEK * user.capacityPct / 100 * 10) / 10
      const dailyCapacityHours  = Math.round(HOURS_PER_DAY  * user.capacityPct / 100 * 10) / 10

      // REVIEW requests count toward utilization (manager is actively processing — very likely approved).
      // SUBMITTED requests (self-submitted, unreviewed) are display-only — too uncertain to count.
      // APPROVED requests already exist as Tasks in ownedTasks, so no need to include here.
      const toWorkItem = (req: typeof user.assignedRequests[number]) => {
        if (req.isRecurring && req.hoursPerDay) {
          const start = req.startDate ?? new Date()
          const end   = req.endDate   ?? new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000)
          return { estimatedHours: req.hoursPerDay * countWorkingDays(start, end), startDate: req.startDate, endDate: end }
        }
        return { estimatedHours: req.estimatedHours ?? 0, startDate: req.startDate, endDate: req.endDate }
      }

      const reviewRequestItems = user.assignedRequests
        .filter(r => r.status === 'REVIEW')
        .map(toWorkItem)

      const pendingRequestItems = user.assignedRequests.map(toWorkItem)

      // Tasks (approved) + REVIEW requests drive utilization and gantt hours
      const allWorkItems = [...user.ownedTasks, ...reviewRequestItems]

      // dailyHoursMap covers the requested range (gantt) or current week (default)
      const dailyHoursMap = calcDailyHours(allWorkItems, rangeStart, rangeEnd)

      // Weekly stats always reflect the current week regardless of gantt range
      const currentWeekMap = (fromParam || toParam)
        ? calcDailyHours(allWorkItems, weekStart, weekEnd)
        : dailyHoursMap
      const dailyValues   = Object.values(currentWeekMap)

      const thisWeekHours = Math.round(dailyValues.reduce((s, h) => s + h, 0) * 10) / 10
      const maxDailyHours = Math.round(Math.max(0, ...dailyValues) * 10) / 10

      const utilizationPct = weeklyCapacityHours > 0
        ? Math.round(thisWeekHours / weeklyCapacityHours * 100)
        : 0

      const isOverloadedWeekly = thisWeekHours > weeklyCapacityHours
      const isOverloadedDaily  = maxDailyHours  > dailyCapacityHours
      const isOverloaded       = isOverloadedWeekly || isOverloadedDaily

      const overloadReason = isOverloadedDaily && isOverloadedWeekly
        ? 'both'
        : isOverloadedDaily  ? 'daily'
        : isOverloadedWeekly ? 'weekly'
        : null

      const totalTaskHours = Math.round(
        user.ownedTasks.reduce((s, t) => s + (t.estimatedHours || 0), 0) * 10
      ) / 10

      const directTaskHours = Math.round(
        user.ownedTasks
          .filter(t => t.workstream.project.name === '__direct_assignments__')
          .reduce((s, t) => s + (t.estimatedHours || 0), 0) * 10
      ) / 10

      // reviewRequestHours: counted in utilization (REVIEW status — manager is processing)
      const reviewRequestHours = Math.round(
        reviewRequestItems.reduce((s, r) => s + (r.estimatedHours || 0), 0) * 10
      ) / 10

      // submittedRequestHours: display-only (SUBMITTED — not yet reviewed, too uncertain)
      const pendingRequestHours = Math.round(
        pendingRequestItems
          .filter((_, i) => user.assignedRequests[i]?.status === 'SUBMITTED')
          .reduce((s, r) => s + (r.estimatedHours || 0), 0) * 10
      ) / 10

      // Leave days (working days within the requested range where user is on leave)
      const leaveDates: string[] = []
      for (const leave of user.leaves) {
        const ls = new Date(leave.startDate); ls.setHours(0, 0, 0, 0)
        const le = new Date(leave.endDate);   le.setHours(23, 59, 59, 999)
        const start = new Date(Math.max(ls.getTime(), rangeStart.getTime()))
        const end   = new Date(Math.min(le.getTime(), rangeEnd.getTime()))
        const curr  = new Date(start); curr.setHours(0, 0, 0, 0)
        while (curr <= end) {
          const dow = curr.getDay()
          if (dow !== 0 && dow !== 6) leaveDates.push(curr.toISOString().slice(0, 10))
          curr.setDate(curr.getDate() + 1)
        }
      }

      const isOnLeaveToday = user.leaves.some(l => {
        const ls = new Date(l.startDate); ls.setHours(0, 0, 0, 0)
        const le = new Date(l.endDate);   le.setHours(23, 59, 59, 999)
        return today >= ls && today <= le
      })

      return {
        ...user,
        // Hours
        thisWeekHours,
        maxDailyHours,
        weeklyCapacityHours,
        dailyCapacityHours,
        totalTaskHours,
        directTaskHours,
        reviewRequestHours,
        pendingRequestHours,
        dailyHoursMap,
        // Utilization
        utilizationPct,
        // Overload flags
        isOverloaded,
        isOverloadedWeekly,
        isOverloadedDaily,
        overloadReason,
        activeTasks: user.ownedTasks.length,
        // Leave
        leaveDates,
        isOnLeaveToday,
      }
    })

    return Response.json(withUtilization)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
