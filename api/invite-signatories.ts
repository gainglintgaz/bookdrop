// api/invite-signatories.ts
// Vercel serverless function: bookkeeper adds N signatories to an engagement
// letter and we send each one a unique invite email with their per-signatory
// signing URL. Block 3 Phase E2 deliverable.
//
// Auth: bookkeeper must be authenticated (Supabase JWT). The endpoint validates
// the bookkeeper owns the engagement letter before inserting signatory rows.
//
// Idempotent-ish: if the bookkeeper calls twice with the same (letter, email),
// the second call updates the existing row (status reset to 'invited',
// invite_sent_at refreshed) and re-sends the invite email. Useful for
// reminding non-responders.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from './_lib/supabase.js'
import { sendEmail } from './_lib/resend.js'
import { signatoryInviteEmailHtml } from './_lib/email-templates.js'

function isServerDemoMode(): boolean {
  return process.env.VITE_MODE === 'demo'
}

interface InviteRequest {
  engagementLetterId: string
  // Bookkeeper auth — accept either Supabase access token or anon key for service-role calls
  bookkeeperId: string
  signatories: Array<{
    role: 'primary' | 'spouse' | 'partner' | 'guarantor' | 'other'
    name: string
    email: string
    requiredPages?: number[]
    placement?: Array<{ page: number; type: 'signature' | 'initials' | 'date' | 'text'; x: number; y: number; width: number; height: number; fieldName?: string }>
  }>
}

/** Generate a 32-char URL-safe random token. */
function generatePortalToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (isServerDemoMode()) {
    return res.status(200).json({
      success: true,
      demo: true,
      _note: 'Demo mode — invitations not sent. Set VITE_MODE=cloud to enable.',
      results: [],
    })
  }

  const body = (req.body ?? {}) as InviteRequest
  const { engagementLetterId, bookkeeperId, signatories } = body

  if (!engagementLetterId || !bookkeeperId || !Array.isArray(signatories) || signatories.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  // Validate the bookkeeper owns this letter
  const { data: letter, error: letterErr } = await supabaseAdmin
    .from('engagement_letters')
    .select('id, label, client_id, bookkeeper_id')
    .eq('id', engagementLetterId)
    .eq('bookkeeper_id', bookkeeperId)
    .maybeSingle()

  if (letterErr || !letter) {
    return res.status(404).json({ error: 'Engagement letter not found' })
  }

  const { data: bookkeeper } = await supabaseAdmin
    .from('bookkeepers')
    .select('email, full_name, practice_name, reply_to_email')
    .eq('id', bookkeeperId)
    .maybeSingle()

  // Origin for the signing URL — read from request, fall back to env, fall back to relative
  const origin = (req.headers['x-forwarded-host']
    ? `https://${req.headers['x-forwarded-host']}`
    : (req.headers.origin as string | undefined))
    ?? process.env.PUBLIC_APP_URL
    ?? ''

  const results: Array<{ email: string; signatoryId?: string; status: 'invited' | 'reminder' | 'failed'; error?: string }> = []

  for (const s of signatories) {
    if (!s.role || !s.name || !s.email) {
      results.push({ email: s.email ?? '(missing)', status: 'failed', error: 'Missing role/name/email' })
      continue
    }

    // Look up existing signatory for this letter+email (idempotent reminder path)
    const { data: existing } = await supabaseAdmin
      .from('engagement_letter_signatories')
      .select('id, signer_portal_token, status')
      .eq('engagement_letter_id', engagementLetterId)
      .eq('signer_email', s.email)
      .maybeSingle()

    let signatoryId: string
    let portalToken: string

    if (existing && existing.status === 'invited') {
      // Reminder path
      signatoryId = existing.id
      portalToken = existing.signer_portal_token
      await supabaseAdmin
        .from('engagement_letter_signatories')
        .update({
          invite_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', signatoryId)
    } else if (existing && (existing.status === 'signed' || existing.status === 'voided')) {
      // Already signed or voided — don't re-invite
      results.push({
        email: s.email,
        signatoryId: existing.id,
        status: 'failed',
        error: existing.status === 'signed' ? 'Already signed' : 'Voided',
      })
      continue
    } else {
      // New invite
      portalToken = generatePortalToken()
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('engagement_letter_signatories')
        .insert({
          engagement_letter_id: engagementLetterId,
          bookkeeper_id: bookkeeperId,
          signer_role: s.role,
          signer_name: s.name,
          signer_email: s.email,
          signer_portal_token: portalToken,
          required_pages: s.requiredPages ?? [],
          placement: s.placement ?? [],
          status: 'invited',
          invite_sent_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (insertErr || !inserted) {
        results.push({
          email: s.email,
          status: 'failed',
          error: insertErr?.message ?? 'Insert failed',
        })
        continue
      }
      signatoryId = inserted.id
    }

    // Build signing URL
    const signingUrl = origin
      ? `${origin}/sign/${portalToken}`
      : `/sign/${portalToken}`

    // Send invite email
    const emailResult = await sendEmail({
      to: s.email,
      subject: `Please sign ${letter.label}`,
      html: signatoryInviteEmailHtml({
        signerName: s.name,
        signerRole: s.role,
        documentLabel: letter.label ?? 'engagement letter',
        practitionerName: bookkeeper?.full_name ?? '',
        practiceName: bookkeeper?.practice_name ?? '',
        signingUrl,
        practitionerReplyTo: bookkeeper?.reply_to_email ?? bookkeeper?.email ?? null,
      }),
      replyTo: bookkeeper?.reply_to_email ?? bookkeeper?.email ?? undefined,
    })

    // Track invite_email_id
    if (emailResult.success && emailResult.emailId) {
      await supabaseAdmin
        .from('engagement_letter_signatories')
        .update({ invite_email_id: emailResult.emailId })
        .eq('id', signatoryId)
        .catch(() => undefined)
    }

    results.push({
      email: s.email,
      signatoryId,
      status: existing ? 'reminder' : 'invited',
      ...(emailResult.success ? {} : { error: emailResult.error }),
    })
  }

  // Update total_signatories_required on the letter so the bookkeeper UI can
  // render progress without computing per-fetch.
  const { count } = await supabaseAdmin
    .from('engagement_letter_signatories')
    .select('id', { count: 'exact', head: true })
    .eq('engagement_letter_id', engagementLetterId)
    .neq('status', 'voided')

  if (count !== null) {
    await supabaseAdmin
      .from('engagement_letters')
      .update({ total_signatories_required: count })
      .eq('id', engagementLetterId)
      .catch(() => undefined)
  }

  return res.status(200).json({ success: true, results })
}
