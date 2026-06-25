import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

// Nightly cron: tasks whose deadline passed without reaching REVIEW → BACKLOG
// Vercel calls this at 00:00 UTC daily with Authorization: Bearer $CRON_SECRET
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const overdue = await prisma.task.findMany({
    where: {
      endDate: { lt: today },
      status: { notIn: ['REVIEW', 'COMPLETED', 'CANCELLED', 'BACKLOG'] },
    },
    select: { id: true, name: true, ownerId: true },
  })

  if (overdue.length === 0) return Response.json({ moved: 0 })

  await prisma.task.updateMany({
    where: { id: { in: overdue.map(t => t.id) } },
    data: { status: 'BACKLOG', statusChangedAt: new Date() },
  })

  // Notify each owner
  await Promise.all(
    overdue
      .filter(t => t.ownerId)
      .map(t =>
        prisma.notification.create({
          data: {
            userId: t.ownerId!,
            type: 'TASK_UPDATED',
            title: 'Task Overdue — Moved to Backlog',
            message: `"${t.name}" passed its deadline and was automatically moved to Backlog. Please reschedule or mark it complete.`,
            actionUrl: '/kanban',
          },
        })
      )
  )

  return Response.json({ moved: overdue.length, taskIds: overdue.map(t => t.id) })
}
