// src/lib/workflows/executors/client-meeting-qa.ts
//
// First LIVE workflow executor. Generates a 1-page meeting-prep brief for a
// client from data already on the page — submission status, missing docs,
// reminder cadence. Bookkeeper walks into the meeting prepared.
//
// Honesty: every line traces to the context. Topics are DERIVED from the
// data (missing docs → "ask about X"), never invented. No advice, no
// fabricated metrics (LEGAL_GUARDRAILS.md + ai-first-principles.md §5).

import { computeSubmissionStatus, getMissingDocuments } from '@/types'
import { formatPeriod } from '@/lib/utils'
import type { WorkflowContext, WorkflowResult } from '../executor-types'

interface QATopic {
  question: string
  /** Why this surfaced — the data that generated it. */
  basis: string
  priority: 'high' | 'medium' | 'low'
}

/** Derive meeting talking points from real client data. No fabrication. */
function deriveTopics(ctx: WorkflowContext): QATopic[] {
  const topics: QATopic[] = []
  const missing = getMissingDocuments(ctx.requirements)
  const status = computeSubmissionStatus(ctx.requirements)
  const periodLabel = formatPeriod(ctx.period.year, ctx.period.month)

  // 1. Missing documents — highest priority, directly actionable
  if (missing.length > 0) {
    topics.push({
      question: `Can you send the ${missing.length} outstanding document${missing.length === 1 ? '' : 's'} for ${periodLabel}? (${missing.join(', ')})`,
      basis: `${missing.length} required document(s) not yet received for this period.`,
      priority: 'high',
    })
  }

  // 2. Completion confirmation when everything is in
  if (status === 'complete') {
    topics.push({
      question: `Everything for ${periodLabel} is in — anything unusual this period I should know about before I close?`,
      basis: 'All required documents received; good moment to confirm context.',
      priority: 'medium',
    })
  }

  // 3. Reminder cadence — if we've had to nudge repeatedly, raise it
  const reminders = ctx.recentReminders ?? []
  const thisPeriodReminders = reminders.filter(
    r => r.period_year === ctx.period.year && r.period_month === ctx.period.month,
  )
  if (thisPeriodReminders.length >= 2) {
    topics.push({
      question: `We've sent ${thisPeriodReminders.length} reminders for ${periodLabel} — would a different submission schedule or format work better for you?`,
      basis: `${thisPeriodReminders.length} reminders logged this period — a cadence mismatch signal.`,
      priority: 'medium',
    })
  }

  // 4. Notes the bookkeeper left for the client (surface them as a prompt)
  if (ctx.client.notes_for_client && ctx.client.notes_for_client.trim().length > 0) {
    topics.push({
      question: `Follow up on the note shared with you: "${ctx.client.notes_for_client.trim()}"`,
      basis: 'A client-facing note exists on this client record.',
      priority: 'low',
    })
  }

  // 5. Always-useful closing question
  topics.push({
    question: 'Any changes coming up — new accounts, large purchases, staffing, or anything that affects the books?',
    basis: 'Standard forward-looking prompt; not data-derived.',
    priority: 'low',
  })

  return topics
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderHTML(ctx: WorkflowContext, topics: QATopic[]): string {
  const periodLabel = formatPeriod(ctx.period.year, ctx.period.month)
  const status = computeSubmissionStatus(ctx.requirements)
  const submitted = ctx.requirements.filter(r => r.uploads.length > 0).length
  const total = ctx.requirements.length
  const generatedAt = new Date().toLocaleString('en-US')

  const priorityColor = { high: '#b91c1c', medium: '#b45309', low: '#374151' }

  const rows = topics.map((t, i) => `
    <li style="margin:0 0 14px 0;padding:12px 14px;border-left:3px solid ${priorityColor[t.priority]};background:#f9fafb;border-radius:4px;">
      <div style="font-weight:600;color:#111827;font-size:14px;">${i + 1}. ${esc(t.question)}</div>
      <div style="margin-top:4px;font-size:11px;color:#6b7280;">
        <span style="text-transform:uppercase;letter-spacing:.04em;color:${priorityColor[t.priority]};font-weight:600;">${t.priority}</span>
        &middot; ${esc(t.basis)}
      </div>
    </li>`).join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meeting Q&amp;A — ${esc(ctx.client.business_name)} — ${esc(periodLabel)}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f2937;max-width:680px;margin:0 auto;padding:32px 24px;}
  h1{font-size:20px;margin:0 0 4px;}
  .meta{color:#6b7280;font-size:12px;margin-bottom:20px;}
  .stat{display:inline-block;background:#ecfdf5;color:#065f46;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;}
  ul{list-style:none;padding:0;margin:0;}
  footer{margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;}
</style></head>
<body>
  <h1>Meeting Q&amp;A pack — ${esc(ctx.client.business_name)}</h1>
  <div class="meta">
    ${esc(periodLabel)} &middot; ${esc(ctx.client.contact_name ?? '')} ${ctx.client.contact_name ? '&middot; ' : ''}${esc(ctx.client.contact_email)}<br>
    <span class="stat">${submitted}/${total} docs · ${status.replace('_', ' ')}</span>
  </div>
  <ul>${rows}</ul>
  <footer>
    Generated ${esc(generatedAt)} by BookDrop &middot; Workflow: client-meeting-qa.<br>
    Every item is derived from this client's data on record. Informational only — not financial or tax advice.
  </footer>
</body></html>`
}

/** Run the client-meeting-qa workflow. Pure — returns a downloadable artifact. */
export function runClientMeetingQA(ctx: WorkflowContext): WorkflowResult {
  try {
    if (ctx.requirements.length === 0) {
      return {
        workflowId: 'client-meeting-qa',
        ok: false,
        summary: 'No document requirements configured for this client yet.',
        error: 'empty-requirements',
      }
    }

    const topics = deriveTopics(ctx)
    const html = renderHTML(ctx, topics)
    const safeName = ctx.client.business_name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')

    return {
      workflowId: 'client-meeting-qa',
      ok: true,
      summary: `Meeting brief ready — ${topics.length} talking point${topics.length === 1 ? '' : 's'}.`,
      artifact: {
        filename: `meeting-qa-${safeName}-${ctx.period.year}-${String(ctx.period.month).padStart(2, '0')}.html`,
        mimeType: 'text/html;charset=utf-8',
        content: html,
      },
    }
  } catch (err) {
    return {
      workflowId: 'client-meeting-qa',
      ok: false,
      summary: 'Could not generate the meeting brief.',
      error: err instanceof Error ? err.message : 'unknown',
    }
  }
}
