'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import Link from 'next/link'

interface Notification {
  id: string; type: string; title: string; message: string; isRead: boolean
  createdAt: string; actionUrl?: string
  sender?: { id: string; name: string }
  project?: { id: string; name: string }
  task?: { id: string; name: string }
}

const TYPE_COLORS: Record<string, string> = {
  TASK_ASSIGNED: 'bg-blue-100 text-blue-700',
  TASK_UPDATED: 'bg-slate-100 text-slate-700',
  SCHEDULE_CHANGE_PROPOSED: 'bg-yellow-100 text-yellow-700',
  APPROVAL_REQUIRED: 'bg-orange-100 text-orange-700',
  APPROVAL_COMPLETED: 'bg-green-100 text-green-700',
  PROJECT_DELAYED: 'bg-red-100 text-red-700',
  MILESTONE_UPCOMING: 'bg-purple-100 text-purple-700',
  RESOURCE_OVERLOADED: 'bg-red-100 text-red-700',
}

const TYPE_LABELS: Record<string, string> = {
  TASK_ASSIGNED: 'Task Assigned', TASK_UPDATED: 'Task Updated',
  SCHEDULE_CHANGE_PROPOSED: 'Schedule Change', APPROVAL_REQUIRED: 'Approval Required',
  APPROVAL_COMPLETED: 'Approval Done', PROJECT_DELAYED: 'Project Delayed',
  MILESTONE_UPCOMING: 'Milestone', RESOURCE_OVERLOADED: 'Overload Alert',
}

export default function NotificationsPage() {
  const { user } = useAuthStore()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function markAllRead() {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markAll: true }),
    })
    toast.success('All marked as read')
    load()
  }

  async function markRead(id: string) {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const RESOURCE_TYPES = ['TASK_ASSIGNED', 'APPROVAL_COMPLETED']
  const displayed = user?.role === 'RESOURCE'
    ? notifications.filter((n) => RESOURCE_TYPES.includes(n.type))
    : notifications
  const displayedUnread = displayed.filter((n) => !n.isRead).length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Notifications
            {displayedUnread > 0 && (
              <Badge variant="destructive" className="text-xs">{displayedUnread}</Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">{displayed.length} total</p>
        </div>
        {displayedUnread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {user?.role === 'RESOURCE' && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          Showing project assignments and approved requests only.
        </p>
      )}

      {loading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <BellOff className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No notifications</p>
          {user?.role === 'RESOURCE' && (
            <p className="text-xs text-muted-foreground mt-1 text-center max-w-xs">
              You will be notified here when a request is approved or when you are added to a project.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((n) => (
            <Card
              key={n.id}
              className={`transition-colors ${!n.isRead ? 'border-primary/30 bg-primary/5' : ''}`}
            >
              <CardContent className="p-3 flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <Bell className={`h-4 w-4 ${!n.isRead ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{n.title}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[n.type] || 'bg-slate-100 text-slate-700'}`}>
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                    {!n.isRead && <div className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{format(new Date(n.createdAt), 'MMM d, yyyy HH:mm')}</span>
                    {n.sender && <span>from {n.sender.name}</span>}
                    {n.project && <span>{n.project.name}</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {n.actionUrl && (
                    <Link href={n.actionUrl}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs">View</Button>
                    </Link>
                  )}
                  {!n.isRead && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markRead(n.id)}>
                      Read
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
