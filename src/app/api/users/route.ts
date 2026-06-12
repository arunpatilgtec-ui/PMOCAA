import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, hashPassword } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const users = await prisma.user.findMany({
      where: { isActive: true },
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
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    })
    return Response.json(users)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()
    if (session.role !== 'ADMIN') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const data = await req.json()
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
    if (existing) {
      return Response.json({ error: 'Email already in use' }, { status: 409 })
    }

    const hashed = await hashPassword(data.password)
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        password: hashed,
        role: data.role || 'RESOURCE',
        capacityPct: data.capacityPct || 100,
        department: data.department,
        title: data.title,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        capacityPct: true,
        department: true,
        title: true,
      },
    })
    return Response.json(user, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
