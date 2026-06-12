import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const workstream = await prisma.workstream.create({
      data: {
        name: data.name,
        projectId: data.projectId,
        leadId: data.leadId || null,
        status: data.status || 'NOT_STARTED',
        order: data.order || 0,
      },
      include: {
        lead: { select: { id: true, name: true } },
        tasks: true,
      },
    })
    return Response.json(workstream, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
