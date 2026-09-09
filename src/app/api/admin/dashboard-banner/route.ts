import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const formData = await req.formData()
    const title = (formData.get('title') as string | null)?.trim()
    const file = formData.get('image') as File | null

    const existing = await prisma.dashboardBanner.findUnique({ where: { id: 'default' } })

    let imagePath = existing?.imagePath
    if (file && file.size > 0) {
      const ext = ALLOWED_TYPES[file.type]
      if (!ext) return Response.json({ error: 'Image must be PNG, JPEG, WEBP, or GIF' }, { status: 400 })
      if (file.size > MAX_SIZE) return Response.json({ error: 'Image must be under 10MB' }, { status: 400 })

      const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
      await mkdir(uploadsDir, { recursive: true })
      const filename = `dashboard-banner-${Date.now()}.${ext}`
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(path.join(uploadsDir, filename), buffer)
      imagePath = `/uploads/${filename}`
    }

    if (!imagePath) return Response.json({ error: 'An image is required' }, { status: 400 })

    const banner = await prisma.dashboardBanner.upsert({
      where: { id: 'default' },
      update: { title: title || existing?.title || 'Project Plan', imagePath },
      create: { id: 'default', title: title || 'Project Plan', imagePath },
    })
    return Response.json({ title: banner.title, imageUrl: banner.imagePath })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
