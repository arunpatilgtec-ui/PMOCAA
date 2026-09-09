import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = await req.json()
    const update: { code?: string; label?: string; order?: number } = {}
    if (typeof data.code === 'string' && data.code.trim()) update.code = data.code.trim()
    if (typeof data.label === 'string') update.label = data.label.trim()
    if (typeof data.order === 'number') update.order = data.order

    const modelType = await prisma.templateModelType.update({ where: { id }, data: update })
    return Response.json(modelType)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    if (msg.includes('Unique constraint')) return Response.json({ error: 'That code already exists for this category' }, { status: 409 })
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    await prisma.templateModelType.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
