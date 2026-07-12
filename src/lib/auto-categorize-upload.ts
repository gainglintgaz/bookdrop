// src/lib/auto-categorize-upload.ts
// AI-first pivot D.1: auto-categorization at the upload moment.
//
// Replaces the prior "click Analyze tab to categorize" flow. When a client
// uploads a bank or credit-card statement, this function:
//   1. Decides whether the document is parseable (bank/CC vs receipt/payroll/etc)
//   2. Parses it using the existing engine
//   3. Runs categorization on the transactions
//   4. Returns lightweight summaries to be stored on the upload row
//
// The returned summaries are intentionally small (no transaction-level data)
// so the upload row stays compact. Full per-transaction data lives in the
// parser's working memory and is re-derived when the bookkeeper opens the
// Analysis tab.
//
// Aligned with DATA_FLYWHEEL.md §D.1 + ai-first-principles.md §3 Trust Ladder
// (Loop 0: works at first upload; Loop 2+: per-firm rules tighten confidence).

import {
  parseCSVStatement,
  parseBankStatementPDF,
  type StatementSummary,
} from './parse-bank-statement'
import { categorizeTransactions } from './categorization-engine'
import { getLearnedCategory } from './category-memory'
import type {
  DocType,
  ParsedStatementSummary,
  UploadCategorizationSummary,
} from '@/types'

/** What document types should auto-categorization run on? */
export function shouldAutoCategorize(docType: DocType): boolean {
  // Bank statements + credit card statements are parseable and categorizable.
  // Receipts, payroll, 1099s, W-2s use different intelligence (OCR + form recognition)
  // and aren't included in the V1 auto-categorization scope.
  return docType === 'bank' || docType === 'credit_card'
}

/** Whether the file extension suggests we can parse it. */
function isParseableFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return lower.endsWith('.pdf') || lower.endsWith('.csv')
}

/** One line ready to insert into document_line_items (id assigned on insert). */
export interface AutoCategorizedLineDraft {
  line_index: number
  txn_date: string | null
  description_raw: string
  description_display: string
  amount_cents: number
  amount_sign: 'credit' | 'debit'
  suggested_category: string
  suggested_subcategory: string | null
  confidence: 'high' | 'medium' | 'low'
  matched_vendor: string | null
  source_kind: 'statement_parse' | 'pdf_parse' | 'csv_import'
  source_rule: string | null
  engine_version: string
}

export interface AutoCategorizationResult {
  parsedSummary: ParsedStatementSummary
  categorizationSummary: UploadCategorizationSummary
  /** Aggregate confidence — derived from the per-transaction confidence distribution. */
  aggregateConfidence: 'high' | 'medium' | 'low'
  /** Line-level drafts for document_line_items (Phase 1). */
  lines: AutoCategorizedLineDraft[]
}

/**
 * Run auto-categorization on a single uploaded file.
 *
 * Returns null if:
 * - the doc type is not auto-categorizable (receipt, payroll, etc.)
 * - the file extension is not supported
 * - parsing failed (returns null rather than throwing — the upload itself
 *   should NEVER fail because categorization couldn't run)
 *
 * Logs to console.warn on parse failure with context so the bookkeeper can
 * troubleshoot via the Analysis tab.
 */
export async function autoCategorizeUpload(
  file: File,
  docType: DocType,
  opts?: { clientId?: string },
): Promise<AutoCategorizationResult | null> {
  if (!shouldAutoCategorize(docType)) return null
  if (!isParseableFile(file.name)) return null

  let statement: StatementSummary
  try {
    if (file.name.toLowerCase().endsWith('.csv')) {
      statement = await parseCSVStatement(file)
    } else {
      statement = await parseBankStatementPDF(file)
    }
  } catch (err) {
    console.warn(
      '[autoCategorizeUpload] Parse failed for',
      file.name,
      '— upload succeeds, categorization will run later when bookkeeper opens Analysis tab.',
      err,
    )
    return null
  }

  const sourceKind: AutoCategorizedLineDraft['source_kind'] = file.name
    .toLowerCase()
    .endsWith('.csv')
    ? 'csv_import'
    : 'pdf_parse'

  if (statement.transactions.length === 0) {
    // Parsed but empty. Still record a parsed summary so the upload row reflects
    // that we tried, and so the bookkeeper sees "0 transactions extracted" rather
    // than "categorization never ran".
    return {
      parsedSummary: toParsedSummary(statement),
      categorizationSummary: emptyCategorizationSummary(),
      aggregateConfidence: 'low',
      lines: [],
    }
  }

  // Map ParsedTransaction → categorization-engine input shape
  const txns = statement.transactions.map(t => ({
    date: t.date,
    description: t.description,
    amount: Math.abs(t.amount),
    type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
    category: t.category,
  }))

  const report = categorizeTransactions(txns)

  // Phase 5: apply per-client learned corrections before writing lines
  if (opts?.clientId) {
    applyClientCategoryMemory(report, opts.clientId)
  }

  const lines = toLineDrafts(statement, report, sourceKind)

  return {
    parsedSummary: toParsedSummary(statement),
    categorizationSummary: toCategorizationSummary(report),
    aggregateConfidence: deriveAggregateConfidence(report),
    lines,
  }
}

/**
 * Override engine categories with this client's learned map.
 * Never uses another client's corrections.
 */
function applyClientCategoryMemory(
  report: {
    transactions: Array<{
      originalDescription: string
      cleanedDescription: string
      category: string
      subcategory: string
      confidence: 'high' | 'medium' | 'low'
      matchedVendor: string | null
      flags: string[]
    }>
    summary: {
      totalCategorized: number
      highConfidence: number
      mediumConfidence: number
      lowConfidence: number
    }
  },
  clientId: string,
): void {
  let hi = 0
  let med = 0
  let lo = 0

  for (const t of report.transactions) {
    const learned = getLearnedCategory(clientId, t.originalDescription || t.cleanedDescription)
    if (learned && learned.category) {
      t.category = learned.category
      t.subcategory = learned.subcategory || t.subcategory
      // Learned from human correction → treat as high confidence for this client
      t.confidence = learned.confidence >= 2 ? 'high' : 'medium'
      t.matchedVendor = t.matchedVendor ?? 'client_memory'
      if (!t.flags.includes('client_memory')) {
        t.flags.push('client_memory')
      }
    }
    if (t.confidence === 'high') hi++
    else if (t.confidence === 'medium') med++
    else lo++
  }

  report.summary.highConfidence = hi
  report.summary.mediumConfidence = med
  report.summary.lowConfidence = lo
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toParsedSummary(s: StatementSummary): ParsedStatementSummary {
  return {
    bankName: s.bankName,
    accountLast4:
      s.creditCard?.accountLast4 ??
      null,
    openingBalance: s.openingBalance,
    closingBalance: s.closingBalance,
    totalCredits: s.totalCredits,
    totalDebits: s.totalDebits,
    transactionCount: s.transactions.length,
  }
}

function emptyCategorizationSummary(): UploadCategorizationSummary {
  return {
    totalCategorized: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
    byCategory: {},
    flagsCount: 0,
  }
}

interface CategorizationReportLike {
  transactions: Array<{ category: string; confidence: 'high' | 'medium' | 'low'; flags: string[] }>
  summary: { totalCategorized: number; highConfidence: number; mediumConfidence: number; lowConfidence: number }
}

function toCategorizationSummary(r: CategorizationReportLike): UploadCategorizationSummary {
  const byCategory: Record<string, number> = {}
  let flagsCount = 0
  for (const t of r.transactions) {
    byCategory[t.category] = (byCategory[t.category] ?? 0) + 1
    flagsCount += t.flags.length
  }
  return {
    totalCategorized: r.summary.totalCategorized,
    highConfidence: r.summary.highConfidence,
    mediumConfidence: r.summary.mediumConfidence,
    lowConfidence: r.summary.lowConfidence,
    byCategory,
    flagsCount,
  }
}

/**
 * Derive an aggregate confidence tier from the per-transaction confidence
 * distribution. Used to populate `auto_categorization_confidence` on the
 * upload row.
 *
 * Rules:
 *   • 'high' if ≥70% of transactions are high confidence
 *   • 'low'  if ≥40% are low confidence
 *   • 'medium' otherwise
 *
 * These thresholds are intentionally conservative — over-claiming confidence
 * on a sparse-data run breaks the trust ladder (ai-first-principles.md §3).
 */
export function deriveAggregateConfidence(r: CategorizationReportLike): 'high' | 'medium' | 'low' {
  const total = r.summary.totalCategorized
  if (total === 0) return 'low'
  const hiPct = r.summary.highConfidence / total
  const loPct = r.summary.lowConfidence / total
  if (loPct >= 0.4) return 'low'
  if (hiPct >= 0.7) return 'high'
  return 'medium'
}

const ENGINE_VERSION = 'categorize-v1'

function toLineDrafts(
  statement: StatementSummary,
  report: {
    transactions: Array<{
      originalDescription: string
      cleanedDescription: string
      category: string
      subcategory: string
      confidence: 'high' | 'medium' | 'low'
      matchedVendor: string | null
    }>
  },
  sourceKind: AutoCategorizedLineDraft['source_kind'],
): AutoCategorizedLineDraft[] {
  const n = Math.min(statement.transactions.length, report.transactions.length)
  const lines: AutoCategorizedLineDraft[] = []
  for (let i = 0; i < n; i++) {
    const raw = statement.transactions[i]
    const cat = report.transactions[i]
    const amountCents = Math.round(Math.abs(raw.amount) * 100)
    const sign: 'credit' | 'debit' = raw.amount >= 0 ? 'credit' : 'debit'
    lines.push({
      line_index: i,
      txn_date: parseTxnDate(raw.date),
      description_raw: raw.description,
      description_display: cat.cleanedDescription || raw.description,
      amount_cents: amountCents,
      amount_sign: sign,
      suggested_category: cat.category,
      suggested_subcategory: cat.subcategory || null,
      confidence: cat.confidence,
      matched_vendor: cat.matchedVendor,
      source_kind: sourceKind,
      source_rule:
        cat.matchedVendor === 'client_memory'
          ? 'client_memory'
          : cat.matchedVendor
            ? `vendor:${cat.matchedVendor}`
            : null,
      engine_version: ENGINE_VERSION,
    })
  }
  return lines
}

/** Best-effort date for storage; null if unparseable (honest, not invented). */
function parseTxnDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null
  // MM/DD/YYYY or MM/DD
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  let year = m[3] ? Number(m[3]) : new Date().getFullYear()
  if (year < 100) year += 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
