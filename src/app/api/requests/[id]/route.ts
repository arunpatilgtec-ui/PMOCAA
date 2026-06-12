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

    // Fetch existing request to get submitter info for notifications
    const existing = await prisma.request.findUnique({
      where: { id },
      select: { submitterId: true, title: true },
    })
    if (!existing) {
      return Response.json({ error: 'Not found' }, { status: 404 })
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

      // Notify submitter
      if (existing.submitterId !== session.id) {
        await prisma.notification.create({
          data: {
            userId: existing.submitterId,
            senderId: session.id,
            type: 'APPROVAL_COMPLETED',
            title: 'Request Converted to Project',
            message: `Your request "${existing.title}" has been approved and converted to project "${project.name}".`,
            actionUrl: `/projects/${project.id}`,
          },
        })
      }

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

    // Notify submitter on key status changes
    if (data.status && existing.submitterId !== session.id) {
      const messages: Record<string, string> = {
        REVIEW:   `Your request "${existing.title}" is now under review.`,
        APPROVED: `Your request "${existing.title}" has been approved!`,
        REJECTED: `Your request "${existing.title}" was not approved.`,
      }
      const msg = messages[data.status]
      if (msg) {
        await prisma.notification.create({
          data: {
            userId: existing.submitterId,
            senderId: session.id,
            type: 'APPROVAL_COMPLETED',
            title: data.status === 'APPROVED' ? 'Request Approved' : data.status === 'REJECTED' ? 'Request Rejected' : 'Request Under Review',
            message: msg,
            actionUrl: '/requests',
          },
        })
      }
    }

    return Response.json(request)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
