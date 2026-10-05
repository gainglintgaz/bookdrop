// api/notify-upload.ts
// Vercel serverless function: Notify bookkeeper when a client uploads a document.
// Called from the frontend after a successful upload.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from './_lib/supabase.js'
import { sendEmail } from './_lib/resend.js'
import { uploadNotificationHtml } from './_lib/email-templates.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { clientId, bookkeeperId, fileName, periodYear, periodMonth, portalToken } = req.body ?? {}

  if (!clientId || !bookkeeperId || !fileName) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  if (!portalToken) {
    return res.status(403).json({ error: 'Missing portal token' })
  }

  // Validate the portal token matches the client
  const { data: tokenCheck } = await supabaseAdmin
    .from('clients')
    .select('id, bookkeeper_id')
    .eq('portal_token', portalToken)
    .eq('id', clientId)
    .maybeSingle()

  if (!tokenCheck) {
    return res.status(403).json({ error: 'Invalid portal token' })
  }

  try {
    // Fetch bookkeeper to check notification preferences
    const { data: bookkeeper, error: bkErr } = await supabaseAdmin
      .from('bookkeepers')
      .select('email, full_name, notify_on_any_upload, notify_on_complete')
      .eq('id', bookkeeperId)
      .maybeSingle()

    if (bkErr) throw new Error(bkErr.message)
    if (!bookkeeper) return res.status(404).json({ error: 'Bookkeeper not found' })

    // Fetch client info
    const { data: client, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('business_name, contact_name')
      .eq('id', clientId)
      .maybeSingle()

    if (clientErr) throw new Error(clientErr.message)
    if (!client) return res.status(404).json({ error: 'Client not found' })

    // Check completion status
    const { data: requirements } = await supabaseAdmin
      .from('document_requirements')
      .select('id, required')
      .eq('client_id', clientId)

    const { data: uploads } = await supabaseAdmin
      .from('document_uploads')
      .select('requirement_id')
      .eq('client_id', clientId)
      .eq('period_year', periodYear ?? new Date().getFullYear())
      .eq('period_month', periodMonth ?? new Date().getMonth() + 1)

    const requiredReqs = (requirements ?? []).filter(r => r.required)
    const uploadedReqIds = new Set((uploads ?? []).map(u => u.requirement_id))
    const uploadedCount = requiredReqs.filter(r => uploadedReqIds.has(r.id)).length
    const isComplete = requiredReqs.length > 0 && uploadedCount === requiredReqs.length

    // Decide whether to send notification
    const shouldNotify = bookkeeper.notify_on_any_upload || (isComplete && bookkeeper.notify_on_complete)

    if (!shouldNotify) {
      return res.status(200).json({ success: true, notified: false, reason: 'Notifications disabled for this event' })
    }

    // Build email
    const baseUrl = req.headers.origin ?? req.headers.referer ?? 'https://bookkeeper-portal.vercel.app'
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const pYear = periodYear ?? new Date().getFullYear()
    const pMonth = periodMonth ?? new Date().getMonth() + 1

    const subject = isComplete
      ? `${client.business_name} — All documents received for ${monthNames[pMonth]} ${pYear}`
      : `${client.business_name} — New upload: ${fileName}`

    const emailResult = await sendEmail({
      to: bookkeeper.email,
      subject,
      html: uploadNotificationHtml({
        clientBusinessName: client.business_name,
        clientContactName: client.contact_name,
        fileName,
        periodLabel: `${monthNames[pMonth]} ${pYear}`,
        isComplete,
        uploadedCount,
        requiredCount: requiredReqs.length,
        dashboardUrl: `${baseUrl}/clients/${clientId}`,
      }),
    })

    return res.status(200).json({
      success: true,
      notified: true,
      emailSent: emailResult.success,
      isComplete,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[NotifyUpload] Error:', message)
    // Don't fail the upload just because notification failed
    return res.status(200).json({ success: true, notified: false, error: message })
  }
}
