// receipt-to-lines.ts — P3 capture expansion: receipt scan → same line spine.
// Maps ScannedDocument extracted fields into AutoCategorizedLineDraft for document_line_items.

import type { AutoCategorizedLineDraft } from './auto-categorize-upload'
import type { ScannedDocument } from './receipt-scanner'
import { getLearnedCategory } from './category-memory'

const ENGINE_VERSION = 'receipt-capture-v1'

/**
 * Convert one scanned receipt into a single line draft (or empty if no amount).
 * Money as integer cents. Never fabricates vendor if OCR empty.
 */
export function receiptToLineDrafts(
  doc: ScannedDocument,
  opts?: { clientId?: string; lineIndexStart?: number },
): AutoCategorizedLineDraft[] {
  const amount = doc.extractedData.possibleAmount
  if (amount == null || !Number.isFinite(amount) || amount === 0) {
    return []
  }

  const rawVendor = (doc.extractedData.possibleVendor ?? '').trim()
  const descriptionRaw =
    rawVendor ||
    (doc.ocrText ? doc.ocrText.slice(0, 120).replace(/\s+/g, ' ').trim() : '') ||
    doc.filename

  const amountCents = Math.round(Math.abs(amount) * 100)
  let category = doc.extractedData.possibleCategory ?? 'Uncategorized'
  let subcategory: string | null = null
  let confidence: 'high' | 'medium' | 'low' = rawVendor ? 'medium' : 'low'
  let sourceRule: string | null = rawVendor ? `receipt_ocr:${rawVendor.slice(0, 40)}` : 'receipt_ocr'

  if (opts?.clientId && descriptionRaw) {
    const learned = getLearnedCategory(opts.clientId, descriptionRaw)
    if (learned) {
      category = learned.category
      subcategory = learned.subcategory || null
      confidence = learned.confidence >= 2 ? 'high' : 'medium'
      sourceRule = 'client_memory'
    }
  }

  const txnDate = doc.extractedData.possibleDate
  const line: AutoCategorizedLineDraft = {
    line_index: opts?.lineIndexStart ?? 0,
    txn_date: txnDate && /^\d{4}-\d{2}-\d{2}/.test(txnDate) ? txnDate.slice(0, 10) : null,
    description_raw: descriptionRaw,
    description_display: descriptionRaw.slice(0, 80),
    amount_cents: amountCents,
    amount_sign: amount >= 0 ? 'debit' : 'credit', // expense receipts default debit
    suggested_category: category,
    suggested_subcategory: subcategory,
    confidence,
    matched_vendor: rawVendor || null,
    source_kind: 'pdf_parse', // closest allowlisted kind for image OCR path
    source_rule: sourceRule,
    engine_version: ENGINE_VERSION,
  }

  return [line]
}

/** Batch helper for a scan session. */
export function receiptsToLineDrafts(
  docs: ScannedDocument[],
  opts?: { clientId?: string },
): AutoCategorizedLineDraft[] {
  const out: AutoCategorizedLineDraft[] = []
  let idx = 0
  for (const doc of docs) {
    const lines = receiptToLineDrafts(doc, { clientId: opts?.clientId, lineIndexStart: idx })
    for (const l of lines) {
      out.push({ ...l, line_index: idx })
      idx += 1
    }
  }
  return out
}
