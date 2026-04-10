// src/lib/messages.ts
// Message service — demo mode uses in-memory Map, cloud mode uses Supabase.

import { isDemoMode } from '@/lib/mode'
import { supabase } from '@/lib/supabase'
import type { Message, MessageThread } from '@/types/messages'

// ─── DEMO DATA ─────────────────────────────────────────────────────────────

/** In-memory message store for demo mode — persists during session */
const demoMessages: Map<string, Message[]> = new Map()

/** Whether demo data has been seeded yet */
let demoSeeded = false

function daysAgo(days: number, hoursOffset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(d.getHours() - hoursOffset)
  return d.toISOString()
}

function seedDemoMessages(): void {
  if (demoSeeded) return
  demoSeeded = true

  const threads: Array<{
    clientId: string
    msgs: Array<{ sender: 'bookkeeper' | 'client'; content: string; daysAgo: number; hoursOffset: number; readAt: string | null }>
  }> = [
    {
      clientId: 'client-001',
      msgs: [
        { sender: 'client', content: 'Do you need my PayPal statements too?', daysAgo: 6, hoursOffset: 3, readAt: daysAgo(6, 1) },
        { sender: 'bookkeeper', content: 'Yes, please upload those as well. Any PayPal activity counts as a business transaction.', daysAgo: 6, hoursOffset: 1, readAt: daysAgo(5, 10) },
        { sender: 'client', content: 'Got it! I uploaded the PayPal CSV under "Other" for now. Let me know if you need it in a different format.', daysAgo: 5, hoursOffset: 8, readAt: daysAgo(5, 5) },
        { sender: 'bookkeeper', content: 'Perfect, CSV works great. Thanks for being so on top of this!', daysAgo: 5, hoursOffset: 5, readAt: daysAgo(5, 2) },
      ],
    },
    {
      clientId: 'client-002',
      msgs: [
        { sender: 'client', content: 'I found an old receipt for the office printer, should I upload it?', daysAgo: 3, hoursOffset: 6, readAt: daysAgo(3, 4) },
        { sender: 'bookkeeper', content: "Yes! That's a great deduction. Upload it under Office Equipment.", daysAgo: 3, hoursOffset: 4, readAt: daysAgo(3, 1) },
        { sender: 'client', content: 'Done! It was $489 from Best Buy back in February.', daysAgo: 2, hoursOffset: 9, readAt: null },
      ],
    },
    {
      clientId: 'client-003',
      msgs: [
        { sender: 'bookkeeper', content: 'Reminder: I still need your Capital One statement for this month. Can you upload it by Friday?', daysAgo: 1, hoursOffset: 5, readAt: null },
      ],
    },
    {
      clientId: 'client-004',
      msgs: [
        { sender: 'client', content: 'My ADP login is locked — can I send you the payroll PDF by email instead?', daysAgo: 4, hoursOffset: 2, readAt: daysAgo(4, 1) },
        { sender: 'bookkeeper', content: 'Sure, email it to me and I\'ll upload it on your behalf. Also try calling ADP support at 800-225-5237 to unlock it.', daysAgo: 4, hoursOffset: 0, readAt: daysAgo(3, 10) },
        { sender: 'client', content: 'Thanks Jane! I emailed the PDF. ADP said they\'ll unlock my account within 24 hours.', daysAgo: 3, hoursOffset: 2, readAt: daysAgo(3, 0) },
      ],
    },
  ]

  for (const thread of threads) {
    const messages: Message[] = thread.msgs.map((m, i) => ({
      id: crypto.randomUUID(),
      client_id: thread.clientId,
      bookkeeper_id: 'bk-demo-001',
      sender_type: m.sender,
      content: m.content,
      read_at: m.readAt,
      created_at: daysAgo(m.daysAgo, m.hoursOffset),
      attachments: i === 0 ? undefined : undefined, // keep clean, no attachments in seed
    }))
    demoMessages.set(thread.clientId, messages)
  }
}

// Demo client lookup for thread metadata
const demoClientInfo: Record<string, { business_name: string; contact_name: string }> = {
  'client-001': { business_name: 'Riverside Cafe', contact_name: 'Maria Rodriguez' },
  'client-002': { business_name: 'Peak Fitness Studio', contact_name: 'David Chen' },
  'client-003': { business_name: 'Greenleaf Landscaping', contact_name: 'Sarah Johnson' },
  'client-004': { business_name: 'TechBridge Solutions', contact_name: 'Alex Kim' },
  'client-005': { business_name: 'Bella Hair Salon', contact_name: 'Jessica Park' },
}

// ─── DEMO IMPLEMENTATIONS ──────────────────────────────────────────────────

function demoFetchMessages(clientId: string): Message[] {
  seedDemoMessages()
  return demoMessages.get(clientId) ?? []
}

function demoSendMessage(
  clientId: string,
  content: string,
  senderType: 'bookkeeper' | 'client',
): Message {
  seedDemoMessages()
  const msg: Message = {
    id: crypto.randomUUID(),
    client_id: clientId,
    bookkeeper_id: 'bk-demo-001',
    sender_type: senderType,
    content,
    read_at: null,
    created_at: new Date().toISOString(),
  }
  const existing = demoMessages.get(clientId) ?? []
  existing.push(msg)
  demoMessages.set(clientId, existing)
  return msg
}

function demoMarkAsRead(clientId: string, senderType: 'bookkeeper' | 'client'): void {
  seedDemoMessages()
  const msgs = demoMessages.get(clientId)
  if (!msgs) return
  const otherSender = senderType === 'bookkeeper' ? 'client' : 'bookkeeper'
  const now = new Date().toISOString()
  for (const msg of msgs) {
    if (msg.sender_type === otherSender && msg.read_at === null) {
      msg.read_at = now
    }
  }
}

function demoFetchThreads(): MessageThread[] {
  seedDemoMessages()
  const threads: MessageThread[] = []
  for (const [clientId, messages] of demoMessages.entries()) {
    const info = demoClientInfo[clientId]
    if (!info) continue
    const sorted = [...messages].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    const unreadCount = messages.filter(
      m => m.sender_type === 'client' && m.read_at === null,
    ).length
    threads.push({
      client_id: clientId,
      business_name: info.business_name,
      contact_name: info.contact_name,
      last_message: sorted[0] ?? null,
      unread_count: unreadCount,
    })
  }
  // Sort by most recent message first
  threads.sort((a, b) => {
    const aTime = a.last_message ? new Date(a.last_message.created_at).getTime() : 0
    const bTime = b.last_message ? new Date(b.last_message.created_at).getTime() : 0
    return bTime - aTime
  })
  return threads
}

function demoGetUnreadCount(): number {
  seedDemoMessages()
  let total = 0
  for (const messages of demoMessages.values()) {
    total += messages.filter(m => m.sender_type === 'client' && m.read_at === null).length
  }
  return total
}

// ─── CLOUD (SUPABASE) IMPLEMENTATIONS ──────────────────────────────────────

async function cloudFetchMessages(clientId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Message[]
}

async function cloudSendMessage(
  clientId: string,
  content: string,
  senderType: 'bookkeeper' | 'client',
  attachments?: File[],
): Promise<Message> {
  // Get bookkeeper ID from the current user session
  const { data: sessionData } = await supabase.auth.getSession()
  const bookkeeperIdValue = sessionData?.session?.user?.id ?? ''

  // Upload attachments to storage if present
  const attachmentRecords: Array<{
    filename: string
    file_size: number
    storage_path: string
    mime_type: string
  }> = []

  if (attachments && attachments.length > 0) {
    for (const file of attachments) {
      const storagePath = `${bookkeeperIdValue}/messages/${clientId}/${crypto.randomUUID()}/${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file)

      if (uploadError) throw new Error(uploadError.message)

      attachmentRecords.push({
        filename: file.name,
        file_size: file.size,
        storage_path: storagePath,
        mime_type: file.type || 'application/octet-stream',
      })
    }
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      client_id: clientId,
      bookkeeper_id: bookkeeperIdValue,
      sender_type: senderType,
      content,
      attachments: attachmentRecords.length > 0 ? attachmentRecords : null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as Message
}

async function cloudMarkAsRead(
  clientId: string,
  senderType: 'bookkeeper' | 'client',
): Promise<void> {
  const otherSender = senderType === 'bookkeeper' ? 'client' : 'bookkeeper'
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('sender_type', otherSender)
    .is('read_at', null)

  if (error) throw new Error(error.message)
}

async function cloudFetchThreads(bookkeeperIdParam: string): Promise<MessageThread[]> {
  // Fetch all messages for this bookkeeper, joined with client info
  const { data, error } = await supabase
    .from('messages')
    .select('*, clients!inner(business_name, contact_name)')
    .eq('bookkeeper_id', bookkeeperIdParam)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Array<
    Message & { clients: { business_name: string; contact_name: string } }
  >

  // Group by client_id
  const threadMap = new Map<string, MessageThread>()
  for (const row of rows) {
    const existing = threadMap.get(row.client_id)
    if (!existing) {
      threadMap.set(row.client_id, {
        client_id: row.client_id,
        business_name: row.clients.business_name,
        contact_name: row.clients.contact_name ?? '',
        last_message: row,
        unread_count: row.sender_type === 'client' && row.read_at === null ? 1 : 0,
      })
    } else {
      if (row.sender_type === 'client' && row.read_at === null) {
        existing.unread_count += 1
      }
    }
  }

  return Array.from(threadMap.values())
}

async function cloudGetUnreadCount(bookkeeperIdParam: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('bookkeeper_id', bookkeeperIdParam)
    .eq('sender_type', 'client')
    .is('read_at', null)

  if (error) throw new Error(error.message)
  return count ?? 0
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

export async function fetchMessages(clientId: string): Promise<Message[]> {
  if (isDemoMode) return demoFetchMessages(clientId)
  return cloudFetchMessages(clientId)
}

export async function sendMessage(
  clientId: string,
  content: string,
  senderType: 'bookkeeper' | 'client',
  attachments?: File[],
): Promise<Message> {
  if (isDemoMode) return demoSendMessage(clientId, content, senderType)
  return cloudSendMessage(clientId, content, senderType, attachments)
}

export async function markAsRead(
  clientId: string,
  senderType: 'bookkeeper' | 'client',
): Promise<void> {
  if (isDemoMode) {
    demoMarkAsRead(clientId, senderType)
    return
  }
  return cloudMarkAsRead(clientId, senderType)
}

export async function fetchThreads(bookkeeperIdParam: string): Promise<MessageThread[]> {
  if (isDemoMode) return demoFetchThreads()
  return cloudFetchThreads(bookkeeperIdParam)
}

export async function getUnreadCount(bookkeeperIdParam: string): Promise<number> {
  if (isDemoMode) return demoGetUnreadCount()
  return cloudGetUnreadCount(bookkeeperIdParam)
}
