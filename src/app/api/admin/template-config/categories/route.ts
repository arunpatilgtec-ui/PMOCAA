import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  try {
    await requireAdmin()
    const categories = await prisma.templateCategory.findMany({
      orderBy: { order: 'asc' },
      include: {
        modelTypes: { orderBy: { order: 'asc' } },
        workstreams: { orderBy: { order: 'asc' }, include: { tasks: { orderBy: { order: 'asc' } } } },
      },
    })
    return Response.json(categories)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { name } = await req.json()
    if (!name || !name.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })

    const count = await prisma.templateCategory.count()
    const category = await prisma.templateCategory.create({
      data: { name: name.trim(), order: count },
    })
    return Response.json(category, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    if (msg.includes('Unique constraint')) return Response.json({ error: 'A category with that name already exists' }, { status: 409 })
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
