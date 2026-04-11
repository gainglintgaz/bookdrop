// src/components/shared/MessagePanel.tsx
// Slide-out chat panel for bookkeeper <-> client messaging

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, Paperclip, CheckCheck, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchMessages, sendMessage, markAsRead } from '@/lib/messages'
import type { Message } from '@/types/messages'

interface MessagePanelProps {
  clientId: string
  clientName: string
  senderType: 'bookkeeper' | 'client'
  onClose: () => void
  className?: string
}

/** Format a date into relative human-readable text */
function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Format file size into human-readable string */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

export function MessagePanel({
  clientId,
  clientName,
  senderType,
  onClose,
  className,
}: MessagePanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const data = await fetchMessages(clientId)
      setMessages(data)
      // Mark messages from the other party as read
      await markAsRead(clientId, senderType)
    } catch {
      // Silently handle — messages will retry on next poll
    } finally {
      setLoading(false)
    }
  }, [clientId, senderType])

  // Initial load
  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Poll for new messages every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadMessages()
    }, 10_000)
    return () => clearInterval(interval)
  }, [loadMessages])

  const handleSend = useCallback(async () => {
    const trimmed = inputText.trim()
    if (!trimmed && attachedFiles.length === 0) return

    setSending(true)
    setSendError(null)
    try {
      const newMsg = await sendMessage(
        clientId,
        trimmed || '(file attachment)',
        senderType,
        attachedFiles.length > 0 ? attachedFiles : undefined,
      )
      setMessages(prev => [...prev, newMsg])
      setInputText('')
      setAttachedFiles([])
    } catch {
      setSendError('Failed to send — please try again')
    } finally {
      setSending(false)
    }
  }, [inputText, attachedFiles, clientId, senderType])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      setAttachedFiles(prev => [...prev, ...Array.from(files)])
    }
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }, [])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...Array.from(files)])
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div
      className={cn(
        'flex h-full w-96 flex-col border-l border-gray-200 bg-white shadow-xl',
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-gray-900">{clientName}</h3>
          <p className="text-xs text-gray-500">Message thread</p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Close message panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages area */}
      <div className="relative flex-1 overflow-y-auto px-4 py-3">
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-emerald-400 bg-emerald-50/80">
            <p className="text-sm font-medium text-emerald-700">Drop files to attach</p>
          </div>
        )}

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare className="mb-3 h-10 w-10 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">No messages yet</p>
            <p className="mt-1 text-xs text-gray-400">Start a conversation!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(msg => {
              const isOwn = msg.sender_type === senderType
              return (
                <div
                  key={msg.id}
                  className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-3 py-2',
                      isOwn
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-100 text-gray-900',
                    )}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {msg.attachments.map(att => (
                          <div
                            key={att.id}
                            className={cn(
                              'flex items-center gap-1.5 rounded px-2 py-1 text-xs',
                              isOwn ? 'bg-emerald-700/50' : 'bg-gray-200',
                            )}
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{att.filename}</span>
                            <span className="shrink-0 opacity-70">
                              {formatFileSize(att.file_size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Timestamp + read indicator */}
                    <div
                      className={cn(
                        'mt-1 flex items-center gap-1 text-[10px]',
                        isOwn ? 'justify-end text-emerald-200' : 'text-gray-400',
                      )}
                    >
                      <span>{formatRelativeTime(msg.created_at)}</span>
                      {isOwn && msg.read_at && (
                        <CheckCheck className="h-3 w-3" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Attachment chips */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 px-4 py-2">
          {attachedFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{file.name}</span>
              <span className="text-gray-400">{formatFileSize(file.size)}</span>
              <button
                onClick={() => removeAttachment(idx)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-gray-200"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-gray-200 px-3 py-2">
        <div className="flex items-end gap-2">
          {/* File attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Ctrl+Enter to send)"
            rows={1}
            className="max-h-24 min-h-[36px] flex-1 resize-none rounded-md border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={sending || (!inputText.trim() && attachedFiles.length === 0)}
            className={cn(
              'shrink-0 rounded-md p-2 transition-colors',
              sending || (!inputText.trim() && attachedFiles.length === 0)
                ? 'cursor-not-allowed text-gray-300'
                : 'text-emerald-600 hover:bg-emerald-50',
            )}
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {sendError ? (
          <p className="mt-1 text-center text-[10px] text-red-500">{sendError}</p>
        ) : (
          <p className="mt-1 text-center text-[10px] text-gray-300">Ctrl+Enter to send</p>
        )}
      </div>
    </div>
  )
}
