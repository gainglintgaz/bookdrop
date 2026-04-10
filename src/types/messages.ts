// src/types/messages.ts
// Types for the in-app messaging / communication system

export interface MessageAttachment {
  id: string
  filename: string
  file_size: number
  storage_path: string
  mime_type: string
}

export interface Message {
  id: string
  client_id: string
  bookkeeper_id: string
  sender_type: 'bookkeeper' | 'client'
  content: string
  attachments?: MessageAttachment[]
  read_at: string | null
  created_at: string
}

export interface MessageThread {
  client_id: string
  business_name: string
  contact_name: string
  last_message: Message | null
  unread_count: number
}
