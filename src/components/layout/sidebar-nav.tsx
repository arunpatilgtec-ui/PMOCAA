'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { toast } from 'sonner'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  ClipboardList,
  GitBranch,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  BarChart3,
  FileText,
  AlertTriangle,
  SquareKanban,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles?: string[]
  badge?: number
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Requests', href: '/requests', icon: ClipboardList },
  { label: 'Kanban', href: '/kanban', icon: SquareKanban },
  { label: 'Gantt', href: '/gantt', icon: GitBranch },
  { label: 'Resources', href: '/resources', icon: Users },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare, roles: ['ADMIN', 'MANAGER', 'PLANNER'] },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Documents', href: '/documents', icon: FileText },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Users', href: '/users', icon: Settings, roles: ['ADMIN'] },
]

export function SidebarNav({ unreadCount = 0, pendingRequestsCount = 0 }: { unreadCount?: number; pendingRequestsCount?: number }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const filteredNav = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  async function handleLogout() {
    await logout()
    toast.success('Signed out successfully')
    router.push('/login')
  }

  const initials = user?.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b border-sidebar-border">
        <BarChart3 className="h-6 w-6 text-blue-500 shrink-0" />
        {!collapsed && (
          <span className="ml-2 font-semibold text-sidebar-foreground text-sm truncate">
            PMO Portal
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.label === 'Notifications' && unreadCount > 0 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                  {item.label === 'Requests' && pendingRequestsCount > 0 && (
                    <Badge className="text-xs px-1.5 py-0 h-5 bg-orange-500 hover:bg-orange-500">
                      {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                    </Badge>
                  )}
                  {item.label === 'Approvals' && pendingRequestsCount > 0 && (
                    <Badge className="text-xs px-1.5 py-0 h-5 bg-orange-500 hover:bg-orange-500">
                      {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
                    </Badge>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User area */}
      <div className="p-2 border-t border-sidebar-border">
        {user && (
          <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback className="text-xs bg-blue-600 text-white">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">{user.name}</p>
                <p className="text-xs text-sidebar-foreground/50 truncate capitalize">
                  {user.role.toLowerCase().replace('_', ' ')}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-red-400 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
