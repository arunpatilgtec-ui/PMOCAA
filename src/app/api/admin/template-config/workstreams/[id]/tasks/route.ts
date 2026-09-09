import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id: workstreamId } = await params
    const { name, durationDays, parallelGroup } = await req.json()
    if (!name || !name.trim()) return Response.json({ error: 'Name is required' }, { status: 400 })
    const days = typeof durationDays === 'number' && durationDays > 0 ? durationDays : 1

    const count = await prisma.templateTask.count({ where: { workstreamId } })
    const task = await prisma.templateTask.create({
      data: {
        workstreamId,
        name: name.trim(),
        durationDays: days,
        estimatedHours: days * 8,
        order: count,
        parallelGroup: typeof parallelGroup === 'string' && parallelGroup.trim() ? parallelGroup.trim() : null,
      },
    })
    return Response.json(task, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
