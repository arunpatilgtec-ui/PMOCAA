import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { addWorkingDays } from '@/lib/date-utils'

function parseMeetingHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  return (eh * 60 + em - sh * 60 - sm) / 60
}

export async function GET() {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meetings = await prisma.meeting.findMany({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    include: { user: { select: { id: true, name: true } } },
  })
  return NextResponse.json(meetings)
}

export async function POST(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, date, startTime, endTime, description } = body

  if (!title || !date || !startTime || !endTime) {
    return NextResponse.json({ error: 'title, date, startTime and endTime are required' }, { status: 400 })
  }

  const meetingDate = new Date(date)
  meetingDate.setHours(0, 0, 0, 0)

  // Shift tasks if meeting is 4+ hours (half day or more blocks meaningful work)
  let tasksShifted = 0
  const durationHours = parseMeetingHours(startTime, endTime)
  if (durationHours >= 4) {
    const tasks = await prisma.task.findMany({
      where: {
        ownerId: user.id,
        startDate: { gte: meetingDate },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      select: { id: true, startDate: true, endDate: true },
    })
    for (const task of tasks) {
      if (!task.startDate) continue
      const newStart = addWorkingDays(task.startDate, 1)
      const newEnd = task.endDate ? addWorkingDays(task.endDate, 1) : null
      await prisma.task.update({
        where: { id: task.id },
        data: { startDate: newStart, endDate: newEnd ?? undefined },
      })
      tasksShifted++
    }
  }

  const meeting = await prisma.meeting.create({
    data: {
      userId: user.id,
      title,
      date: meetingDate,
      startTime,
      endTime,
      description: description || null,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json({ ...meeting, durationHours, tasksShifted })
}

export async function DELETE(req: NextRequest) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const meeting = await prisma.meeting.findUnique({ where: { id } })
  if (!meeting || meeting.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.meeting.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
