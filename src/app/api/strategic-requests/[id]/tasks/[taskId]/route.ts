import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { createNotification } from '@/lib/notifications'

type Ctx = { params: Promise<{ id: string; taskId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    const { id, taskId } = await ctx.params

    const sr = await prisma.strategicRequest.findUnique({
      where: { id },
      select: { submitterId: true },
    })
    if (!sr) return Response.json({ error: 'Not found' }, { status: 404 })

    const canEdit =
      sr.submitterId === session.id ||
      ['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)
    if (!canEdit) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const data = await req.json()

    // Fetch existing task to detect assignee change
    const existing = await prisma.strategicTask.findUnique({
      where: { id: taskId, strategicRequestId: id },
      select: { assigneeId: true, title: true },
    })

    const task = await prisma.strategicTask.update({
      where: { id: taskId, strategicRequestId: id },
      data: {
        ...(data.title      !== undefined && { title:          data.title }),
        ...(data.isRecurring !== undefined && { isRecurring:   data.isRecurring }),
        ...(data.hoursPerDay !== undefined && {
          hoursPerDay: data.hoursPerDay ? parseFloat(String(data.hoursPerDay)) : null,
        }),
        ...(data.estimatedHours !== undefined && {
          estimatedHours: data.estimatedHours ? parseFloat(String(data.estimatedHours)) : null,
        }),
        ...(data.startDate !== undefined && {
          startDate: data.startDate ? new Date(data.startDate) : null,
        }),
        ...(data.endDate !== undefined && {
          endDate: data.endDate ? new Date(data.endDate) : null,
        }),
        ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId || null }),
      },
      include: { assignee: { select: { id: true, name: true } } },
    })

    // Notify new assignee if assignee changed
    const newAssigneeId = data.assigneeId !== undefined ? (data.assigneeId || null) : existing?.assigneeId
    if (
      data.assigneeId !== undefined &&
      data.assigneeId &&
      data.assigneeId !== existing?.assigneeId
    ) {
      await createNotification({
        type: 'TASK_ASSIGNED',
        title: 'Strategic Task Assigned',
        message: `You have been assigned to: ${existing?.title ?? task.title}`,
        userId: newAssigneeId!,
        senderId: session.id,
        actionUrl: '/requests',
      })
    }

    return Response.json(task)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
