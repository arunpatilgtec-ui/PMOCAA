import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { calculateScheduleImpact } from '@/lib/schedule-impact'
import { notifyScheduleChangeProposed } from '@/lib/notifications'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')

    const changes = await prisma.scheduleChange.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(projectId ? { projectId } : {}),
      },
      include: {
        requester: { select: { id: true, name: true, avatarUrl: true } },
        project: { select: { id: true, name: true } },
        approval: {
          include: {
            approver: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return Response.json(changes)
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

    // Calculate impact before creating
    const impact = await calculateScheduleImpact(data.changeType, {
      taskId: data.taskId,
      projectId: data.projectId,
      userId: data.userId,
      newStartDate: data.proposedData?.startDate ? new Date(data.proposedData.startDate) : undefined,
      newEndDate: data.proposedData?.endDate ? new Date(data.proposedData.endDate) : undefined,
      newPriority: data.proposedData?.priority,
    })

    const change = await prisma.scheduleChange.create({
      data: {
        changeType: data.changeType,
        description: data.description,
        requesterId: session.id,
        projectId: data.projectId || null,
        affectedTaskIds: data.affectedTaskIds || [],
        currentData: data.currentData,
        proposedData: data.proposedData,
        impactSummary: impact as never,
        status: 'PENDING',
      },
    })

    // Create approval request
    await prisma.approvalRequest.create({
      data: {
        scheduleChangeId: change.id,
        requesterId: session.id,
        status: 'PENDING',
      },
    })

    // Notify managers and planners
    const approvers = await prisma.user.findMany({
      where: { role: { in: ['MANAGER', 'PLANNER'] }, isActive: true },
      select: { id: true },
    })
    const approverIds = approvers.map((u) => u.id).filter((id) => id !== session.id)

    if (approverIds.length > 0 && data.projectId) {
      await notifyScheduleChangeProposed(
        change.id,
        session.id,
        data.projectId,
        approverIds
      ).catch(console.error)
    }

    return Response.json({ ...change, impactSummary: impact }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('[SCHEDULE_CHANGES POST]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
