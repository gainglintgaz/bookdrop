// src/lib/send-reminder.ts
// Manual reminder sending from the dashboard.
// Calls the /api/send-reminder Vercel serverless function which sends via Resend.

import { isDemoMode } from '@/lib/mode'
import { getCurrentPeriod } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/types'

interface SendReminderResult {
  success: boolean
  error: string | null
}

/** Send a manual reminder for a client for the current period.
 *  Calls the server-side API which sends the email via Resend and logs to reminder_log. */
export async function sendManualReminder(
  client: Client,
  bookkeeperId: string,
): Promise<SendReminderResult> {
  if (isDemoMode) return { success: true, error: null }

  const { year, month } = getCurrentPeriod()

  try {
    const { data: { session } } = await supabase.auth.getSession()

    const response = await fetch('/api/send-reminder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        clientId: client.id,
        bookkeeperId,
        periodYear: year,
        periodMonth: month,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return { success: false, error: data.error ?? 'Failed to send reminder' }
    }

    return { success: true, error: null }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send reminder'
    return { success: false, error: message }
  }
}
