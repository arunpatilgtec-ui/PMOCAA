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

  // Pre-populate Mon–Fri with 0
  for (let d = 0; d < 7; d++) {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + d)
    const dow = day.getDay()
    if (dow !== 0 && dow !== 6) {
      daily[day.toISOString().slice(0, 10)] = 0
    }
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

    const { weekStart, weekEnd } = getWeekBounds()

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
      },
      orderBy: { name: 'asc' },
    })

    const withUtilization = users.map((user) => {
      // Limits scaled by this person's capacity setting
      const weeklyCapacityHours = Math.round(HOURS_PER_WEEK * user.capacityPct / 100 * 10) / 10
      const dailyCapacityHours  = Math.round(HOURS_PER_DAY  * user.capacityPct / 100 * 10) / 10

      const dailyHoursMap = calcDailyHours(user.ownedTasks, weekStart, weekEnd)
      const dailyValues   = Object.values(dailyHoursMap)

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

      return {
        ...user,
        // Hours
        thisWeekHours,
        maxDailyHours,
        weeklyCapacityHours,
        dailyCapacityHours,
        totalTaskHours,
        directTaskHours,
        dailyHoursMap,
        // Utilization
        utilizationPct,
        // Overload flags
        isOverloaded,
        isOverloadedWeekly,
        isOverloadedDaily,
        overloadReason,
        activeTasks: user.ownedTasks.length,
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
