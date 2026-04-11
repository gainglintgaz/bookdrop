// src/lib/demo-data.ts
// Mock data for demo mode — works without Supabase.
// Activated when VITE_SUPABASE_URL is "demo" or unset.

import type {
  Bookkeeper,
  Client,
  DocumentRequirement,
  DocumentUpload,
  RequirementWithUploads,
  ClientWithStatus,
  ClientPortalData,
  ReminderLog,
} from '@/types'
import { computeSubmissionStatus } from '@/types'
import { getCurrentPeriod } from '@/lib/utils'

// Re-export isDemoMode so existing imports keep working
export { isDemoMode as DEMO_MODE } from '@/lib/mode'

// ─── DEMO BOOKKEEPER ───────────────────────────────────────────────────────

export const demoBookkeeper: Bookkeeper = {
  id: 'bk-demo-001',
  email: 'jane@smithbookkeeping.com',
  full_name: 'Jane Smith',
  practice_name: 'Smith Bookkeeping LLC',
  reply_to_email: 'jane@smithbookkeeping.com',
  plan: 'starter',
  stripe_customer_id: null,
  stripe_subscription_id: null,
  reminder_tone: 'professional',
  notify_on_complete: true,
  notify_on_any_upload: false,
  notify_on_late: true,
  created_at: '2026-01-15T10:00:00Z',
  account_type: 'practitioner',
  business_name: null,
  self_client_id: null,
}

export const demoSoloUser: Bookkeeper = {
  id: 'bk-demo-solo-001',
  email: 'mike@acmesupplies.com',
  full_name: 'Mike Torres',
  practice_name: '',
  reply_to_email: 'mike@acmesupplies.com',
  plan: 'free',
  stripe_customer_id: null,
  stripe_subscription_id: null,
  reminder_tone: 'professional',
  notify_on_complete: false,
  notify_on_any_upload: false,
  notify_on_late: false,
  created_at: '2026-03-01T10:00:00Z',
  account_type: 'solo',
  business_name: 'Acme Supplies LLC',
  self_client_id: 'client-solo-001',
}

// ─── DEMO CLIENTS ───────────────────────────────────────────────────────────

const { year, month } = getCurrentPeriod()

const demoRequirements: Record<string, DocumentRequirement[]> = {
  'client-001': [
    { id: 'req-001', client_id: 'client-001', label: 'Chase Business Checking — Statement', doc_type: 'bank', required: true, sort_order: 0 },
    { id: 'req-002', client_id: 'client-001', label: 'Amex Business Card — Statement', doc_type: 'credit_card', required: true, sort_order: 1 },
    { id: 'req-003', client_id: 'client-001', label: 'Receipts over $50', doc_type: 'receipt', required: false, sort_order: 2 },
    { id: 'req-004', client_id: 'client-001', label: 'Gusto Payroll Report', doc_type: 'payroll', required: true, sort_order: 3 },
  ],
  'client-002': [
    { id: 'req-005', client_id: 'client-002', label: 'Wells Fargo Checking — Statement', doc_type: 'bank', required: true, sort_order: 0 },
    { id: 'req-006', client_id: 'client-002', label: 'Visa Business Card — Statement', doc_type: 'credit_card', required: true, sort_order: 1 },
    { id: 'req-007', client_id: 'client-002', label: 'QuickBooks Payroll Summary', doc_type: 'payroll', required: false, sort_order: 2 },
  ],
  'client-003': [
    { id: 'req-008', client_id: 'client-003', label: 'Bank of America Checking', doc_type: 'bank', required: true, sort_order: 0 },
    { id: 'req-009', client_id: 'client-003', label: 'Capital One Spark Card', doc_type: 'credit_card', required: true, sort_order: 1 },
  ],
  'client-004': [
    { id: 'req-010', client_id: 'client-004', label: 'PNC Business Checking', doc_type: 'bank', required: true, sort_order: 0 },
    { id: 'req-011', client_id: 'client-004', label: 'Chase Ink Card Statement', doc_type: 'credit_card', required: true, sort_order: 1 },
    { id: 'req-012', client_id: 'client-004', label: 'ADP Payroll Report', doc_type: 'payroll', required: true, sort_order: 2 },
    { id: 'req-013', client_id: 'client-004', label: 'Monthly Receipts', doc_type: 'receipt', required: false, sort_order: 3 },
  ],
  'client-005': [
    { id: 'req-014', client_id: 'client-005', label: 'TD Bank Statement', doc_type: 'bank', required: true, sort_order: 0 },
    { id: 'req-015', client_id: 'client-005', label: 'Mastercard Statement', doc_type: 'credit_card', required: true, sort_order: 1 },
  ],
  'client-solo-001': [
    { id: 'req-s01', client_id: 'client-solo-001', label: 'Chase Business Checking — Statement', doc_type: 'bank', required: true, sort_order: 0 },
    { id: 'req-s02', client_id: 'client-solo-001', label: 'Amex Business Card — Statement', doc_type: 'credit_card', required: true, sort_order: 1 },
    { id: 'req-s03', client_id: 'client-solo-001', label: 'Receipts & Invoices', doc_type: 'receipt', required: false, sort_order: 2 },
  ],
}

// Some clients have uploads, some don't (realistic mix)
const demoUploads: DocumentUpload[] = [
  // Client 1: complete — all required uploaded
  { id: 'up-001', requirement_id: 'req-001', client_id: 'client-001', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'chase_checking_apr2026.pdf', storage_path: 'demo/chase.pdf', file_size_bytes: 245_760, uploaded_at: '2026-04-02T14:30:00Z' },
  { id: 'up-002', requirement_id: 'req-002', client_id: 'client-001', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'amex_business_apr2026.pdf', storage_path: 'demo/amex.pdf', file_size_bytes: 189_440, uploaded_at: '2026-04-02T14:31:00Z' },
  { id: 'up-003', requirement_id: 'req-004', client_id: 'client-001', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'gusto_payroll_apr2026.pdf', storage_path: 'demo/gusto.pdf', file_size_bytes: 102_400, uploaded_at: '2026-04-03T09:15:00Z' },

  // Client 2: partial — 1 of 2 required
  { id: 'up-004', requirement_id: 'req-005', client_id: 'client-002', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'wellsfargo_apr2026.pdf', storage_path: 'demo/wf.pdf', file_size_bytes: 312_320, uploaded_at: '2026-04-04T11:00:00Z' },

  // Client 3: complete
  { id: 'up-005', requirement_id: 'req-008', client_id: 'client-003', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'bofa_checking_apr.pdf', storage_path: 'demo/bofa.pdf', file_size_bytes: 276_480, uploaded_at: '2026-04-01T08:00:00Z' },
  { id: 'up-006', requirement_id: 'req-009', client_id: 'client-003', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'capitalone_spark_apr.pdf', storage_path: 'demo/capone.pdf', file_size_bytes: 198_656, uploaded_at: '2026-04-01T08:02:00Z' },

  // Client 4: not started (no uploads)
  // Client 5: partial — 1 of 2
  { id: 'up-007', requirement_id: 'req-014', client_id: 'client-005', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, filename_original: 'td_bank_apr2026.pdf', storage_path: 'demo/td.pdf', file_size_bytes: 225_280, uploaded_at: '2026-04-03T16:45:00Z' },

  // Solo client (Mike Torres / Acme Supplies): partial — 1 of 2 required
  { id: 'up-s01', requirement_id: 'req-s01', client_id: 'client-solo-001', bookkeeper_id: 'bk-demo-solo-001', period_year: year, period_month: month, filename_original: 'chase_checking_apr2026.pdf', storage_path: 'demo/solo-chase.pdf', file_size_bytes: 198_656, uploaded_at: '2026-04-05T10:30:00Z' },
]

const demoClients: Client[] = [
  { id: 'client-001', bookkeeper_id: 'bk-demo-001', business_name: 'Riverside Cafe', contact_name: 'Maria Rodriguez', contact_email: 'maria@riversidecafe.com', portal_token: 'aB3xK9mP2qRt', notes_private: 'Switched from Wave in January. Very organized.', notes_for_client: 'Please upload by the 5th of each month.', is_active: true, created_at: '2026-01-20T10:00:00Z' },
  { id: 'client-002', bookkeeper_id: 'bk-demo-001', business_name: 'Peak Fitness Studio', contact_name: 'David Chen', contact_email: 'david@peakfitness.com', portal_token: 'cD4yL8nQ3sTu', notes_private: 'Always late. Needs 2-3 reminders.', notes_for_client: null, is_active: true, created_at: '2026-02-01T10:00:00Z' },
  { id: 'client-003', bookkeeper_id: 'bk-demo-001', business_name: 'Greenleaf Landscaping', contact_name: 'Sarah Johnson', contact_email: 'sarah@greenleaf.co', portal_token: 'eF5zM7oR4uVw', notes_private: null, notes_for_client: 'Include any receipts for equipment purchases.', is_active: true, created_at: '2026-02-15T10:00:00Z' },
  { id: 'client-004', bookkeeper_id: 'bk-demo-001', business_name: 'TechBridge Solutions', contact_name: 'Alex Kim', contact_email: 'alex@techbridge.io', portal_token: 'gH6aN8pS5wXy', notes_private: 'New client. First month collecting docs.', notes_for_client: 'Welcome! Upload your monthly financial documents here.', is_active: true, created_at: '2026-03-10T10:00:00Z' },
  { id: 'client-005', bookkeeper_id: 'bk-demo-001', business_name: 'Bella Hair Salon', contact_name: 'Jessica Park', contact_email: 'jessica@bellahair.com', portal_token: 'iJ7bO9qT6xZa', notes_private: null, notes_for_client: null, is_active: true, created_at: '2026-03-20T10:00:00Z' },
  { id: 'client-solo-001', bookkeeper_id: 'bk-demo-solo-001', business_name: 'Acme Supplies LLC', contact_name: 'Mike Torres', contact_email: 'mike@acmesupplies.com', portal_token: 'kL8cP2rU7yBd', notes_private: null, notes_for_client: null, is_active: true, created_at: '2026-03-01T10:00:00Z' },
]

const demoReminderLogs: ReminderLog[] = [
  { id: 'rem-001', client_id: 'client-002', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, sent_at: '2026-04-01T09:00:00Z', reminder_number: 1, triggered_by: 'auto', resend_email_id: null },
  { id: 'rem-002', client_id: 'client-004', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, sent_at: '2026-04-01T09:00:00Z', reminder_number: 1, triggered_by: 'auto', resend_email_id: null },
  { id: 'rem-003', client_id: 'client-005', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, sent_at: '2026-04-01T09:00:00Z', reminder_number: 1, triggered_by: 'auto', resend_email_id: null },
  { id: 'rem-004', client_id: 'client-004', bookkeeper_id: 'bk-demo-001', period_year: year, period_month: month, sent_at: '2026-04-05T09:00:00Z', reminder_number: 2, triggered_by: 'auto', resend_email_id: null },
]

// ─── BUILD ENRICHED DATA ────────────────────────────────────────────────────

function buildClientWithStatus(client: Client): ClientWithStatus {
  const reqs = demoRequirements[client.id] ?? []
  const clientUploads = demoUploads.filter(u => u.client_id === client.id && u.period_year === year && u.period_month === month)

  const reqsWithUploads: RequirementWithUploads[] = reqs.map(req => ({
    ...req,
    uploads: clientUploads.filter(u => u.requirement_id === req.id),
  }))

  return {
    ...client,
    requirements: reqsWithUploads,
    submissionStatus: computeSubmissionStatus(reqsWithUploads),
    lateRate: client.id === 'client-001' ? 0.92 : client.id === 'client-002' ? 0.33 : client.id === 'client-003' ? 0.87 : null,
    averageSubmissionDay: client.id === 'client-001' ? 3 : client.id === 'client-002' ? 17 : client.id === 'client-003' ? 2 : null,
  }
}

// ─── EXPORTED DEMO API ──────────────────────────────────────────────────────

export function getDemoClients(): ClientWithStatus[] {
  return demoClients.map(buildClientWithStatus)
}

export function getDemoClient(clientId: string): ClientWithStatus | null {
  const client = demoClients.find(c => c.id === clientId)
  if (!client) return null
  return buildClientWithStatus(client)
}

export function getDemoClientByToken(token: string): ClientPortalData | null {
  const client = demoClients.find(c => c.portal_token === token)
  if (!client) return null

  const reqs = demoRequirements[client.id] ?? []
  const clientUploads = demoUploads.filter(u => u.client_id === client.id && u.period_year === year && u.period_month === month)

  return {
    client: { id: client.id, business_name: client.business_name, contact_name: client.contact_name, contact_email: client.contact_email, notes_for_client: client.notes_for_client },
    bookkeeper: { full_name: demoBookkeeper.full_name, practice_name: demoBookkeeper.practice_name, reply_to_email: demoBookkeeper.reply_to_email },
    bookkeeperId: demoBookkeeper.id,
    requirements: reqs.map(req => ({ ...req, uploads: clientUploads.filter(u => u.requirement_id === req.id) })),
    period: { year, month },
    dueDay: 5,
  }
}

export function getDemoRequirementsWithUploads(clientId: string): RequirementWithUploads[] {
  const reqs = demoRequirements[clientId] ?? []
  const clientUploads = demoUploads.filter(u => u.client_id === clientId && u.period_year === year && u.period_month === month)
  return reqs.map(req => ({ ...req, uploads: clientUploads.filter(u => u.requirement_id === req.id) }))
}

export function getDemoReminderLogs(clientId: string): ReminderLog[] {
  return demoReminderLogs.filter(r => r.client_id === clientId && r.period_year === year && r.period_month === month)
}
