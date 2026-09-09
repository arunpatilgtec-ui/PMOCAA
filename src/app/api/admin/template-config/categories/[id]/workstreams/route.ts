import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id: categoryId } = await params
    const { name, modelTypeId } = await req.json()
    if (!name || !name.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })

    const count = await prisma.templateWorkstream.count({ where: { categoryId } })
    const workstream = await prisma.templateWorkstream.create({
      data: { categoryId, name: name.trim(), order: count, modelTypeId: modelTypeId || null },
      include: { tasks: true },
    })
    return Response.json(workstream, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
