// src/lib/tenant.config.ts
// THE UNIVERSAL WHITE-LABEL SYSTEM
//
// This single file makes BookkeeperPortal work for ANY vertical.
// Change VITE_TENANT_VERTICAL in .env to switch.
// Zero code changes needed — only config changes.
//
// Verticals already designed (ready to activate):
//   bookkeeping   → BookDrop (active)
//   estate-sale   → ConsignDrop (ready)
//   equine        → BarnDrop (ready)
//   hoa           → HoaDrop (ready)
//   cleaning      → ProofDrop (ready)
//
// To add a new vertical: add a new case below, done.

import type { TenantConfig } from '@/types'

const VERTICAL = import.meta.env.VITE_TENANT_VERTICAL ?? 'bookkeeping'

const configs: Record<string, TenantConfig> = {

  // ─── BOOKKEEPING (PRIMARY — ACTIVE) ────────────────────────────────────────
  bookkeeping: {
    vertical: 'bookkeeping',
    productName: 'BookDrop',
    tagline: 'Stop chasing documents. Start doing bookkeeping.',
    practitionerLabel: 'Bookkeeper',
    clientLabel: 'Client',
    documentSetLabel: 'Monthly Documents',
    primaryColor: '#2d6a4f',
    logoUrl: null,
    features: {
      aiDocumentCheck: false,  // Phase 2: AI validates it's the right bank statement
      voiceEntry: false,
      offlineMode: false,
      lateRateInsights: true,  // Core differentiator — show from day 1
      zipDownload: true,
      whitelabelEmail: false,  // Pro plan only
    },
    defaultDocumentTypes: [
      { label: 'Bank Statement (Primary Account)', doc_type: 'bank', required: true },
      { label: 'Credit Card Statement', doc_type: 'credit_card', required: true },
      { label: 'Receipts over $50', doc_type: 'receipt', required: false },
      { label: 'Payroll Report', doc_type: 'payroll', required: false },
    ],
    defaultReminderDays: [1, 5, 10],
    planLimits: { free: 3, starter: 15, pro: null },
  },

  // ─── ESTATE SALE (READY — needs consignDrop.io domain) ────────────────────
  // Same core: consignors upload item photos + consignment agreements
  // Instead of "monthly documents", they upload "consignment items"
  // The "late rate" becomes "items submitted vs items described at intake"
  'estate-sale': {
    vertical: 'estate-sale',
    productName: 'ConsignDrop',
    tagline: 'Your consignors submit. You sell. No paperwork chase.',
    practitionerLabel: 'Estate Sale Manager',
    clientLabel: 'Consignor',
    documentSetLabel: 'Consignment Items',
    primaryColor: '#7b4a2d',
    logoUrl: null,
    features: {
      aiDocumentCheck: true,   // Phase 1 for this vertical — AI checks photo quality
      voiceEntry: false,
      offlineMode: false,
      lateRateInsights: false,  // Different metric for this vertical
      zipDownload: true,
      whitelabelEmail: false,
    },
    defaultDocumentTypes: [
      { label: 'Item Photos (minimum 3 per item)', doc_type: 'receipt', required: true },
      { label: 'Signed Consignment Agreement', doc_type: 'other', required: true },
      { label: 'Proof of Ownership (if applicable)', doc_type: 'other', required: false },
    ],
    defaultReminderDays: [7, 3, 1], // Days BEFORE the sale, not day of month
    planLimits: { free: 5, starter: 25, pro: null },
  },

  // ─── EQUINE BOARDING (READY — needs barnDrop.io domain) ──────────────────
  // Boarding facility collects: annual vet records, coggins test, vaccination docs
  // Monthly: board payment receipts, farrier visit records
  equine: {
    vertical: 'equine',
    productName: 'BarnDrop',
    tagline: 'All your boarder records, organized and always current.',
    practitionerLabel: 'Barn Manager',
    clientLabel: 'Boarder',
    documentSetLabel: 'Horse Records',
    primaryColor: '#5c4a1e',
    logoUrl: null,
    features: {
      aiDocumentCheck: false,
      voiceEntry: false,
      offlineMode: false,
      lateRateInsights: true,
      zipDownload: true,
      whitelabelEmail: false,
    },
    defaultDocumentTypes: [
      { label: 'Current Coggins Test (annual)', doc_type: 'other', required: true },
      { label: 'Vaccination Records (annual)', doc_type: 'other', required: true },
      { label: 'Emergency Contact & Vet Info', doc_type: 'other', required: true },
      { label: 'Signed Boarding Contract', doc_type: 'other', required: true },
    ],
    defaultReminderDays: [1, 10, 20], // Monthly billing cycle
    planLimits: { free: 5, starter: 30, pro: null },
  },

  // ─── HOA (READY — needs hoaDrop.io domain) ──────────────────────────────
  // HOA board collects compliance docs from homeowners
  // Architectural change requests, rental registration, pet registration
  hoa: {
    vertical: 'hoa',
    productName: 'HoaDrop',
    tagline: 'Homeowner compliance documents, organized in one place.',
    practitionerLabel: 'HOA Manager',
    clientLabel: 'Homeowner',
    documentSetLabel: 'Compliance Documents',
    primaryColor: '#1a4a7a',
    logoUrl: null,
    features: {
      aiDocumentCheck: false,
      voiceEntry: false,
      offlineMode: false,
      lateRateInsights: false,
      zipDownload: true,
      whitelabelEmail: false,
    },
    defaultDocumentTypes: [
      { label: 'Architectural Change Request Form', doc_type: 'other', required: false },
      { label: 'Rental Registration (if applicable)', doc_type: 'other', required: false },
      { label: 'Pet Registration Form', doc_type: 'other', required: false },
      { label: 'Annual Assessment Acknowledgment', doc_type: 'other', required: true },
    ],
    defaultReminderDays: [1, 15], // Bi-monthly or annual cadence
    planLimits: { free: 10, starter: 50, pro: null },
  },

  // ─── CLEANING COMPANY (READY — needs proofDrop.io domain) ────────────────
  // Cleaning crews submit job completion proof (checklist + photos)
  // Client gets automatic notification, dispute prevention
  cleaning: {
    vertical: 'cleaning',
    productName: 'ProofDrop',
    tagline: 'Proof your crew cleaned. Every time. No disputes.',
    practitionerLabel: 'Cleaning Company',
    clientLabel: 'Location',
    documentSetLabel: 'Completion Proof',
    primaryColor: '#1a5c3a',
    logoUrl: null,
    features: {
      aiDocumentCheck: false,
      voiceEntry: false,
      offlineMode: false,
      lateRateInsights: false, // Different — track completion rate not lateness
      zipDownload: false,
      whitelabelEmail: false,
    },
    defaultDocumentTypes: [
      { label: 'Completed Cleaning Checklist', doc_type: 'other', required: true },
      { label: 'Before/After Photos', doc_type: 'receipt', required: true },
      { label: 'Issue Report (if any problems found)', doc_type: 'other', required: false },
    ],
    defaultReminderDays: [], // Cleaning is event-triggered, not calendar-triggered
    planLimits: { free: 3, starter: 20, pro: null },
  },
}

// Validate the vertical exists — fail loudly in development
if (!configs[VERTICAL]) {
  throw new Error(
    `Unknown tenant vertical: "${VERTICAL}". ` +
    `Valid values: ${Object.keys(configs).join(', ')}`
  )
}

export const tenantConfig: TenantConfig = configs[VERTICAL]

// Helper hooks — use these in components, never access tenantConfig directly
export const useIsVertical = (vertical: string) => VERTICAL === vertical
export const usePlanLimit = (plan: 'free' | 'starter' | 'pro') =>
  tenantConfig.planLimits[plan]
export const useFeature = (feature: keyof TenantConfig['features']) =>
  tenantConfig.features[feature]
