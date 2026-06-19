import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'MANAGER', 'PLANNER'].includes(session.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await ctx.params
    const sr = await prisma.strategicRequest.findUnique({ where: { id }, select: { id: true } })
    if (!sr) return Response.json({ error: 'Not found' }, { status: 404 })

    const data = await req.json()
    const tasks: Array<{
      title: string
      isRecurring: boolean
      hoursPerDay?: number
      estimatedHours?: number
      startDate?: string
      endDate?: string
      assigneeId?: string
    }> = Array.isArray(data.tasks) ? data.tasks : []

    if (tasks.length === 0) return Response.json({ error: 'No tasks provided' }, { status: 400 })

    const created = await prisma.strategicTask.createMany({
      data: tasks.map((t) => ({
        strategicRequestId: id,
        title: t.title || 'Untitled Task',
        isRecurring: t.isRecurring ?? false,
        hoursPerDay: t.isRecurring && t.hoursPerDay ? parseFloat(String(t.hoursPerDay)) : null,
        estimatedHours: !t.isRecurring && t.estimatedHours ? parseFloat(String(t.estimatedHours)) : null,
        startDate: t.startDate ? new Date(t.startDate) : null,
        endDate: t.endDate ? new Date(t.endDate) : null,
        assigneeId: t.assigneeId || null,
      })),
    })

    return Response.json({ count: created.count }, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
