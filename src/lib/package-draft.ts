// src/lib/package-draft.ts
// P3 — Month package auto-draft when completeness gates pass.
// Pure evaluation only (no downloads). UI calls finance-prep / download-zip.

import type { RequirementWithUploads } from '@/types'
import type { StatementSummary } from './parse-bank-statement'
import {
  runCompletenessChecks,
  type CompletenessReport,
} from './completeness-check'

export type PackageDraftStatus = 'not_started' | 'incomplete' | 'ready_for_review'

export interface PackageDraft {
  status: PackageDraftStatus
  /** User-facing label — never invent progress. */
  label: string
  completeness: CompletenessReport
  period: { year: number; month: number }
  uploadCount: number
  requiredCount: number
  requiredUploadedCount: number
  /** True when bookkeeper can download package HTML + ZIP of sources. */
  canDownloadPackage: boolean
  canDownloadZip: boolean
  /** Set when status becomes ready_for_review (client-side draft moment). */
  draftedAt: string | null
  missingItems: string[]
}

/**
 * Auto-draft gate: all required docs present (completeness readyForBookkeeper)
 * AND at least one upload exists for the period.
 *
 * Warnings (file size, dups) do NOT block ready_for_review — they stay on the report.
 * Fail severity on required docs blocks readiness.
 */
export function evaluatePackageDraft(
  requirements: RequirementWithUploads[],
  year: number,
  month: number,
  parsedStatements?: StatementSummary[],
): PackageDraft {
  const completeness = runCompletenessChecks(requirements, parsedStatements)
  const uploadCount = requirements.reduce((n, r) => n + r.uploads.length, 0)
  const requiredCount = requirements.filter(r => r.required).length
  const requiredUploadedCount = requirements.filter(r => r.required && r.uploads.length > 0).length

  if (uploadCount === 0) {
    return {
      status: 'not_started',
      label: 'No uploads yet — package drafts when required docs are in',
      completeness,
      period: { year, month },
      uploadCount,
      requiredCount,
      requiredUploadedCount,
      canDownloadPackage: false,
      canDownloadZip: false,
      draftedAt: null,
      missingItems: completeness.missingItems,
    }
  }

  if (!completeness.readyForBookkeeper) {
    return {
      status: 'incomplete',
      label: completeness.missingItems.length > 0
        ? `Package blocked — missing: ${completeness.missingItems.join(', ')}`
        : 'Package incomplete — finish required documents',
      completeness,
      period: { year, month },
      uploadCount,
      requiredCount,
      requiredUploadedCount,
      canDownloadPackage: false,
      canDownloadZip: uploadCount > 0,
      draftedAt: null,
      missingItems: completeness.missingItems,
    }
  }

  // Completeness passed → auto-draft ready for human review (no auto-post).
  return {
    status: 'ready_for_review',
    label: 'Package ready for review',
    completeness,
    period: { year, month },
    uploadCount,
    requiredCount,
    requiredUploadedCount,
    canDownloadPackage: true,
    canDownloadZip: uploadCount > 0,
    draftedAt: new Date().toISOString(),
    missingItems: [],
  }
}
