import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    await requireAuth()
    const banner = await prisma.dashboardBanner.findUnique({ where: { id: 'default' } })
    if (!banner) return Response.json(null)
    return Response.json({ title: banner.title, imageUrl: banner.imagePath })
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
