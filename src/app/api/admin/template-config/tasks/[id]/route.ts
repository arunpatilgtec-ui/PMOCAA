import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    const data = await req.json()
    const update: { name?: string; durationDays?: number; estimatedHours?: number; order?: number; parallelGroup?: string | null } = {}
    if (typeof data.name === 'string' && data.name.trim()) update.name = data.name.trim()
    if (typeof data.order === 'number') update.order = data.order
    if ('parallelGroup' in data) {
      update.parallelGroup = typeof data.parallelGroup === 'string' && data.parallelGroup.trim() ? data.parallelGroup.trim() : null
    }
    if (typeof data.durationDays === 'number' && data.durationDays > 0) {
      update.durationDays = data.durationDays
      // Keep estimated hours in sync with duration unless the caller
      // explicitly overrides hours in the same request.
      update.estimatedHours = typeof data.estimatedHours === 'number' ? data.estimatedHours : data.durationDays * 8
    } else if (typeof data.estimatedHours === 'number' && data.estimatedHours > 0) {
      update.estimatedHours = data.estimatedHours
    }

    const task = await prisma.templateTask.update({ where: { id }, data: update })
    return Response.json(task)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await params
    await prisma.templateTask.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
