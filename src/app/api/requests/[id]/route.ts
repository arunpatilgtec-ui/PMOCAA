import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/requests/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params
    const data = await req.json()

    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Convert to project
    if (data.status === 'CONVERTED' && data.convertToProject) {
      const project = await prisma.project.create({
        data: {
          name: data.convertToProject.name,
          description: data.convertToProject.description,
          type: data.convertToProject.type,
          status: 'PLANNING',
          priority: data.convertToProject.priority || 'MEDIUM',
          startDate: new Date(data.convertToProject.startDate),
          endDate: new Date(data.convertToProject.endDate),
          leadId: data.convertToProject.leadId || null,
          plannerId: session.id,
        },
      })

      const request = await prisma.request.update({
        where: { id },
        data: { status: 'CONVERTED', projectId: project.id },
        include: { project: true },
      })
      return Response.json(request)
    }

    const request = await prisma.request.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    })
    return Response.json(request)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
