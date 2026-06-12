'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { SidebarNav } from '@/components/layout/sidebar-nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const [unreadCount,           setUnreadCount]           = useState(0)
  const [pendingRequestsCount,  setPendingRequestsCount]  = useState(0)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          setUser(null)
          router.push('/login')
          return
        }
        const { user: u } = await res.json()
        setUser(u)
      } catch {
        router.push('/login')
      } finally {
        setChecking(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (!user) return
    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/notifications?unread=true')
        if (res.ok) {
          const data = await res.json()
          setUnreadCount(data.unreadCount || 0)
        }
      } catch {}
      if (['ADMIN', 'MANAGER', 'PLANNER'].includes(user.role)) {
        try {
          const res = await fetch('/api/requests?status=SUBMITTED')
          if (res.ok) {
            const data = await res.json()
            setPendingRequestsCount(Array.isArray(data) ? data.length : 0)
          }
        } catch {}
      }
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [user])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav unreadCount={unreadCount} pendingRequestsCount={pendingRequestsCount} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
