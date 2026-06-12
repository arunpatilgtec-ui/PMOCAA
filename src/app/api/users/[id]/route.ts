import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/users/[id]'>) {
  try {
    const session = await requireAuth()
    if (session.role !== 'ADMIN') return Response.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await ctx.params
    if (session.id === id) return Response.json({ error: 'Cannot delete your own account' }, { status: 400 })
    await prisma.user.delete({ where: { id } })
    return Response.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/users/[id]'>) {
  try {
    const session = await requireAuth()
    const { id } = await ctx.params

    if (session.role !== 'ADMIN' && session.id !== id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const updateData: Record<string, unknown> = {}

    if (data.name !== undefined) updateData.name = data.name
    if (data.department !== undefined) updateData.department = data.department
    if (data.title !== undefined) updateData.title = data.title
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl

    if (session.role === 'ADMIN') {
      if (data.email !== undefined) updateData.email = data.email
      if (data.role !== undefined) updateData.role = data.role
      if (data.capacityPct !== undefined) updateData.capacityPct = data.capacityPct
      if (data.isActive !== undefined) updateData.isActive = data.isActive
    }

    if (data.password) {
      updateData.password = await hashPassword(data.password)
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        capacityPct: true,
        department: true,
        title: true,
        isActive: true,
      },
    })
    return Response.json(user)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
