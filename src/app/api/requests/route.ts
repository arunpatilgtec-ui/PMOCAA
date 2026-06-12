import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const requests = await prisma.request.findMany({
      where: { ...(status ? { status: status as never } : {}) },
      include: {
        submitter: { select: { id: true, name: true, avatarUrl: true } },
        assignee:  { select: { id: true, name: true, role: true } },
        project:   { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    })
    return Response.json(requests)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const data = await req.json()

    const request = await prisma.request.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        type: data.type,
        submitterId: session.id,
        notes: data.notes,
      },
      include: {
        submitter: { select: { id: true, name: true } },
      },
    })

    // Notify all active ADMIN / MANAGER / PLANNER users
    const managers = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MANAGER', 'PLANNER'] },
        isActive: true,
        NOT: { id: session.id },
      },
      select: { id: true },
    })

    if (managers.length > 0) {
      await prisma.notification.createMany({
        data: managers.map((m) => ({
          userId: m.id,
          senderId: session.id,
          type: 'APPROVAL_REQUIRED' as const,
          title: 'New Request Submitted',
          message: `${session.name} submitted a new request: "${request.title}"`,
          actionUrl: '/requests',
        })),
      })
    }

    return Response.json(request, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
