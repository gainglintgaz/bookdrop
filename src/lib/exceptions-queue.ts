// src/lib/exceptions-queue.ts
// Default-path exception items — prefer real document_line_items (Phase 1).
// Fallback: summary-based placeholders only when lines missing (legacy uploads).

import type { DocumentLineItem, DocumentUpload, RequirementWithUploads } from '@/types'
import { CATEGORIES } from './categorization-engine'

export interface ExceptionItem {
  id: string
  uploadId: string
  lineId: string | null
  filename: string
  requirementLabel: string
  description: string
  originalCategory: string
  confidence: 'low' | 'medium' | 'high'
  amountCents: number | null
  sourceKind: string | null
  sourceRule: string | null
  lineIndex: number
  lineCount: number
  /** true = backed by document_line_items row */
  hasLineEvidence: boolean
}

const CATEGORY_LIST = Object.values(CATEGORIES)

export function correctionCategoryOptions(): string[] {
  return [...CATEGORY_LIST, 'Uncategorized']
}

/** Build exception items from real line rows (preferred). */
export function buildExceptionItemsFromLines(
  lines: DocumentLineItem[],
  requirements: RequirementWithUploads[],
): ExceptionItem[] {
  const uploadMeta = new Map<string, { filename: string; label: string }>()
  for (const req of requirements) {
    for (const u of req.uploads) {
      uploadMeta.set(u.id, { filename: u.filename_original, label: req.label })
    }
  }

  const open = lines.filter(
    l =>
      l.confirmed_at == null &&
      (l.confidence === 'low' || !l.final_category),
  )

  return open.map(l => {
    const meta = uploadMeta.get(l.upload_id)
    const amt =
      l.amount_sign === 'debit'
        ? -l.amount_cents
        : l.amount_cents
    const amtStr =
      l.amount_cents != null
        ? ` · $${(Math.abs(l.amount_cents) / 100).toFixed(2)}`
        : ''
    return {
      id: l.id,
      uploadId: l.upload_id,
      lineId: l.id,
      filename: meta?.filename ?? 'upload',
      requirementLabel: meta?.label ?? 'Document',
      description: `${l.description_display || l.description_raw}${amtStr}`,
      originalCategory: l.suggested_category ?? 'Uncategorized',
      confidence: l.confidence ?? 'low',
      amountCents: amt,
      sourceKind: l.source_kind,
      sourceRule: l.source_rule,
      lineIndex: l.line_index + 1,
      lineCount: open.filter(x => x.upload_id === l.upload_id).length,
      hasLineEvidence: true,
    }
  })
}

/**
 * Expand upload-level categorization summaries into reviewable exception rows.
 * Used only when no line rows exist (legacy). Marked hasLineEvidence: false.
 */
export function buildExceptionItemsFromSummaries(
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
          lineId: null,
          filename: upload.filename_original,
          requirementLabel: req.label,
          description: describeExceptionLine(upload, i + 1, summary.lowConfidence, originalCategory),
          originalCategory,
          confidence: 'low',
          amountCents: null,
          sourceKind: null,
          sourceRule: null,
          lineIndex: i + 1,
          lineCount: summary.lowConfidence,
          hasLineEvidence: false,
        })
      }
    }
  }

  return items
}

/** Prefer lines; fall back to summaries with honest flag. */
export function buildExceptionItems(
  requirements: RequirementWithUploads[],
  lines?: DocumentLineItem[],
): ExceptionItem[] {
  if (lines && lines.length > 0) {
    return buildExceptionItemsFromLines(lines, requirements)
  }
  return buildExceptionItemsFromSummaries(requirements)
}

export function countOpenExceptions(
  requirements: RequirementWithUploads[],
  lines?: DocumentLineItem[],
): number {
  return buildExceptionItems(requirements, lines).length
}

function pickLowCategoryHints(
  byCategory: Record<string, number> | undefined,
  n: number,
): string[] {
  if (!byCategory || Object.keys(byCategory).length === 0) {
    return Array.from({ length: n }, () => 'Uncategorized')
  }
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
  return `${prefix}${upload.filename_original} — low-confidence line ${lineIndex} of ${lineCount} (suggested: ${originalCategory}). Re-upload or re-parse for full line evidence.`
}
