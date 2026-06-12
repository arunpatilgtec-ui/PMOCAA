import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    const projects = await prisma.project.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(type ? { type: type as never } : {}),
      },
      include: {
        lead: { select: { id: true, name: true, avatarUrl: true } },
        planner: { select: { id: true, name: true, avatarUrl: true } },
        workstreams: {
          include: {
            tasks: { select: { id: true, status: true, priority: true } },
            lead: { select: { id: true, name: true } },
          },
        },
        milestones: true,
        allocations: {
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        _count: { select: { workstreams: true } },
      },
      orderBy: [{ priority: 'asc' }, { startDate: 'asc' }],
    })

    return Response.json(projects)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PROJECTS GET]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        status: data.status || 'PLANNING',
        priority: data.priority || 'MEDIUM',
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        leadId: data.leadId || null,
        plannerId: data.plannerId || session.id,
      },
      include: {
        lead: { select: { id: true, name: true } },
        planner: { select: { id: true, name: true } },
      },
    })

    return Response.json(project, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[PROJECTS POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
