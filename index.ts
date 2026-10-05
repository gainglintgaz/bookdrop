// src/types/index.ts
// Complete TypeScript types for BookkeeperPortal
// All monetary values in cents (number). All dates as ISO strings.

// ─── DATABASE ROW TYPES ─────────────────────────────────────────────────────

export type Plan = 'free' | 'starter' | 'pro'
export type ReminderTone = 'friendly' | 'professional' | 'firm'
export type DocType = 'bank' | 'credit_card' | 'receipt' | 'payroll' | 'other'
export type ReminderTriggeredBy = 'auto' | 'manual'

export interface Bookkeeper {
  id: string
  email: string
  full_name: string
  practice_name: string
  reply_to_email: string
  plan: Plan
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  reminder_tone: ReminderTone
  created_at: string
}

export interface Client {
  id: string
  bookkeeper_id: string
  business_name: string
  contact_name: string | null
  contact_email: string
  portal_token: string
  notes_private: string | null
  notes_for_client: string | null
  is_active: boolean
  created_at: string
}

export interface DocumentRequirement {
  id: string
  client_id: string
  label: string
  doc_type: DocType
  required: boolean
  sort_order: number
}

export interface DocumentUpload {
  id: string
  requirement_id: string
  client_id: string
  bookkeeper_id: string
  period_year: number
  period_month: number
  filename_original: string
  storage_path: string
  file_size_bytes: number
  uploaded_at: string
}

export interface ReminderSchedule {
  id: string
  client_id: string
  day_of_month: number
  reminder_number: number
  is_active: boolean
}

export interface ReminderLog {
  id: string
  client_id: string
  bookkeeper_id: string
  period_year: number
  period_month: number
  sent_at: string
  reminder_number: number
  triggered_by: ReminderTriggeredBy
  resend_email_id: string | null
}

// ─── ENRICHED/JOINED TYPES ──────────────────────────────────────────────────

/** Requirement with its uploads for a specific month */
export interface RequirementWithUploads extends DocumentRequirement {
  uploads: DocumentUpload[]
}

/** Client with status computed for current month */
export interface ClientWithStatus extends Client {
  requirements: RequirementWithUploads[]
  submissionStatus: SubmissionStatus
  lateRate: number | null // 0-1, null if < 2 months of data
  averageSubmissionDay: number | null // which day of month they actually submit
}

/** Client data needed for the public upload page */
export interface ClientPortalData {
  client: Pick<Client, 'id' | 'business_name' | 'contact_name' | 'notes_for_client'>
  bookkeeper: Pick<Bookkeeper, 'full_name' | 'practice_name' | 'reply_to_email'>
  requirements: RequirementWithUploads[]
  period: { year: number; month: number }
  dueDay: number // day of month documents are due
}

// ─── COMPUTED STATUS TYPES ──────────────────────────────────────────────────

export type SubmissionStatus = 'complete' | 'partial' | 'missing' | 'not_started'

/** Compute submission status for a set of requirements */
export function computeSubmissionStatus(
  requirements: RequirementWithUploads[]
): SubmissionStatus {
  const required = requirements.filter(r => r.required)
  if (required.length === 0) return 'complete'

  const uploadedCount = required.filter(r => r.uploads.length > 0).length

  if (uploadedCount === 0) return 'not_started'
  if (uploadedCount === required.length) return 'complete'
  if (uploadedCount > 0) return 'partial'
  return 'missing'
}

/** Missing required document labels for a client */
export function getMissingDocuments(requirements: RequirementWithUploads[]): string[] {
  return requirements
    .filter(r => r.required && r.uploads.length === 0)
    .map(r => r.label)
}

// ─── FORM TYPES ─────────────────────────────────────────────────────────────

export interface AddClientForm {
  business_name: string
  contact_name: string
  contact_email: string
  notes_for_client: string
  notes_private: string
  requirements: Array<{
    label: string
    doc_type: DocType
    required: boolean
    sort_order: number
  }>
  reminder_schedule: Array<{
    day_of_month: number
    reminder_number: number
  }>
}

export interface BookkeeperSettingsForm {
  full_name: string
  practice_name: string
  reply_to_email: string
  reminder_tone: ReminderTone
  notify_on_complete: boolean
  notify_on_any_upload: boolean
  notify_on_late: boolean
}

// ─── UPLOAD TYPES ───────────────────────────────────────────────────────────

export interface FileUploadState {
  file: File
  requirementId: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number // 0-100
  error: string | null
  uploadId: string | null // returned on success
}

// ─── API RESPONSE TYPES ─────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T
  error: null
}

export interface ApiError {
  data: null
  error: {
    message: string
    code?: string
  }
}

export type ApiResult<T> = ApiSuccess<T> | ApiError

// ─── DASHBOARD SUMMARY ──────────────────────────────────────────────────────

export interface DashboardSummary {
  complete: number
  partial: number
  missing: number
  not_started: number
  total: number
  mostReliableClient: { name: string; lateRate: number } | null
  mostTimeconsumingClient: { name: string; lateRate: number } | null
}

// ─── TENANT / WHITE-LABEL TYPES ─────────────────────────────────────────────

export interface TenantConfig {
  vertical: string // 'bookkeeping' | 'estate-sale' | 'equine' | etc.
  productName: string
  tagline: string
  practitionerLabel: string // 'Bookkeeper' | 'Estate Sale Manager' | 'Barn Owner'
  clientLabel: string // 'Client' | 'Consignor' | 'Boarder'
  documentSetLabel: string // 'Monthly Documents' | 'Consignment Items' | 'Monthly Records'
  primaryColor: string // hex
  logoUrl: string | null
  features: {
    aiDocumentCheck: boolean // AI validates uploaded doc is correct type
    voiceEntry: boolean // voice input for mobile
    offlineMode: boolean // for field workers
    lateRateInsights: boolean
    zipDownload: boolean
    whitelabelEmail: boolean // send from custom domain
  }
  defaultDocumentTypes: Array<{
    label: string
    doc_type: DocType
    required: boolean
  }>
  defaultReminderDays: number[] // [1, 5, 10]
  planLimits: {
    free: number // max clients
    starter: number
    pro: number | null // null = unlimited
  }
}
