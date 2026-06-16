import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    const project = await prisma.project.findUnique({ where: { id }, select: { leadId: true, planStatus: true, name: true } })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
    if (session.role !== 'PROJECT_LEAD' || project.leadId !== session.id)
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (project.planStatus !== 'DRAFT')
      return Response.json({ error: 'Plan already submitted' }, { status: 400 })

    await prisma.project.update({ where: { id }, data: { planStatus: 'SUBMITTED' } })

    // Notify all planners
    const planners = await prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'PLANNER', 'MANAGER'] }, isActive: true },
      select: { id: true },
    })
    if (planners.length > 0) {
      await prisma.notification.createMany({
        data: planners.map(p => ({
          userId: p.id,
          senderId: session.id,
          type: 'APPROVAL_REQUIRED' as const,
          title: 'Project Plan Submitted',
          message: `${session.name} submitted the plan for "${project.name}" — review and approve it.`,
          actionUrl: `/projects/${id}`,
        })),
      })
    }

    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
