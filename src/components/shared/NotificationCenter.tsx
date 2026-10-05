import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  CheckCircle,
  Upload,
  Package,
  Mail,
  AlertTriangle,
  MessageSquare,
  Clock,
  DollarSign,
  AlertOctagon,
  Trophy,
  CheckCheck,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationType } from '@/lib/notifications'
import {
  fetchNotifications,
  markNotificationRead,
  markAllRead,
  getUnreadNotificationCount,
} from '@/lib/notifications'

// ─── ICON + COLOR MAP ───────────────────────────────────────────────────────

interface IconConfig {
  icon: typeof Bell
  colorClass: string
  dotClass: string
}

const ICON_MAP: Record<NotificationType, IconConfig> = {
  upload_complete: { icon: CheckCircle, colorClass: 'text-green-600', dotClass: 'bg-green-500' },
  upload_partial: { icon: Upload, colorClass: 'text-blue-600', dotClass: 'bg-blue-500' },
  package_ready: { icon: Package, colorClass: 'text-emerald-600', dotClass: 'bg-emerald-500' },
  reminder_sent: { icon: Mail, colorClass: 'text-amber-600', dotClass: 'bg-amber-500' },
  reminder_bounced: { icon: AlertTriangle, colorClass: 'text-red-600', dotClass: 'bg-red-500' },
  message_received: { icon: MessageSquare, colorClass: 'text-blue-600', dotClass: 'bg-blue-500' },
  deadline_approaching: { icon: Clock, colorClass: 'text-amber-600', dotClass: 'bg-amber-500' },
  payment_received: { icon: DollarSign, colorClass: 'text-green-600', dotClass: 'bg-green-500' },
  anomaly_detected: { icon: AlertOctagon, colorClass: 'text-red-600', dotClass: 'bg-red-500' },
  milestone: { icon: Trophy, colorClass: 'text-purple-600', dotClass: 'bg-purple-500' },
}

// ─── RELATIVE TIME ──────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`

  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── GROUP BY DATE ──────────────────────────────────────────────────────────

type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'Earlier'

function getDateGroup(iso: string): DateGroup {
  const now = new Date()
  const date = new Date(iso)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 6)

  if (date >= todayStart) return 'Today'
  if (date >= yesterdayStart) return 'Yesterday'
  if (date >= weekStart) return 'This Week'
  return 'Earlier'
}

function groupNotifications(
  items: AppNotification[],
): Array<{ label: DateGroup; notifications: AppNotification[] }> {
  const groups = new Map<DateGroup, AppNotification[]>()
  const order: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'Earlier']

  for (const item of items) {
    const group = getDateGroup(item.created_at)
    const list = groups.get(group)
    if (list) {
      list.push(item)
    } else {
      groups.set(group, [item])
    }
  }

  return order.filter(label => groups.has(label)).map(label => ({
    label,
    notifications: groups.get(label)!,
  }))
}

// ─── COMPONENT ──────────────────────────────────────────────────────────────

interface NotificationCenterProps {
  className?: string
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const refresh = useCallback(async () => {
    const [items, count] = await Promise.all([
      fetchNotifications(),
      getUnreadNotificationCount(),
    ])
    setNotifications(items)
    setUnreadCount(count)
  }, [])

  // Fetch on mount
  useEffect(() => {
    void refresh()
  }, [refresh])

  // Refresh when opening
  useEffect(() => {
    if (open) {
      void refresh()
    }
  }, [open, refresh])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClick)
    }
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleNotificationClick = useCallback(
    async (notification: AppNotification) => {
      if (!notification.read) {
        await markNotificationRead(notification.id)
        setNotifications(prev =>
          prev.map(n => (n.id === notification.id ? { ...n, read: true } : n)),
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
      if (notification.action_url) {
        navigate(notification.action_url)
        setOpen(false)
      }
    },
    [navigate],
  )

  const handleMarkAllRead = useCallback(async () => {
    await markAllRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [])

  const grouped = groupNotifications(notifications)

  return (
    <div ref={panelRef} className={cn('relative', className)}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-[28rem] overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Inbox className="h-8 w-8 text-gray-300" />
                <p className="text-sm font-medium text-gray-500">You're all caught up!</p>
                <p className="text-xs text-gray-400">No notifications in the last 30 days.</p>
              </div>
            ) : (
              grouped.map(group => (
                <div key={group.label}>
                  <div className="sticky top-0 bg-gray-50 px-4 py-1.5">
                    <span className="text-xs font-medium text-gray-500">{group.label}</span>
                  </div>
                  {group.notifications.map(notification => {
                    const config = ICON_MAP[notification.type]
                    const IconComponent = config.icon
                    return (
                      <button
                        key={notification.id}
                        onClick={() => void handleNotificationClick(notification)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50',
                          !notification.read && 'bg-emerald-50/40',
                        )}
                      >
                        <div
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100',
                            config.colorClass,
                          )}
                        >
                          <IconComponent className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                'truncate text-sm',
                                notification.read ? 'text-gray-700' : 'font-medium text-gray-900',
                              )}
                            >
                              {notification.title}
                            </p>
                            {!notification.read && (
                              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                            {notification.body}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-400">
                            {relativeTime(notification.created_at)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
