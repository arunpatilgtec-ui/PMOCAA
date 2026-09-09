import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = await req.json()
    const update: { name?: string; order?: number; modelTypeId?: string | null } = {}
    if (typeof data.name === 'string' && data.name.trim()) update.name = data.name.trim()
    if (typeof data.order === 'number') update.order = data.order
    if ('modelTypeId' in data) update.modelTypeId = data.modelTypeId || null

    const workstream = await prisma.templateWorkstream.update({ where: { id }, data: update })
    return Response.json(workstream)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    await prisma.templateWorkstream.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
