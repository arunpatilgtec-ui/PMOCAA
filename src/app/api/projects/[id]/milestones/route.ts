import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/milestones'>) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const { name, dueDate, description } = await req.json()

    const milestone = await prisma.milestone.create({
      data: {
        name,
        projectId: id,
        dueDate: new Date(dueDate),
        description,
      },
    })
    return Response.json(milestone, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
