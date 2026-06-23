import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

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

  const meeting = await prisma.meeting.create({
    data: {
      userId: user.id,
      title,
      date: new Date(date),
      startTime,
      endTime,
      description: description || null,
    },
    include: { user: { select: { id: true, name: true } } },
  })

  return NextResponse.json(meeting)
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
