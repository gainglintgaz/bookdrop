// src/lib/notifications.ts
// Notification service — demo mode uses in-memory store, cloud mode uses Supabase.

import { isDemoMode } from '@/lib/mode'
import { supabase } from '@/lib/supabase'

export type NotificationType =
  | 'upload_complete'
  | 'upload_partial'
  | 'package_ready'
  | 'reminder_sent'
  | 'reminder_bounced'
  | 'message_received'
  | 'deadline_approaching'
  | 'payment_received'
  | 'anomaly_detected'
  | 'milestone'

export interface AppNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  client_id?: string
  client_name?: string
  read: boolean
  action_url?: string
  created_at: string
  metadata?: Record<string, unknown>
}

// ─── DEMO DATA ──────────────────────────────────────────────────────────────

function daysAgo(days: number, hours = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(hours, 0, 0, 0)
  return d.toISOString()
}

function buildDemoNotifications(): AppNotification[] {
  return [
    {
      id: crypto.randomUUID(),
      type: 'upload_complete',
      title: 'All documents received',
      body: 'Riverside Cafe uploaded all 4 documents for April.',
      client_id: 'client-001',
      client_name: 'Riverside Cafe',
      read: false,
      action_url: '/clients/client-001',
      created_at: daysAgo(0, 14),
    },
    {
      id: crypto.randomUUID(),
      type: 'package_ready',
      title: 'April package ready',
      body: 'April package for Riverside Cafe is ready for review.',
      client_id: 'client-001',
      client_name: 'Riverside Cafe',
      read: false,
      action_url: '/clients/client-001',
      created_at: daysAgo(0, 10),
    },
    {
      id: crypto.randomUUID(),
      type: 'upload_partial',
      title: 'Partial upload received',
      body: 'Peak Fitness Studio uploaded 1 of 2 required documents.',
      client_id: 'client-002',
      client_name: 'Peak Fitness Studio',
      read: false,
      action_url: '/clients/client-002',
      created_at: daysAgo(1, 11),
    },
    {
      id: crypto.randomUUID(),
      type: 'reminder_sent',
      title: 'Reminder sent',
      body: 'Second reminder sent to David Chen at Peak Fitness Studio.',
      client_id: 'client-002',
      client_name: 'Peak Fitness Studio',
      read: true,
      action_url: '/clients/client-002',
      created_at: daysAgo(2, 9),
    },
    {
      id: crypto.randomUUID(),
      type: 'message_received',
      title: 'New message',
      body: 'New message from Maria Rodriguez at Riverside Cafe.',
      client_id: 'client-001',
      client_name: 'Riverside Cafe',
      read: false,
      action_url: '/clients/client-001',
      created_at: daysAgo(2, 16),
    },
    {
      id: crypto.randomUUID(),
      type: 'deadline_approaching',
      title: 'Deadline approaching',
      body: "3 clients haven't submitted documents for April yet.",
      read: false,
      action_url: '/clients',
      created_at: daysAgo(3, 8),
    },
    {
      id: crypto.randomUUID(),
      type: 'anomaly_detected',
      title: 'Unusual transaction',
      body: 'Unusual transaction detected: $4,200 at Best Buy for TechBridge Solutions.',
      client_id: 'client-004',
      client_name: 'TechBridge Solutions',
      read: true,
      action_url: '/clients/client-004',
      created_at: daysAgo(4, 13),
    },
    {
      id: crypto.randomUUID(),
      type: 'milestone',
      title: 'Milestone reached!',
      body: "You've processed 50 bank statements this year!",
      read: true,
      created_at: daysAgo(5, 10),
    },
    {
      id: crypto.randomUUID(),
      type: 'payment_received',
      title: 'Payment received',
      body: 'Your Starter plan payment of $39.00 was processed successfully.',
      read: true,
      created_at: daysAgo(6, 7),
    },
    {
      id: crypto.randomUUID(),
      type: 'reminder_sent',
      title: 'Reminder sent',
      body: 'First reminder sent to Alex Kim at TechBridge Solutions.',
      client_id: 'client-004',
      client_name: 'TechBridge Solutions',
      read: true,
      action_url: '/clients/client-004',
      created_at: daysAgo(6, 9),
    },
  ]
}

// ─── IN-MEMORY STORE (demo mode) ───────────────────────────────────────────

let demoStore: AppNotification[] | null = null

function getDemoStore(): AppNotification[] {
  if (!demoStore) {
    demoStore = buildDemoNotifications()
  }
  return demoStore
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

export async function fetchNotifications(): Promise<AppNotification[]> {
  if (isDemoMode) {
    return [...getDemoStore()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
  }

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch notifications:', error)
    return []
  }

  return (data ?? []) as AppNotification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  if (isDemoMode) {
    const store = getDemoStore()
    const item = store.find(n => n.id === id)
    if (item) item.read = true
    return
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', id)

  if (error) {
    console.error('Failed to mark notification read:', error)
  }
}

export async function markAllRead(): Promise<void> {
  if (isDemoMode) {
    for (const n of getDemoStore()) {
      n.read = true
    }
    return
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false)

  if (error) {
    console.error('Failed to mark all notifications read:', error)
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  if (isDemoMode) {
    return getDemoStore().filter(n => !n.read).length
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('read', false)

  if (error) {
    console.error('Failed to get unread count:', error)
    return 0
  }

  return count ?? 0
}

interface CreateNotificationOpts {
  title: string
  body: string
  clientId?: string
  clientName?: string
  actionUrl?: string
  metadata?: Record<string, unknown>
}

export async function createNotification(
  type: NotificationType,
  opts: CreateNotificationOpts,
): Promise<AppNotification> {
  const notification: AppNotification = {
    id: crypto.randomUUID(),
    type,
    title: opts.title,
    body: opts.body,
    client_id: opts.clientId,
    client_name: opts.clientName,
    read: false,
    action_url: opts.actionUrl,
    created_at: new Date().toISOString(),
    metadata: opts.metadata,
  }

  if (isDemoMode) {
    getDemoStore().unshift(notification)
    return notification
  }

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      client_id: notification.client_id,
      client_name: notification.client_name,
      read: notification.read,
      action_url: notification.action_url,
      created_at: notification.created_at,
      metadata: notification.metadata,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create notification:', error)
    return notification
  }

  return (data as AppNotification) ?? notification
}
