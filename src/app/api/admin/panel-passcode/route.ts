import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, hashPassword } from '@/lib/auth'

const SINGLETON_ID = 'singleton'

// Whether a passphrase has been set yet -- never returns the hash itself.
export async function GET() {
  try {
    await requireAdmin()
    const row = await prisma.adminPasscode.findUnique({ where: { id: SINGLETON_ID } })
    return Response.json({ isSet: !!row?.passwordHash })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}

// Sets or changes the shared Admin-panel passphrase. No current-passphrase check --
// reaching this hidden control at all already requires being signed in as ADMIN.
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireAdmin()
    const { newPasscode } = await req.json()

    if (!newPasscode || String(newPasscode).length < 6) {
      return Response.json({ error: 'New passphrase must be at least 6 characters' }, { status: 400 })
    }

    const passwordHash = await hashPassword(newPasscode)
    await prisma.adminPasscode.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, passwordHash, updatedById: session.id },
      update: { passwordHash, updatedById: session.id },
    })
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : msg === 'Unauthorized' ? 401 : 400 })
  }
}
