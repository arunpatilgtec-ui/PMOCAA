import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { notifyApprovalCompleted } from '@/lib/notifications'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/schedule-changes/[id]/approve'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    if (!['MANAGER', 'PLANNER', 'ADMIN'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { approved, comments, delayDays } = await req.json()

    const change = await prisma.scheduleChange.findUnique({
      where: { id },
      include: { approval: true },
    })
    if (!change) return Response.json({ error: 'Not found' }, { status: 404 })
    if (change.status !== 'PENDING') {
      return Response.json({ error: 'Change already processed' }, { status: 400 })
    }

    if (approved) {
      // Apply the changes
      const proposedData = change.proposedData as Record<string, unknown>

      if (proposedData.action === 'delay_tasks' && Array.isArray(proposedData.tasks)) {
        // Per-task date shift (auto-delay from resource overload)
        const taskUpdates = proposedData.tasks as Array<{
          taskId: string; newStartDate?: string; newEndDate?: string
        }>
        for (const tu of taskUpdates) {
          await prisma.task.update({
            where: { id: tu.taskId },
            data: {
              ...(tu.newStartDate ? { startDate: new Date(tu.newStartDate) } : {}),
              ...(tu.newEndDate ? { endDate: new Date(tu.newEndDate) } : {}),
            },
          }).catch(() => {})
        }
      } else {
        // Standard single-field update applied to all affectedTaskIds
        for (const taskId of change.affectedTaskIds) {
          await prisma.task.update({
            where: { id: taskId },
            data: {
              ...(proposedData.startDate ? { startDate: new Date(proposedData.startDate as string) } : {}),
              ...(proposedData.endDate ? { endDate: new Date(proposedData.endDate as string) } : {}),
              ...(proposedData.priority ? { priority: proposedData.priority as never } : {}),
              ...(proposedData.status ? { status: proposedData.status as never } : {}),
            },
          }).catch(() => {})
        }

        // If the change extends the overall project timeline, update project dates too
        if (change.projectId && (proposedData.projectStartDate || proposedData.projectEndDate)) {
          await prisma.project.update({
            where: { id: change.projectId },
            data: {
              ...(proposedData.projectStartDate ? { startDate: new Date(proposedData.projectStartDate as string) } : {}),
              ...(proposedData.projectEndDate ? { endDate: new Date(proposedData.projectEndDate as string) } : {}),
            },
          }).catch(() => {})
        }
      }

      await prisma.scheduleChange.update({
        where: { id },
        data: {
          status: 'APPROVED',
          appliedAt: new Date(),
          ...(change.changeType === 'ANDON_RAISED' && delayDays != null
            ? { proposedData: { ...proposedData, confirmedDelayDays: delayDays } }
            : {}),
        },
      })

      if (change.approval) {
        await prisma.approvalRequest.update({
          where: { id: change.approval.id },
          data: { status: 'APPROVED', approverId: session.id, comments },
        })
      }
    } else {
      await prisma.scheduleChange.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: comments },
      })
      if (change.approval) {
        await prisma.approvalRequest.update({
          where: { id: change.approval.id },
          data: { status: 'REJECTED', approverId: session.id, comments },
        })
      }
    }

    // Notify requester
    await notifyApprovalCompleted(
      id,
      session.id,
      change.requesterId,
      approved,
      change.projectId || undefined
    ).catch(console.error)

    return Response.json({ ok: true, approved })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[APPROVE]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
