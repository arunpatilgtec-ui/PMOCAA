import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/admin/utilization-overrides/[id]'>) {
  try {
    await requireAdmin()
    const { id } = await ctx.params
    await prisma.utilizationOverride.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}
