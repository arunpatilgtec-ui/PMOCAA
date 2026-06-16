import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, verifyPassword, hashPassword } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    const { currentPassword, newPassword } = await req.json()

    if (!newPassword || newPassword.length < 6) {
      return Response.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.id } })
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 })

    const valid = await verifyPassword(currentPassword, user.password)
    if (!valid) return Response.json({ error: 'Current password is incorrect' }, { status: 400 })

    const hashed = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: session.id },
      data: { password: hashed, mustChangePassword: false },
    })

    return Response.json({ success: true })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized')
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
