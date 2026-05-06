// src/types/index.ts
// Complete TypeScript types for BookkeeperPortal
// All monetary values in cents (number). All dates as ISO strings.

// ─── DATABASE ROW TYPES ─────────────────────────────────────────────────────

export type AccountType = 'practitioner' | 'solo'
export type Plan = 'free' | 'starter' | 'pro'
export type SoloPlan = 'free' | 'plus' | 'growth'
export type ReminderTone = 'friendly' | 'professional' | 'firm'
export type DocType =
  | 'bank'
  | 'credit_card'
  | 'receipt'
  | 'payroll'
  | 'w2'
  | '1099_nec'
  | '1099_misc'
  | '1099_int'
  | '1099_div'
  | '1099_k'
  | '1040'
  | '1098'
  | 'investment'
  | 'mortgage'
  | 'other'
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
  notify_on_complete: boolean
  notify_on_any_upload: boolean
  notify_on_late: boolean
  created_at: string
  // Dual-audience fields
  account_type: AccountType
  business_name: string | null
  self_client_id: string | null
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
  // Migration 004 — AI-first pivot: auto-categorization metadata
  auto_categorized_at?: string | null
  auto_categorization_confidence?: 'high' | 'medium' | 'low' | null
  client_confirmed_at?: string | null
  parsed_summary?: ParsedStatementSummary | null
  categorization_summary?: UploadCategorizationSummary | null
}

/** Lightweight summary of a parsed bank/CC statement, stored on the upload row. */
export interface ParsedStatementSummary {
  bankName: string | null
  accountLast4: string | null
  openingBalance: number | null
  closingBalance: number | null
  totalCredits: number
  totalDebits: number
  transactionCount: number
}

/** Lightweight summary of categorization across one upload. */
export interface UploadCategorizationSummary {
  totalCategorized: number
  highConfidence: number
  mediumConfidence: number
  lowConfidence: number
  byCategory: Record<string, number>
  flagsCount: number
}

/** Migration 004 — Phase A flywheel: per-correction record. */
export interface CategorizationCorrection {
  id: string
  bookkeeper_id: string
  client_id: string
  upload_id: string | null
  transaction_date: string | null
  transaction_amount_cents: number | null
  vendor_normalized: string | null
  description_raw: string | null
  original_category: string | null
  corrected_category: string
  original_subcategory: string | null
  corrected_subcategory: string | null
  reason: string | null
  status: 'applied' | 'undone' | 'auto_promoted'
  applied_at: string
  original_confidence: 'high' | 'medium' | 'low' | null
}

/** Migration 004 — Phase A flywheel: per-cycle outcome captured at sign-off. */
export interface CloseCycleOutcome {
  id: string
  bookkeeper_id: string
  client_id: string
  period_year: number
  period_month: number
  hours_saved_minutes: number
  accuracy_pct: number | null
  reconciliation_match_pct: number | null
  total_categorized: number
  total_corrected: number
  total_anomalies_flagged: number
  total_anomalies_real: number
  notes: string | null
  worth_it: boolean | null
  signed_off_at: string
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

export interface EngagementLetter {
  id: string
  bookkeeper_id: string
  client_id: string
  label: string
  storage_path: string
  filename: string
  file_size_bytes: number
  is_active: boolean
  created_at: string
  // Migration 006 — multi-signer support
  fully_signed_at?: string | null
  total_signatories_required?: number | null
}

export interface Signature {
  id: string
  engagement_letter_id: string
  client_id: string
  bookkeeper_id: string
  signed_at: string
  signer_name: string
  signer_email: string
  signature_image_data: string
  signed_pdf_path: string | null
  ip_address: string | null
  portal_token_used: string
  // Migration 005 — Block 3 E1 hardening
  user_agent?: string | null
  consent_disclosure_agreed_at?: string | null
  consent_disclosure_version?: string | null
  attempt_id?: string | null
  // Migration 006 — Block 3 E2 multi-signer
  signatory_id?: string | null
}

/** Block 3 E2: signer role — drives email tone, defaults, audit clarity. */
export type SignerRole = 'primary' | 'spouse' | 'partner' | 'guarantor' | 'other'

/** Block 3 E2: status of a signatory's part of the workflow. */
export type SignatoryStatus = 'invited' | 'viewed' | 'signed' | 'voided'

/**
 * Block 3 E2: per-signature placement coordinate metadata. The PDF coordinate
 * system is bottom-left origin per pdf-lib convention. Coordinates are in PDF
 * points (1 point = 1/72 inch).
 */
export interface SignaturePlacement {
  page: number          // 1-indexed
  type: 'signature' | 'initials' | 'date' | 'text'
  x: number
  y: number
  width: number
  height: number
  /** Only used when type='text' — links to AcroForm field name (Phase E3). */
  fieldName?: string
}

/** Migration 006 — Block 3 E2: one signatory per signer per letter. */
export interface EngagementLetterSignatory {
  id: string
  engagement_letter_id: string
  bookkeeper_id: string
  signer_role: SignerRole
  signer_name: string
  signer_email: string
  signer_portal_token: string
  required_pages: number[]
  placement: SignaturePlacement[]
  signed_at: string | null
  signature_id: string | null
  previous_attempt_id: string | null
  invite_sent_at: string | null
  invite_email_id: string | null
  status: SignatoryStatus
  created_at: string
  updated_at: string
}

export interface EngagementLetterWithSignature extends EngagementLetter {
  signature: Signature | null
  /** Migration 006 — list of all signatories for this letter (multi-signer letters have N>=2). */
  signatories?: EngagementLetterSignatory[]
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
  lateRate: number | null
  averageSubmissionDay: number | null
}

/** Client data needed for the public upload page */
export interface ClientPortalData {
  client: Pick<Client, 'id' | 'business_name' | 'contact_name' | 'contact_email' | 'notes_for_client'>
  bookkeeper: Pick<Bookkeeper, 'full_name' | 'practice_name' | 'reply_to_email'>
  bookkeeperId: string
  requirements: RequirementWithUploads[]
  period: { year: number; month: number }
  dueDay: number
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
  progress: number
  error: string | null
  uploadId: string | null
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
  vertical: string
  productName: string
  tagline: string
  practitionerLabel: string
  clientLabel: string
  documentSetLabel: string
  primaryColor: string
  logoUrl: string | null
  features: {
    aiDocumentCheck: boolean
    voiceEntry: boolean
    offlineMode: boolean
    lateRateInsights: boolean
    zipDownload: boolean
    whitelabelEmail: boolean
  }
  defaultDocumentTypes: Array<{
    label: string
    doc_type: DocType
    required: boolean
  }>
  taxDocumentTypes?: Array<{
    label: string
    doc_type: DocType
    required: boolean
  }>
  defaultReminderDays: number[]
  planLimits: {
    free: number
    starter: number
    pro: number | null
  }
}
