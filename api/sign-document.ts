// api/sign-document.ts
// Vercel serverless function: accepts a drawn signature from the client portal,
// embeds it into the engagement letter PDF using pdf-lib, stores the signed PDF,
// inserts a signatures record, fires confirmation emails to both parties, and
// logs every attempt for rate limiting.
//
// Block 3 Phase E1 hardening (2026-05-06) closes 7 audit gaps:
//   1. Rate limiting (5 attempts/hour per portal_token → 429 with Retry-After)
//   2. user_agent captured into signatures.user_agent
//   3. ESIGN/UETA consent version + agreed-at captured per signature
//   4. Atomic ordering (PDF storage BEFORE signatures insert; rollback on insert failure)
//   5. Confirmation emails to signer + bookkeeper, logged in signature_email_log
//   6. Demo branch (Block 0 — preserved) returns mock success without DB hit
//   7. Every attempt logged to signature_attempts (success or failure)
//
// Phases E2 (multi-signer) and E3 (AcroForm fillable, audit export) extend this
// in subsequent migrations + endpoint updates.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from './_lib/supabase.js'
import { sendEmail } from './_lib/resend.js'
import { signerConfirmationEmailHtml, bookkeeperSignatureNotificationHtml } from './_lib/email-templates.js'
import { PDFDocument, rgb } from 'pdf-lib'

/**
 * Server-side demo-mode detection. Mirrors the client-side `isDemoMode` check in
 * src/lib/mode.ts. Reads process.env.VITE_MODE (Vercel passes VITE_* env vars
 * to serverless functions when set on the project).
 */
function isServerDemoMode(): boolean {
  return process.env.VITE_MODE === 'demo'
}

/** How many sign attempts allowed per portal_token in a rolling 1-hour window. */
const RATE_LIMIT_PER_HOUR = 5

/**
 * Check + log a sign attempt. Returns:
 *   - { ok: true } if under the limit
 *   - { ok: false, retryAfterSeconds } if rate-limited (caller returns 429)
 *
 * Uses the signature_attempts table created in migration 005.
 */
async function checkRateLimit(
  portalToken: string,
  ip: string | null,
  ua: string | null,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  // Count recent attempts for this token (any outcome)
  const { count, error: countErr } = await supabaseAdmin
    .from('signature_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('portal_token', portalToken)
    .gte('attempted_at', oneHourAgo)

  if (countErr) {
    // Fail OPEN on rate-limit infra errors — better to allow signing than to brick the flow.
    // Log loudly so we notice infra trouble.
    console.error('[sign-document] rate limit lookup failed; allowing through:', countErr)
    return { ok: true }
  }

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    // Best effort log of the rate-limited attempt — never block the 429 on a log failure.
    await logAttempt(portalToken, ip, ua, 'rate_limited').catch(() => undefined)
    return { ok: false, retryAfterSeconds: 3600 }
  }

  return { ok: true }
}

async function logAttempt(
  portalToken: string,
  ip: string | null,
  ua: string | null,
  outcome:
    | 'success'
    | 'invalid_token'
    | 'already_signed'
    | 'rate_limited'
    | 'storage_failed'
    | 'insert_failed'
    | 'mock_demo',
): Promise<void> {
  const { error } = await supabaseAdmin.from('signature_attempts').insert({
    portal_token: portalToken,
    ip_address: ip,
    user_agent: ua,
    outcome,
  })
  if (error) {
    console.warn('[sign-document] could not log attempt:', error.message)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    engagementLetterId,
    clientId,
    portalToken,
    signerName,
    signerEmail,
    signatureImageData,
    consentDisclosureVersion,
    consentDisclosureAgreedAt,
  } = req.body ?? {}

  if (!engagementLetterId || !clientId || !portalToken ||
      !signerName || !signerEmail || !signatureImageData) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // ── Demo mode short-circuit ─────────────────────────────────────────────
  if (isServerDemoMode()) {
    console.log('[sign-document] Demo mode — returning mock signature success', {
      engagementLetterId,
      clientId,
      signerName,
    })
    return res.status(200).json({
      success: true,
      signedPath: null,
      demo: true,
      _note: 'Demo mode — signature not persisted. Set VITE_MODE=cloud for real signing.',
    })
  }

  // ── Capture audit context ───────────────────────────────────────────────
  const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? null
  const userAgent = req.headers['user-agent']?.toString() ?? null

  // ── Rate limit (5 attempts/hour per portal_token) ───────────────────────
  const rate = await checkRateLimit(portalToken, ipAddress, userAgent)
  if (!rate.ok) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds))
    return res.status(429).json({
      error: 'Too many signing attempts. Please try again later.',
    })
  }

  // ── Validate portal token ───────────────────────────────────────────────
  const { data: client, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('id, bookkeeper_id, business_name, contact_email')
    .eq('id', clientId)
    .eq('portal_token', portalToken)
    .maybeSingle()

  if (clientErr || !client) {
    await logAttempt(portalToken, ipAddress, userAgent, 'invalid_token')
    return res.status(403).json({ error: 'Invalid portal token' })
  }

  // ── Already signed? ─────────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from('signatures')
    .select('id')
    .eq('engagement_letter_id', engagementLetterId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (existing) {
    await logAttempt(portalToken, ipAddress, userAgent, 'already_signed')
    return res.status(409).json({ error: 'Document already signed' })
  }

  // ── Fetch engagement letter ─────────────────────────────────────────────
  const { data: letter, error: letterErr } = await supabaseAdmin
    .from('engagement_letters')
    .select('*')
    .eq('id', engagementLetterId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (letterErr || !letter) {
    await logAttempt(portalToken, ipAddress, userAgent, 'invalid_token')
    return res.status(404).json({ error: 'Engagement letter not found' })
  }

  // ── Lookup bookkeeper (for confirmation email + audit context) ──────────
  const { data: bookkeeper } = await supabaseAdmin
    .from('bookkeepers')
    .select('email, full_name, practice_name, reply_to_email')
    .eq('id', client.bookkeeper_id)
    .maybeSingle()

  try {
    // ── Download original PDF ───────────────────────────────────────────
    const { data: pdfData, error: dlErr } = await supabaseAdmin.storage
      .from('documents')
      .download(letter.storage_path)

    if (dlErr || !pdfData) {
      await logAttempt(portalToken, ipAddress, userAgent, 'storage_failed')
      return res.status(500).json({ error: 'Failed to download document' })
    }

    // ── Embed signature into PDF ────────────────────────────────────────
    const pdfBytes = await pdfData.arrayBuffer()
    const pdfDoc = await PDFDocument.load(pdfBytes)
    const pages = pdfDoc.getPages()
    const lastPage = pages[pages.length - 1]

    const signatureBase64 = signatureImageData.replace(/^data:image\/png;base64,/, '')
    const signatureBytes = Buffer.from(signatureBase64, 'base64')
    const signatureImage = await pdfDoc.embedPng(signatureBytes)

    const sigWidth = 200
    const sigHeight = 60
    const sigX = 60
    const sigY = 80

    lastPage.drawImage(signatureImage, {
      x: sigX,
      y: sigY,
      width: sigWidth,
      height: sigHeight,
    })

    lastPage.drawText(
      `Signed by: ${signerName} | ${signerEmail} | ${new Date().toISOString()}`,
      {
        x: sigX,
        y: sigY - 16,
        size: 8,
        color: rgb(0.4, 0.4, 0.4),
      }
    )

    const signedPdfBytes = await pdfDoc.save()
    const signedPath = letter.storage_path.replace(
      '/engagement-letters/',
      '/engagement-letters/signed/'
    )

    // ── ATOMIC: storage upload BEFORE signatures insert ─────────────────
    // Block 3 E1 fix #6: atomic ordering. If storage upload fails, no signatures
    // row is inserted and the user gets a clear 500. Previously we inserted the
    // row anyway with signed_pdf_path=null, leaving an orphaned signature.
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('documents')
      .upload(signedPath, signedPdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      console.error('[sign-document] PDF upload failed — aborting signature commit:', uploadErr)
      await logAttempt(portalToken, ipAddress, userAgent, 'storage_failed')
      return res.status(500).json({
        error: 'Failed to save signed document. Please try again.',
      })
    }

    // ── Insert signature row ────────────────────────────────────────────
    const signedAtIso = new Date().toISOString()
    const { data: insertedRows, error: insertErr } = await supabaseAdmin
      .from('signatures')
      .insert({
        engagement_letter_id: engagementLetterId,
        client_id: clientId,
        bookkeeper_id: client.bookkeeper_id,
        signer_name: signerName,
        signer_email: signerEmail,
        signature_image_data: signatureImageData,
        signed_pdf_path: signedPath,
        signed_at: signedAtIso,
        ip_address: ipAddress,
        portal_token_used: portalToken,
        // Block 3 E1 hardening
        user_agent: userAgent,
        consent_disclosure_version: consentDisclosureVersion ?? null,
        consent_disclosure_agreed_at: consentDisclosureAgreedAt ?? null,
      })
      .select('id')
      .single()

    if (insertErr || !insertedRows) {
      // Rollback storage so we don't leak orphan PDFs
      console.error('[sign-document] signatures insert failed — rolling back storage:', insertErr)
      await supabaseAdmin.storage.from('documents').remove([signedPath]).catch(() => undefined)
      await logAttempt(portalToken, ipAddress, userAgent, 'insert_failed')
      return res.status(500).json({ error: 'Failed to save signature' })
    }

    const signatureId = insertedRows.id
    await logAttempt(portalToken, ipAddress, userAgent, 'success')

    // ── Confirmation emails (best-effort; never block success) ──────────
    // Generate a 1-hour signed URL for the signed PDF
    const { data: signedUrlData } = await supabaseAdmin.storage
      .from('documents')
      .createSignedUrl(signedPath, 3600)
    const signedDocumentUrl = signedUrlData?.signedUrl ?? null

    const emailContext = {
      signerName,
      documentLabel: letter.label ?? 'Engagement letter',
      practitionerName: bookkeeper?.full_name ?? '',
      practiceName: bookkeeper?.practice_name ?? '',
      signedAt: signedAtIso,
      ipAddress,
      userAgent,
      consentVersion: consentDisclosureVersion ?? '(legacy: no consent recorded)',
      signedDocumentUrl,
      practitionerReplyTo: bookkeeper?.reply_to_email ?? bookkeeper?.email ?? null,
    }

    // Fire both emails in parallel; collect outcomes for the email log table.
    await Promise.all([
      sendConfirmationEmail({
        to: signerEmail,
        subject: `You signed ${emailContext.documentLabel}`,
        html: signerConfirmationEmailHtml(emailContext),
        replyTo: emailContext.practitionerReplyTo ?? undefined,
        signatureId,
        bookkeeperId: client.bookkeeper_id,
        recipientRole: 'client',
      }),
      bookkeeper?.email
        ? sendConfirmationEmail({
            to: bookkeeper.email,
            subject: `${signerName} signed ${emailContext.documentLabel}`,
            html: bookkeeperSignatureNotificationHtml(emailContext),
            signatureId,
            bookkeeperId: client.bookkeeper_id,
            recipientRole: 'bookkeeper',
          })
        : Promise.resolve(),
    ])

    return res.status(200).json({
      success: true,
      signedPath,
      signatureId,
    })

  } catch (err) {
    console.error('[sign-document] Error:', err)
    await logAttempt(portalToken, ipAddress, userAgent, 'storage_failed').catch(() => undefined)
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Signature processing failed'
    })
  }
}

/**
 * Send one confirmation email and log the outcome to signature_email_log.
 * Failures here are logged but never thrown — the signature itself is valid
 * even if the email infrastructure is down.
 */
async function sendConfirmationEmail(options: {
  to: string
  subject: string
  html: string
  replyTo?: string
  signatureId: string
  bookkeeperId: string
  recipientRole: 'client' | 'bookkeeper'
}): Promise<void> {
  // Insert queued row first so we have an audit trail even if Resend is down
  const { data: logRow } = await supabaseAdmin
    .from('signature_email_log')
    .insert({
      signature_id: options.signatureId,
      bookkeeper_id: options.bookkeeperId,
      recipient_email: options.to,
      recipient_role: options.recipientRole,
      status: 'queued',
    })
    .select('id')
    .single()

  const result = await sendEmail({
    to: options.to,
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo,
  })

  // Update the log row with outcome
  if (logRow) {
    await supabaseAdmin
      .from('signature_email_log')
      .update({
        status: result.success ? 'sent' : 'failed',
        resend_email_id: result.emailId ?? null,
        error_message: result.success ? null : (result.error ?? 'Unknown error'),
        sent_at: result.success ? new Date().toISOString() : null,
      })
      .eq('id', logRow.id)
      .catch(() => undefined)
  }
}
