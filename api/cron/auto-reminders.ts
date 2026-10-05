// api/cron/auto-reminders.ts
// Vercel cron job: Runs daily, sends scheduled reminders to clients
// who haven't completed their uploads for the current period.
// Configured in vercel.json with schedule.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabase.js'
import { sendEmail } from '../_lib/resend.js'
import { reminderEmailHtml } from '../_lib/email-templates.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (Vercel sends this automatically)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const today = new Date()
  const dayOfMonth = today.getDate()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const periodLabel = `${monthNames[currentMonth]} ${currentYear}`

  try {
    // Find all active reminder schedules due today
    const { data: dueSchedules, error: schedErr } = await supabaseAdmin
      .from('reminder_schedules')
      .select('client_id, reminder_number')
      .eq('day_of_month', dayOfMonth)
      .eq('is_active', true)

    if (schedErr) throw new Error(schedErr.message)
    if (!dueSchedules || dueSchedules.length === 0) {
      return res.status(200).json({ success: true, message: 'No reminders due today', sent: 0 })
    }

    let sentCount = 0
    let skipCount = 0
    const errors: string[] = []

    for (const schedule of dueSchedules) {
      try {
        // Check if reminder already sent this period for this number
        const { data: existing } = await supabaseAdmin
          .from('reminder_log')
          .select('id')
          .eq('client_id', schedule.client_id)
          .eq('period_year', currentYear)
          .eq('period_month', currentMonth)
          .eq('reminder_number', schedule.reminder_number)
          .limit(1)

        if (existing && existing.length > 0) {
          skipCount++
          continue // Already sent this reminder
        }

        // Fetch client with bookkeeper
        const { data: client } = await supabaseAdmin
          .from('clients')
          .select('*, bookkeepers(*)')
          .eq('id', schedule.client_id)
          .eq('is_active', true)
          .maybeSingle()

        if (!client || !client.bookkeepers) {
          skipCount++
          continue
        }

        const bookkeeper = client.bookkeepers as Record<string, unknown>

        // Check if client already completed all uploads
        const { data: requirements } = await supabaseAdmin
          .from('document_requirements')
          .select('id, label, required')
          .eq('client_id', client.id)

        const { data: uploads } = await supabaseAdmin
          .from('document_uploads')
          .select('requirement_id')
          .eq('client_id', client.id)
          .eq('period_year', currentYear)
          .eq('period_month', currentMonth)

        const requiredReqs = (requirements ?? []).filter((r: { required: boolean }) => r.required)
        const uploadedReqIds = new Set((uploads ?? []).map((u: { requirement_id: string }) => u.requirement_id))
        const allComplete = requiredReqs.length > 0 && requiredReqs.every((r: { id: string }) => uploadedReqIds.has(r.id))

        if (allComplete) {
          skipCount++
          continue // No reminder needed
        }

        const missingDocs = requiredReqs
          .filter((r: { id: string }) => !uploadedReqIds.has(r.id))
          .map((r: { label: string }) => r.label)

        const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : 'https://bookkeeper-portal.vercel.app'

        const portalUrl = `${baseUrl}/upload/${client.portal_token}`

        // Send email
        const emailResult = await sendEmail({
          to: client.contact_email,
          subject: `${(bookkeeper.practice_name as string) || (bookkeeper.full_name as string)} — Document reminder for ${periodLabel}`,
          html: reminderEmailHtml({
            clientName: client.contact_name ?? client.business_name,
            businessName: client.business_name,
            practitionerName: bookkeeper.full_name as string,
            practiceName: bookkeeper.practice_name as string,
            portalUrl,
            periodLabel,
            missingDocs,
            reminderNumber: schedule.reminder_number,
            tone: (bookkeeper.reminder_tone as 'friendly' | 'professional' | 'firm') ?? 'professional',
          }),
          replyTo: bookkeeper.reply_to_email as string,
        })

        // Log the reminder
        await supabaseAdmin.from('reminder_log').insert({
          client_id: client.id,
          bookkeeper_id: bookkeeper.id as string,
          period_year: currentYear,
          period_month: currentMonth,
          reminder_number: schedule.reminder_number,
          triggered_by: 'auto',
          resend_email_id: emailResult.emailId ?? null,
        })

        if (emailResult.success) sentCount++
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : 'Unknown error'
        errors.push(`Client ${schedule.client_id}: ${msg}`)
      }
    }

    return res.status(200).json({
      success: true,
      date: today.toISOString(),
      dayOfMonth,
      schedulesChecked: dueSchedules.length,
      sent: sentCount,
      skipped: skipCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[AutoReminders] Error:', message)
    return res.status(500).json({ error: message })
  }
}
