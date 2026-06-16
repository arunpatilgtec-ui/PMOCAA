import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const view = searchParams.get('view')

    // Role-based project visibility
    let roleFilter: Record<string, unknown> = {}
    // Matches any project where this user has at least one task assigned to them
    const hasMyTask = { workstreams: { some: { tasks: { some: { ownerId: session.id } } } } }

    if (session.role === 'PROJECT_LEAD') {
      roleFilter = {
        OR: [
          { leadId: session.id },
          hasMyTask,
        ],
      }
    } else if (session.role === 'RESOURCE') {
      roleFilter = {
        OR: [
          { allocations: { some: { userId: session.id } } },
          { request: { submitterId: session.id, status: 'APPROVED' } },
          hasMyTask,
        ],
      }
    } else if (session.role === 'WORKSTREAM_LEAD') {
      roleFilter = {
        OR: [
          { allocations: { some: { userId: session.id } } },
          { workstreams: { some: { leadId: session.id } } },
          hasMyTask,
        ],
      }
    } else if (['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role) && view === 'mine') {
      roleFilter = { plannerId: session.id }
    }
    // LEADERSHIP + default admin/manager/planner: no filter (see all)

    const projects = await prisma.project.findMany({
      where: {
        NOT: { name: '__direct_assignments__' },
        ...roleFilter,
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
    if (!['ADMIN', 'PLANNER', 'PROJECT_LEAD'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.endDate || data.startDate)

    const project = await prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        status: 'PLANNING',
        priority: data.priority || 'MEDIUM',
        startDate,
        endDate,
        leadId: data.leadId || (session.role === 'PROJECT_LEAD' ? session.id : null),
        plannerId: data.plannerId || (session.role !== 'PROJECT_LEAD' ? session.id : null),
        projectLinks: data.projectLinks || [],
        projectClassification: data.projectClassification || null,
        numberOfProducts: data.numberOfProducts ? parseInt(String(data.numberOfProducts), 10) : null,
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
