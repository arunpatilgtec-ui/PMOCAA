import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth()
    if (!['ADMIN', 'PLANNER', 'MANAGER'].includes(session.role))
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await ctx.params
    const { action } = await req.json()  // 'approve' | 'reject'

    const project = await prisma.project.findUnique({
      where: { id },
      select: { leadId: true, planStatus: true, name: true },
    })
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })
    if (project.planStatus !== 'SUBMITTED')
      return Response.json({ error: 'No submitted plan to review' }, { status: 400 })

    const newStatus = action === 'approve' ? 'APPROVED' : 'DRAFT'
    await prisma.project.update({ where: { id }, data: { planStatus: newStatus } })

    // Notify project lead
    if (project.leadId) {
      await prisma.notification.create({
        data: {
          userId: project.leadId,
          senderId: session.id,
          type: 'APPROVAL_COMPLETED' as const,
          title: action === 'approve' ? 'Project Plan Approved' : 'Project Plan Needs Revision',
          message: action === 'approve'
            ? `${session.name} approved the plan for "${project.name}". The plan is now locked.`
            : `${session.name} sent the plan for "${project.name}" back for revision.`,
          actionUrl: `/projects/${id}`,
        },
      })
    }

    return Response.json({ ok: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
