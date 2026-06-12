import { cookies } from 'next/headers'
import { deleteSession } from '@/lib/auth'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get('pmo_session')?.value
  if (token) {
    await deleteSession(token)
    cookieStore.delete('pmo_session')
  }
  return Response.json({ ok: true })
}
