import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET() {
  try {
    await requireAdmin()
    const costingTypes = await prisma.templateCostingType.findMany({ orderBy: { order: 'asc' } })
    return Response.json(costingTypes)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { code, label } = await req.json()
    if (!code || !code.trim()) return Response.json({ error: 'Code is required' }, { status: 400 })

    const count = await prisma.templateCostingType.count()
    const costingType = await prisma.templateCostingType.create({
      data: { code: code.trim().toUpperCase(), label: (label || code).trim(), order: count },
    })
    return Response.json(costingType, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    if (msg.includes('Unique constraint')) return Response.json({ error: 'That code already exists' }, { status: 409 })
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
