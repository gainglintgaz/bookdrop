import { isDemoMode, isLocalMode } from '@/lib/mode'
import { backendRequest } from '@/lib/backend'
import type { Client, RequirementWithUploads, ReminderLog } from '@/types'

export interface TearsheetOutcome {
  period_year: number
  period_month: number
  hours_saved_minutes: number | null
  accuracy_pct: number | null
  reconciliation_match_pct: number | null
  total_categorized: number | null
  total_corrected: number | null
}
export interface ClientTearsheet {
  client: Client
  requirements: RequirementWithUploads[]
  reminders: ReminderLog[]
  outcomes: TearsheetOutcome[]
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function fetchClientTearsheet(clientId: string, year: number, month: number): Promise<ClientTearsheet> {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid period')
  if (isDemoMode) {
    const { getDemoClient, getDemoRequirementsWithUploads, getDemoReminderLogs } = await import('@/lib/demo-data')
    const client = getDemoClient(clientId)
    if (!client) throw new Error('Client not found')
    return { client, requirements: getDemoRequirementsWithUploads(clientId), reminders: getDemoReminderLogs(clientId).slice(0, 5), outcomes: [] }
  }
  if (!uuid.test(clientId)) throw new Error('Invalid client')
  if (isLocalMode) return backendRequest<ClientTearsheet>(`/clients/${clientId}/tearsheet`, { year, month })
  const [{ supabase }, { fetchRequirementsWithUploads }] = await Promise.all([import('@/lib/supabase'), import('@/lib/db')])
  const [clientRes, requirements, remindersRes, outcomesRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    fetchRequirementsWithUploads(clientId, year, month),
    supabase.from('reminder_log').select('*').eq('client_id', clientId).order('sent_at', { ascending: false }).limit(5),
    supabase.from('close_cycle_outcomes').select('period_year,period_month,hours_saved_minutes,accuracy_pct,reconciliation_match_pct,total_categorized,total_corrected').eq('client_id', clientId).order('period_year', { ascending: false }).order('period_month', { ascending: false }).limit(24),
  ])
  for (const result of [clientRes, remindersRes, outcomesRes]) if (result.error) throw new Error(result.error.message)
  if (!clientRes.data) throw new Error('Client not found')
  return { client: clientRes.data as Client, requirements, reminders: (remindersRes.data ?? []) as ReminderLog[], outcomes: (outcomesRes.data ?? []) as TearsheetOutcome[] }
}
export function tearsheetMetrics(outcomes: TearsheetOutcome[]) {
  const hours = outcomes.flatMap(row => row.hours_saved_minutes === null ? [] : [row.hours_saved_minutes])
  const accuracy = outcomes.flatMap(row => row.accuracy_pct === null ? [] : [row.accuracy_pct])
  return {
    lifetimeHoursSaved: hours.length ? hours.reduce((sum, value) => sum + value, 0) / 60 : null,
    hoursSamples: hours.length,
    avgAccuracy: accuracy.length ? accuracy.reduce((sum, value) => sum + value, 0) / accuracy.length : null,
    accuracySamples: accuracy.length,
  }
}
