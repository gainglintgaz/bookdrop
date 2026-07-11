// src/lib/exceptions-queue.ts
// Default-path exception items for bookkeeper correction (without Analysis tab).
// Built from upload categorization_summary — honest placeholders when full txn
// text was not persisted on the upload row.

import type { DocumentUpload, RequirementWithUploads } from '@/types'
import { CATEGORIES } from './categorization-engine'

export interface ExceptionItem {
  /** Stable key for React + correction idempotency within session. */
  id: string
  uploadId: string
  filename: string
  requirementLabel: string
  /** Display description (may be synthetic when only summary exists). */
  description: string
  originalCategory: string
  confidence: 'low' | 'medium'
  /** Index among low-confidence items for this upload (1-based for copy). */
  lineIndex: number
  lineCount: number
}

const CATEGORY_LIST = Object.values(CATEGORIES)

/** Categories offered in the correction dropdown. */
export function correctionCategoryOptions(): string[] {
  return [...CATEGORY_LIST, 'Uncategorized']
}

/**
 * Expand upload-level categorization summaries into reviewable exception rows.
 * Uses lowConfidence count; labels rows from byCategory keys when available.
 */
export function buildExceptionItems(
  requirements: RequirementWithUploads[],
): ExceptionItem[] {
  const items: ExceptionItem[] = []

  for (const req of requirements) {
    for (const upload of req.uploads) {
      const summary = upload.categorization_summary
      if (!summary || summary.lowConfidence <= 0) continue

      const categoryHints = pickLowCategoryHints(summary.byCategory, summary.lowConfidence)
      for (let i = 0; i < summary.lowConfidence; i++) {
        const originalCategory = categoryHints[i] ?? 'Uncategorized'
        items.push({
          id: `${upload.id}:low:${i}`,
          uploadId: upload.id,
          filename: upload.filename_original,
          requirementLabel: req.label,
          description: describeExceptionLine(upload, i + 1, summary.lowConfidence, originalCategory),
          originalCategory,
          confidence: 'low',
          lineIndex: i + 1,
          lineCount: summary.lowConfidence,
        })
      }
    }
  }

  return items
}

function pickLowCategoryHints(
  byCategory: Record<string, number> | undefined,
  n: number,
): string[] {
  if (!byCategory || Object.keys(byCategory).length === 0) {
    return Array.from({ length: n }, () => 'Uncategorized')
  }
  // Prefer Uncategorized / ambiguous buckets first, then remaining categories.
  const preferred = Object.entries(byCategory).sort((a, b) => {
    const aUn = /uncategor/i.test(a[0]) ? 0 : 1
    const bUn = /uncategor/i.test(b[0]) ? 0 : 1
    if (aUn !== bUn) return aUn - bUn
    return b[1] - a[1]
  })
  const out: string[] = []
  for (const [cat, count] of preferred) {
    for (let i = 0; i < count && out.length < n; i++) {
      out.push(cat)
    }
  }
  while (out.length < n) out.push('Uncategorized')
  return out
}

function describeExceptionLine(
  upload: DocumentUpload,
  lineIndex: number,
  lineCount: number,
  originalCategory: string,
): string {
  const bank = upload.parsed_summary?.bankName
  const prefix = bank ? `${bank} · ` : ''
  return `${prefix}${upload.filename_original} — low-confidence line ${lineIndex} of ${lineCount} (suggested: ${originalCategory})`
}

export function countOpenExceptions(requirements: RequirementWithUploads[]): number {
  return buildExceptionItems(requirements).length
}
