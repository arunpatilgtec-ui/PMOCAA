import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { addWorkingDays, countWorkingDays } from '@/lib/date-utils'

const CAN_MANAGE = ['ADMIN', 'MANAGER', 'PLANNER']

export async function GET(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isManager = CAN_MANAGE.includes(user.role)
  const targetId = isManager
    ? (req.nextUrl.searchParams.get('userId') || user.id)
    : user.id

  const leaves = await prisma.leave.findMany({
    where: { userId: targetId },
    orderBy: { startDate: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  })
  return NextResponse.json(leaves)
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type = 'VACATION', startDate, endDate, reason, userId: targetId } = body

  const isManager = CAN_MANAGE.includes(user.role)
  const targetUserId = isManager && targetId ? targetId : user.id

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (end < start) {
    return NextResponse.json({ error: 'endDate must be after startDate' }, { status: 400 })
  }

  // Count working days in the leave period
  const leaveDays = countWorkingDays(start, end)

  // Find all incomplete tasks owned by the target user that start on or after the leave start
  const tasks = await prisma.task.findMany({
    where: {
      ownerId: targetUserId,
      startDate: { gte: start },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: { id: true, startDate: true, endDate: true },
  })

  // Shift each task forward by leaveDays working days
  let tasksShifted = 0
  for (const task of tasks) {
    if (!task.startDate) continue
    const newStart = addWorkingDays(task.startDate, leaveDays)
    const newEnd = task.endDate ? addWorkingDays(task.endDate, leaveDays) : null
    await prisma.task.update({
      where: { id: task.id },
      data: { startDate: newStart, endDate: newEnd ?? undefined },
    })
    tasksShifted++
  }

  // Create the leave record
  const leave = await prisma.leave.create({
    data: {
      userId: targetUserId,
      type,
      startDate: start,
      endDate: end,
      reason: reason || null,
      tasksShifted,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ ...leave, leaveDays, tasksShifted })
}
