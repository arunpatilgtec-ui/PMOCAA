import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string; productId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    await requireAuth()
    const { productId } = await ctx.params

    const history = await prisma.productHistory.findMany({
      where: { productId },
      orderBy: { changedAt: 'desc' },
      include: {
        changedBy: { select: { id: true, name: true, role: true } },
        targetUser: { select: { id: true, name: true } },
      },
    })

    return Response.json(history)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
