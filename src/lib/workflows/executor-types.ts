// src/lib/workflows/executor-types.ts
//
// Shared types for workflow executors. An executor takes a WorkflowContext
// (the real data a workflow operates on) and returns a WorkflowResult
// (a short summary + an optional downloadable artifact).
//
// Honesty rule (ai-first-principles.md §5): executors only emit claims that
// trace to the data in the context. No fabricated numbers, no advice.

import type { Client, RequirementWithUploads, ReminderLog } from '@/types'

export interface WorkflowContext {
  client: Client
  requirements: RequirementWithUploads[]
  period: { year: number; month: number }
  /** Optional — present when the page has loaded reminder history. */
  recentReminders?: ReminderLog[]
}

export interface WorkflowArtifact {
  filename: string
  mimeType: string
  /** UTF-8 string content (HTML, CSV, etc.). */
  content: string
}

export interface WorkflowResult {
  workflowId: string
  ok: boolean
  /** One-line human summary, shown in a toast/banner. */
  summary: string
  artifact?: WorkflowArtifact
  error?: string
}

/** Trigger a browser download for a workflow artifact. No-op server-side. */
export function downloadArtifact(artifact: WorkflowArtifact): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([artifact.content], { type: artifact.mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = artifact.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
