// export-approve.ts — P5 human approve gate before accounting export.
// Package must be ready_for_review; bookkeeper must explicitly approve.
// No auto-push to QBO/Xero.

import type { PackageDraft } from './package-draft'
import type { StatementSummary } from './parse-bank-statement'
import {
  exportQBOCSV,
  exportXeroCSV,
  exportJournalEntries,
} from './export-qb'

export type ExportFormat = 'qbo_csv' | 'xero_csv' | 'journal_csv'

export interface ExportApproveRequest {
  packageDraft: PackageDraft
  /** Explicit human checkbox — must be true. */
  approvedByBookkeeper: boolean
  format: ExportFormat
  businessName: string
  statements: StatementSummary[]
}

export type ExportApproveResult =
  | { ok: true; format: ExportFormat; message: string }
  | { ok: false; error: string }

/**
 * Gate: package ready + human approve + real transactions.
 * On success, triggers existing download helpers (side effect).
 */
export function approveAndExport(req: ExportApproveRequest): ExportApproveResult {
  if (!req.approvedByBookkeeper) {
    return {
      ok: false,
      error: 'Export blocked — confirm “I reviewed this package” before download.',
    }
  }
  if (req.packageDraft.status !== 'ready_for_review') {
    return {
      ok: false,
      error: `Export blocked — package is "${req.packageDraft.status}", not ready_for_review. ${req.packageDraft.label}`,
    }
  }

  const txns = req.statements.flatMap(s =>
    s.transactions.map(t => ({
      date: t.date,
      description: t.description,
      amount: Math.abs(t.amount),
      type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
      category: t.category,
    })),
  )

  if (txns.length === 0) {
    return {
      ok: false,
      error: 'Export blocked — no parsed transactions in this period. Parse statements on Power tools or Recon first.',
    }
  }

  try {
    switch (req.format) {
      case 'qbo_csv':
        exportQBOCSV(txns, req.businessName)
        break
      case 'xero_csv':
        exportXeroCSV(txns, req.businessName)
        break
      case 'journal_csv':
        exportJournalEntries(txns, req.businessName)
        break
      default:
        return { ok: false, error: `Unknown format` }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed'
    return { ok: false, error: message }
  }

  return {
    ok: true,
    format: req.format,
    message: `Exported ${txns.length} lines as ${req.format}. Not posted to your GL — import manually or connect OAuth later.`,
  }
}
