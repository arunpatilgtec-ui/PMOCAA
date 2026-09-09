import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    if (!userId) return Response.json({ error: 'userId is required' }, { status: 400 })

    const overrides = await prisma.utilizationOverride.findMany({
      where: { userId },
      orderBy: { fromDate: 'desc' },
    })
    return Response.json(overrides)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { userId, fromDate, toDate, pct } = await req.json()

    if (!userId || !fromDate || !toDate || pct === undefined || pct === null) {
      return Response.json({ error: 'userId, fromDate, toDate, and pct are required' }, { status: 400 })
    }
    const from = new Date(fromDate)
    const to = new Date(toDate)
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
      return Response.json({ error: 'Invalid date range' }, { status: 400 })
    }
    const pctNum = Number(pct)
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 200) {
      return Response.json({ error: 'pct must be between 0 and 200' }, { status: 400 })
    }

    const override = await prisma.utilizationOverride.create({
      data: { userId, fromDate: from, toDate: to, pct: pctNum },
    })
    return Response.json(override, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
