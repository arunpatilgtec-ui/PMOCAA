import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id: categoryId } = await params
    const { code, label } = await req.json()
    if (!code || !code.trim()) return Response.json({ error: 'Code is required' }, { status: 400 })

    const count = await prisma.templateModelType.count({ where: { categoryId } })
    const modelType = await prisma.templateModelType.create({
      data: { categoryId, code: code.trim(), label: (label || code).trim(), order: count },
    })
    return Response.json(modelType, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    if (msg.includes('Unique constraint')) return Response.json({ error: 'That code already exists for this category' }, { status: 409 })
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
