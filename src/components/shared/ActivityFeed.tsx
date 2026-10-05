import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppNotification, NotificationType } from '@/lib/notifications'
import { fetchNotifications } from '@/lib/notifications'

// ─── ICON + COLOR MAP ───────────────────────────────────────────────────────

interface FeedIconConfig {
  icon: typeof CheckCircle
  colorClass: string
  dotClass: string
}

const ICON_MAP: Record<NotificationType, FeedIconConfig> = {
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

// ─── COMPONENT ──────────────────────────────────────────────────────────────

interface ActivityFeedProps {
  maxItems?: number
  className?: string
}

export function ActivityFeed({ maxItems = 10, className }: ActivityFeedProps) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    const all = await fetchNotifications()
    setItems(all.slice(0, maxItems))
    setLoading(false)
  }, [maxItems])

  useEffect(() => {
    void load()
  }, [load])

  const handleClick = useCallback(
    (notification: AppNotification) => {
      if (notification.action_url) {
        navigate(notification.action_url)
      }
    },
    [navigate],
  )

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 bg-white p-6', className)}>
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Recent Activity</h3>
        <div className="space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-gray-200" />
                <div className="h-2.5 w-1/2 rounded bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-6', className)}>
      <h3 className="mb-4 text-sm font-semibold text-gray-900">Recent Activity</h3>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          No recent activity to show.
        </p>
      ) : (
        <div className="relative">
          {items.map((notification, index) => {
            const config = ICON_MAP[notification.type]
            const IconComponent = config.icon
            const isLast = index === items.length - 1

            return (
              <div key={notification.id} className="relative flex gap-3 pb-4 last:pb-0">
                {/* Timeline line */}
                {!isLast && (
                  <div className="absolute left-4 top-8 h-full w-px -translate-x-1/2 bg-gray-200" />
                )}

                {/* Timeline dot + icon */}
                <div
                  className={cn(
                    'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 ring-2 ring-white',
                    config.colorClass,
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                </div>

                {/* Content */}
                <button
                  onClick={() => handleClick(notification)}
                  disabled={!notification.action_url}
                  className={cn(
                    'min-w-0 flex-1 text-left',
                    notification.action_url && 'cursor-pointer rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-gray-50 transition-colors',
                  )}
                >
                  <p className="text-sm text-gray-800">
                    {notification.title}
                    {notification.client_name && (
                      <span className="font-medium text-gray-900">
                        {' '}&mdash; {notification.client_name}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{notification.body}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {relativeTime(notification.created_at)}
                  </p>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
