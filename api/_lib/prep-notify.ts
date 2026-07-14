// prep-notify.ts — email bookkeepers after overnight close-prep batch.
// Honest: skips when Resend not configured. Groups by bookkeeper.

import { sendEmail } from './resend.js'
import { supabaseAdmin } from './supabase.js'

export interface PrepNotifyExecuted {
  clientId: string
  clientName: string
  status: string
  message: string
  runId?: string
  txnCount?: number
  csvParsed?: number
  pdfParsed?: number
  pdfEmpty?: number
  bookkeeperId?: string
}

export interface PrepNotifyResult {
  attempted: number
  sent: number
  skipped: number
  errors: string[]
}

function periodLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function buildHtml(opts: {
  practiceName: string
  period: { year: number; month: number }
  rows: PrepNotifyExecuted[]
  appUrl: string
}): string {
  const label = periodLabel(opts.period.year, opts.period.month)
  const items = opts.rows
    .map(r => {
      const tx = r.txnCount ?? 0
      const desk = `${opts.appUrl}/clients/${r.clientId}?desk=history`
      return `<li style="margin-bottom:8px">
        <strong>${escapeHtml(r.clientName)}</strong> — ${escapeHtml(r.status)}
        · ${tx} txn · ${escapeHtml(r.message)}
        <br/><a href="${desk}">Open Period Desk (History / prep runs)</a>
      </li>`
    })
    .join('')

  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
  <p>Hi ${escapeHtml(opts.practiceName)},</p>
  <p>Overnight <strong>close prep</strong> finished for <strong>${label}</strong>.</p>
  <p>${opts.rows.length} client(s) processed. Package export still needs your approve — nothing was posted to the GL.</p>
  <ul>${items}</ul>
  <p style="color:#666;font-size:13px">CSV + PDF text are parsed server-side. Image-only PDFs may need Power tools OCR. This is prep, not auto-close.</p>
</body></html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Notify each bookkeeper who had at least one executed prep run.
 * Requires bookkeeperId on each executed row (filled by close-prep).
 */
export async function notifyBookkeepersOfPrepRuns(opts: {
  period: { year: number; month: number }
  executed: PrepNotifyExecuted[]
  appUrl?: string
}): Promise<PrepNotifyResult> {
  const result: PrepNotifyResult = { attempted: 0, sent: 0, skipped: 0, errors: [] }
  if (opts.executed.length === 0) {
    result.skipped = 1
    return result
  }

  const appUrl = (opts.appUrl ?? process.env.APP_URL ?? process.env.VITE_APP_URL ?? 'https://bookkeeper-portal.vercel.app').replace(/\/$/, '')

  const byBk = new Map<string, PrepNotifyExecuted[]>()
  for (const row of opts.executed) {
    const bk = row.bookkeeperId
    if (!bk) {
      result.skipped++
      continue
    }
    const list = byBk.get(bk) ?? []
    list.push(row)
    byBk.set(bk, list)
  }

  for (const [bookkeeperId, rows] of byBk) {
    result.attempted++
    const { data: bk, error } = await supabaseAdmin
      .from('bookkeepers')
      .select('id, email, full_name, practice_name, reply_to_email')
      .eq('id', bookkeeperId)
      .maybeSingle()

    if (error || !bk?.email) {
      result.errors.push(error?.message ?? `No email for bookkeeper ${bookkeeperId}`)
      continue
    }

    const practiceName = bk.practice_name || bk.full_name || 'there'
    const html = buildHtml({
      practiceName,
      period: opts.period,
      rows,
      appUrl,
    })

    const send = await sendEmail({
      to: bk.email,
      subject: `Close prep ready — ${rows.length} client(s) · ${periodLabel(opts.period.year, opts.period.month)}`,
      html,
      replyTo: bk.reply_to_email ?? undefined,
    })

    if (send.success) {
      result.sent++
    } else {
      result.errors.push(send.error ?? `send failed for ${bk.email}`)
    }
  }

  return result
}
