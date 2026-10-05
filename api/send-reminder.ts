// api/send-reminder.ts
// Vercel serverless function: Send a manual reminder email to a client.
// Called from the frontend "Send Reminder" button.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from './_lib/supabase.js'
import { sendEmail } from './_lib/resend.js'
import { reminderEmailHtml } from './_lib/email-templates.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth: verify Bearer token
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', '')
  )
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { clientId, bookkeeperId, periodYear } = req.body ?? {}
  const periodMonth = Number(req.body?.periodMonth)

  if (!clientId || !bookkeeperId || !periodYear || !periodMonth) {
    return res.status(400).json({ error: 'Missing required fields: clientId, bookkeeperId, periodYear, periodMonth' })
  }

  if (periodMonth < 1 || periodMonth > 12) {
    return res.status(400).json({ error: 'Invalid periodMonth — must be 1-12' })
  }

  // Verify the authenticated user owns this bookkeeperId
  if (user.id !== bookkeeperId) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    // Fetch client
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('bookkeeper_id', bookkeeperId)
      .maybeSingle()

    if (clientErr) throw new Error(clientErr.message)
    if (!client) return res.status(404).json({ error: 'Client not found' })

    // Fetch bookkeeper
    const { data: bookkeeper, error: bkErr } = await supabaseAdmin
      .from('bookkeepers')
      .select('*')
      .eq('id', bookkeeperId)
      .maybeSingle()

    if (bkErr) throw new Error(bkErr.message)
    if (!bookkeeper) return res.status(404).json({ error: 'Bookkeeper not found' })

    // Check existing reminders this period
    const { data: existingLogs } = await supabaseAdmin
      .from('reminder_log')
      .select('reminder_number')
      .eq('client_id', clientId)
      .eq('period_year', periodYear)
      .eq('period_month', periodMonth)
      .order('reminder_number', { ascending: false })

    const nextReminderNumber = (existingLogs?.[0]?.reminder_number ?? 0) + 1

    // Get missing documents
    const { data: requirements } = await supabaseAdmin
      .from('document_requirements')
      .select('id, label, required')
      .eq('client_id', clientId)

    const { data: uploads } = await supabaseAdmin
      .from('document_uploads')
      .select('requirement_id')
      .eq('client_id', clientId)
      .eq('period_year', periodYear)
      .eq('period_month', periodMonth)

    const uploadedReqIds = new Set((uploads ?? []).map(u => u.requirement_id))
    const missingDocs = (requirements ?? [])
      .filter(r => r.required && !uploadedReqIds.has(r.id))
      .map(r => r.label)

    // Build portal URL
    const baseUrl = req.headers.origin ?? req.headers.referer ?? 'https://bookkeeper-portal.vercel.app'
    const portalUrl = `${baseUrl}/upload/${client.portal_token}`
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const periodLabel = `${monthNames[periodMonth]} ${periodYear}`

    // Send the email
    const emailResult = await sendEmail({
      to: client.contact_email,
      subject: `${bookkeeper.practice_name || bookkeeper.full_name} — Document reminder for ${periodLabel}`,
      html: reminderEmailHtml({
        clientName: client.contact_name ?? client.business_name,
        businessName: client.business_name,
        practitionerName: bookkeeper.full_name,
        practiceName: bookkeeper.practice_name,
        portalUrl,
        periodLabel,
        missingDocs,
        reminderNumber: nextReminderNumber,
        tone: bookkeeper.reminder_tone ?? 'professional',
      }),
      replyTo: bookkeeper.reply_to_email,
    })

    if (!emailResult.success) {
      return res.status(502).json({ error: emailResult.error ?? 'Email sending failed' })
    }

    // Log the reminder only if email was sent successfully
    const { error: insertErr } = await supabaseAdmin
      .from('reminder_log')
      .insert({
        client_id: clientId,
        bookkeeper_id: bookkeeperId,
        period_year: periodYear,
        period_month: periodMonth,
        reminder_number: nextReminderNumber,
        triggered_by: 'manual',
        resend_email_id: emailResult.emailId ?? null,
      })

    if (insertErr) console.error('[Reminder] Log insert failed:', insertErr.message)

    return res.status(200).json({
      success: true,
      emailSent: true,
      reminderNumber: nextReminderNumber,
      resendEmailId: emailResult.emailId ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Reminder] Error:', message)
    return res.status(500).json({ error: message })
  }
}
