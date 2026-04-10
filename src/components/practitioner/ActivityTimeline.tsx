// src/components/practitioner/ActivityTimeline.tsx
// Shows a chronological feed of all client activity for a period:
// uploads, reminders sent, status changes.

import { cn, formatFileSize } from '@/lib/utils'
import type { RequirementWithUploads, ReminderLog } from '@/types'
import {
  Upload, Send, CheckCircle, Clock, FileText,
} from 'lucide-react'

interface ActivityEvent {
  id: string
  type: 'upload' | 'reminder' | 'complete'
  timestamp: Date
  title: string
  detail: string
  icon: typeof Upload
  color: string
}

interface ActivityTimelineProps {
  requirements: RequirementWithUploads[]
  reminderLog: ReminderLog[]
  clientName: string
}

export function ActivityTimeline({ requirements, reminderLog, clientName }: ActivityTimelineProps) {
  // Build event list from uploads + reminders
  const events: ActivityEvent[] = []

  // Upload events
  for (const req of requirements) {
    for (const upload of req.uploads) {
      events.push({
        id: `upload-${upload.id}`,
        type: 'upload',
        timestamp: new Date(upload.uploaded_at),
        title: `${clientName} uploaded ${upload.filename_original}`,
        detail: `${req.label} · ${formatFileSize(upload.file_size_bytes)}`,
        icon: Upload,
        color: 'text-primary bg-primary/10',
      })
    }
  }

  // Reminder events
  for (const log of reminderLog) {
    events.push({
      id: `reminder-${log.id}`,
      type: 'reminder',
      timestamp: new Date(log.sent_at),
      title: `Reminder #${log.reminder_number} sent`,
      detail: log.triggered_by === 'auto' ? 'Sent automatically' : 'Sent manually',
      icon: Send,
      color: 'text-amber-600 bg-amber-50',
    })
  }

  // Check if all required docs complete — add a completion event
  const requiredReqs = requirements.filter(r => r.required)
  const allComplete = requiredReqs.length > 0 && requiredReqs.every(r => r.uploads.length > 0)
  if (allComplete) {
    const lastUploadTime = Math.max(
      ...requirements.flatMap(r => r.uploads).map(u => new Date(u.uploaded_at).getTime())
    )
    events.push({
      id: 'complete',
      type: 'complete',
      timestamp: new Date(lastUploadTime),
      title: 'All required documents received',
      detail: `${requiredReqs.length} documents complete — ready for review`,
      icon: CheckCircle,
      color: 'text-success bg-success/10',
    })
  }

  // Sort newest first
  events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

  if (events.length === 0) {
    return (
      <div className="mt-8">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Activity Timeline</h3>
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-400">
          <Clock className="h-5 w-5" />
          <span>No activity for this period yet</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Activity Timeline</h3>
      <div className="relative space-y-0">
        {/* Vertical line */}
        <div className="absolute left-[17px] top-2 bottom-2 w-px bg-gray-200" />

        {events.map((event, index) => (
          <div key={event.id} className="relative flex gap-3 pb-4">
            {/* Icon */}
            <div className={cn(
              'relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
              event.color,
            )}>
              <event.icon className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className={cn(
              'flex-1 rounded-lg border bg-white px-4 py-3',
              index === 0 ? 'border-primary/20' : 'border-gray-100',
            )}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-900">{event.title}</p>
                <time className="shrink-0 text-xs text-gray-400">
                  {formatRelativeTime(event.timestamp)}
                </time>
              </div>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                <FileText className="h-3 w-3" />
                {event.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
