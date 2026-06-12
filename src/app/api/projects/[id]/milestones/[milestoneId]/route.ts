import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; milestoneId: string }> }) {
  try {
    await requireAuth()
    const { milestoneId } = await ctx.params
    const data = await req.json()

    const milestone = await prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        ...(data.completed !== undefined && {
          completed: data.completed,
          completedAt: data.completed ? new Date() : null,
        }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.dueDate !== undefined && { dueDate: new Date(data.dueDate) }),
      },
    })
    return Response.json(milestone)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
