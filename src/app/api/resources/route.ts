import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role')

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(role ? { role: role as never } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        capacityPct: true,
        department: true,
        title: true,
        allocations: {
          include: {
            project: { select: { id: true, name: true, status: true } },
          },
        },
        ownedTasks: {
          where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } },
          include: {
            workstream: { select: { project: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Calculate utilization
    const withUtilization = users.map((user) => {
      const totalAllocation = user.allocations.reduce((sum, a) => sum + a.allocationPct, 0)
      const activeTasks = user.ownedTasks.length
      return {
        ...user,
        utilizationPct: totalAllocation,
        activeTasks,
        isOverloaded: totalAllocation > user.capacityPct,
      }
    })

    return Response.json(withUtilization)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
