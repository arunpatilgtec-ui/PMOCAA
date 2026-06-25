import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function inferStatus(startDate: Date | null, endDate: Date | null): string {
  const now = new Date()
  if (!startDate) return 'PLANNED'
  if (startDate > now) return 'PLANNED'
  if (!endDate || endDate >= now) return 'IN_PROGRESS'
  return 'COMPLETED'
}

export async function GET() {
  try {
    const session = await requireAuth()
    const canSeeAll = ['ADMIN', 'MANAGER', 'PLANNER', 'LEADERSHIP'].includes(session.role)

    const tasks = await prisma.strategicTask.findMany({
      where: canSeeAll ? {} : { assigneeId: session.id },
      include: {
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        strategicRequest: {
          select: {
            id: true,
            title: true,
            submitter: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    })

    const shaped = tasks.map((t) => {
      const estimatedHours = t.estimatedHours ?? (t.isRecurring && t.hoursPerDay ? t.hoursPerDay : 0)
      return {
        id: t.id,
        name: t.title,
        status: t.status ?? inferStatus(t.startDate, t.endDate),
        priority: 'MEDIUM',
        startDate: t.startDate?.toISOString(),
        endDate: t.endDate?.toISOString(),
        estimatedHours,
        effortHours: estimatedHours,
        order: 0,
        reworkCount: 0,
        statusChangedAt: t.updatedAt.toISOString(),
        ownerId: t.assigneeId ?? undefined,
        owner: t.assignee
          ? { id: t.assignee.id, name: t.assignee.name, avatarUrl: t.assignee.avatarUrl }
          : undefined,
        workstream: {
          id: `sr-${t.strategicRequestId}`,
          name: t.strategicRequest.title,
          project: { id: 'strategic-requests', name: 'Strategic Tasks' },
        },
        _isStrategic: true as const,
        _srId: t.strategicRequestId,
        _submitterName: t.strategicRequest.submitter?.name ?? null,
        _submitterId: t.strategicRequest.submitter?.id ?? null,
      }
    })

    return Response.json(shaped)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
