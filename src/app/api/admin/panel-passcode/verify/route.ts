import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin, verifyPassword } from '@/lib/auth'

const SINGLETON_ID = 'singleton'

// Gate for the Workload Admin page -- checked fresh on every visit (no session
// flag is stored), per how this tool is meant to be used: a deliberate second
// step, not a one-time unlock. This does not gate the underlying /api/users or
// /api/tasks endpoints those pages call -- those stay reachable by any ADMIN
// session as they already were, since other legitimate admin pages depend on them.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const { passcode } = await req.json()

    const row = await prisma.adminPasscode.findUnique({ where: { id: SINGLETON_ID } })
    if (!row?.passwordHash) {
      return Response.json({ error: 'No passphrase has been set up yet' }, { status: 409 })
    }
    const ok = !!passcode && (await verifyPassword(passcode, row.passwordHash))
    if (!ok) return Response.json({ error: 'Incorrect passphrase' }, { status: 403 })
    return Response.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    return Response.json({ error: msg }, { status: msg === 'Forbidden' ? 403 : 401 })
  }
}
