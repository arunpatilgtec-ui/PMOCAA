import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { generatePrioritySchedule, addWorkingDays } from '@/lib/priority-shift'

/**
 * POST /api/queue/schedule
 * Body: { ownerId?: string, apply?: boolean }
 *
 * Returns a priority-ordered schedule for the resource's active tasks.
 * If apply=true, also writes the dates back to the DB.
 * Only ADMIN/MANAGER/PLANNER can schedule for another user.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { ownerId, apply = false } = await req.json()

    const targetId = ownerId || session.id

    // Only privileged roles can generate schedules for others
    if (targetId !== session.id && !['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const activeTasks = await prisma.task.findMany({
      where: {
        ownerId: targetId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'IN_PROGRESS'] },
      },
      select: {
        id: true, name: true, priority: true,
        startDate: true, endDate: true, estimatedHours: true,
      },
    })

    if (activeTasks.length === 0) {
      return Response.json({ schedule: [], applied: false })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const schedule = generatePrioritySchedule(activeTasks, today)

    if (apply) {
      for (const slot of schedule) {
        await prisma.task.update({
          where: { id: slot.id },
          data: { startDate: slot.startDate, endDate: slot.endDate },
        })
      }

      // Notify the resource if someone else applied the schedule
      if (targetId !== session.id) {
        await prisma.notification.create({
          data: {
            userId: targetId,
            senderId: session.id,
            type: 'TASK_UPDATED',
            title: 'Your Task Schedule Updated',
            message: `${session.name} generated a priority-ordered schedule for your ${schedule.length} task(s). View your queue to see the new plan.`,
            actionUrl: '/queue',
          },
        }).catch(console.error)
      }
    }

    return Response.json({
      schedule: schedule.map(s => ({
        ...s,
        startDate: s.startDate.toISOString(),
        endDate: s.endDate.toISOString(),
      })),
      applied: apply,
    })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('[QUEUE SCHEDULE POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
