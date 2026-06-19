'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { SidebarNav } from '@/components/layout/sidebar-nav'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { BarChart3, Menu } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user, setUser } = useAuthStore()
  const [unreadCount,          setUnreadCount]          = useState(0)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [checking,    setChecking]    = useState(true)
  const [mobileOpen,  setMobileOpen]  = useState(false)

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
        <div className="flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 opacity-30 blur animate-pulse" />
          </div>
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading PMO Portal…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav
        unreadCount={unreadCount}
        pendingRequestsCount={pendingRequestsCount}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main content column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center h-14 px-4 border-b border-border bg-sidebar shrink-0 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <BarChart3 className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sidebar-foreground text-sm tracking-tight">PMO Portal</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        {/* Password-reset alert */}
        {user?.mustChangePassword && (
          <div className="shrink-0 bg-orange-50 dark:bg-orange-950 border-b border-orange-200 dark:border-orange-800 px-4 py-2 flex items-center gap-3 text-sm text-orange-700 dark:text-orange-300">
            <span className="font-medium">Action required:</span>
            <span>Your password has been reset by an administrator.</span>
            <Link
              href="/settings"
              className="ml-auto underline underline-offset-2 font-medium hover:text-orange-900 dark:hover:text-orange-100 shrink-0"
            >
              Set a new password →
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
