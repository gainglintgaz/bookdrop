// api/_lib/resend.ts
// Server-side email sending via Resend.
// All API keys stay server-side — never exposed to the browser.

import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY

export const resend = resendApiKey ? new Resend(resendApiKey) : null

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL ?? 'BookDrop <noreply@bookdrop.io>'

export interface SendEmailOptions {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; emailId?: string; error?: string }> {
  if (!resend) {
    console.warn('[Email] Resend not configured — skipping send to', options.to)
    return { success: false, error: 'Resend API key not configured' }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: DEFAULT_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    })

    if (error) {
      console.error('[Email] Resend error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, emailId: data?.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown email error'
    console.error('[Email] Exception:', message)
    return { success: false, error: message }
  }
}
