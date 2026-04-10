// api/cron/engagement-emails.ts
// Vercel cron job: Runs daily at 10:00 UTC.
// Sends lifecycle engagement emails to bookkeepers based on account age and activity.
// Each bookkeeper gets at most ONE email per run.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../_lib/supabase.js'
import { sendEmail } from '../_lib/resend.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (Vercel sends this automatically)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' })
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Fetch all bookkeepers
    const { data: bookkeepers, error } = await supabaseAdmin
      .from('bookkeepers')
      .select('id, email, full_name, plan, created_at, reply_to_email')

    if (error) {
      console.error('[engagement-emails] Failed to fetch bookkeepers:', error)
      return res.status(500).json({ error: error.message })
    }

    let sent = 0
    const now = new Date()

    for (const bk of bookkeepers ?? []) {
      // Skip demo/test accounts
      if (bk.email.includes('demo') || bk.email.includes('test')) continue

      const daysSince = Math.floor(
        (now.getTime() - new Date(bk.created_at).getTime()) / (1000 * 60 * 60 * 24)
      )

      // Get client count
      const { count: clientCount } = await supabaseAdmin
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('bookkeeper_id', bk.id)
        .eq('is_active', true)

      // Get upload count
      const { count: uploadCount } = await supabaseAdmin
        .from('document_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('bookkeeper_id', bk.id)

      // Each bookkeeper gets AT MOST ONE email per run — use if/else if chain

      // CHECK A — Day 3, no clients
      if (daysSince >= 3 && daysSince < 4 && (clientCount ?? 0) === 0) {
        await sendEmail({
          to: bk.email,
          subject: 'Add your first client to BookDrop (takes 2 minutes)',
          html: `Hi ${bk.full_name},<br><br>
          You signed up for BookDrop 3 days ago but haven't added a client yet.<br><br>
          It takes about 2 minutes: click <strong>Add Client</strong>, enter their name and email,
          then send them the portal link. They upload — you stop chasing.<br><br>
          Let me know if you hit any snags.<br><br>
          — BookDrop`,
        })
        console.log('[engagement-emails] CHECK_A sent to', bk.email)
        sent++

      // CHECK B — Day 7, zero uploads ever
      } else if (daysSince >= 7 && daysSince < 8 && (uploadCount ?? 0) === 0) {
        await sendEmail({
          to: bk.email,
          subject: 'Is BookDrop a fit for you?',
          html: `Hi ${bk.full_name},<br><br>
          No pressure — some tools aren't the right fit. But if you hit a snag,
          reply to this email and I'll help personally.<br><br>
          It takes about 5 minutes to get your first client uploading.
          Clients don't need to create an account — they just click a link.<br><br>
          — BookDrop`,
          replyTo: bk.reply_to_email ?? undefined,
        })
        console.log('[engagement-emails] CHECK_B sent to', bk.email)
        sent++

      // CHECK C — Day 14, has clients but zero uploads
      } else if (daysSince >= 14 && daysSince < 15 &&
                 (clientCount ?? 0) > 0 && (uploadCount ?? 0) === 0) {
        await sendEmail({
          to: bk.email,
          subject: "Your clients haven't uploaded yet — did the portal link reach them?",
          html: `Hi ${bk.full_name},<br><br>
          You've added clients but none have uploaded yet. The most common reason:
          the portal link never reached them.<br><br>
          Go to any client → copy their portal link → send it directly via text or email.
          They don't need to create an account. They just click, drag files, done.<br><br>
          — BookDrop`,
        })
        console.log('[engagement-emails] CHECK_C sent to', bk.email)
        sent++

      // CHECK D — Day 30+, zero uploads ever → release beta spot
      } else if (daysSince >= 30 && daysSince < 31 && (uploadCount ?? 0) === 0) {
        await sendEmail({
          to: bk.email,
          subject: 'Your BookDrop beta spot has been released',
          html: `Hi ${bk.full_name},<br><br>
          We've released your beta spot to someone on the waitlist —
          it looked like BookDrop wasn't the right time for you.<br><br>
          If you want back in, reply to this email. Happy to set you up again when you're ready.<br><br>
          — BookDrop`,
        })
        // Downgrade to free plan
        await supabaseAdmin
          .from('bookkeepers')
          .update({ plan: 'free' })
          .eq('id', bk.id)
        console.log('[engagement-emails] CHECK_D sent + downgraded', bk.email)
        sent++

      // CHECK E — Day 45, active user (has uploads)
      } else if (daysSince >= 45 && daysSince < 46 && (uploadCount ?? 0) > 0) {
        await sendEmail({
          to: bk.email,
          subject: 'Your BookDrop beta ends in 15 days',
          html: `Hi ${bk.full_name},<br><br>
          You've been one of our most active beta users — thank you.<br><br>
          Beta ends in 15 days. Paid plans start at $39/mo.
          Reply to this email if you want to be first to know when billing opens —
          you'll get a founding member discount.<br><br>
          — BookDrop`,
        })
        console.log('[engagement-emails] CHECK_E sent to', bk.email)
        sent++
      }
    }

    return res.status(200).json({ ok: true, sent })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[engagement-emails] Error:', message)
    return res.status(500).json({ error: message })
  }
}
