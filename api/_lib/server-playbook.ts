// server-playbook.ts — Node-safe allowlisted steps for cron prep.
// Uses pure engines only (no PDF.js). Human package approve still required.

import { categorizeTransactions } from '../../src/lib/categorization-engine.js'
import { runAuditChecks } from '../../src/lib/duplicate-detector.js'

export interface ServerTxn {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  category?: string
}

export interface ServerPlaybookStep {
  name: string
  status: 'complete' | 'skipped' | 'failed'
  durationMs: number
  resultSummary: string
}

export interface ServerPlaybookResult {
  steps: ServerPlaybookStep[]
  alerts: string[]
  status: 'complete' | 'partial' | 'failed'
  readinessScore: number
  totalTransactions: number
}

function timed(name: string, fn: () => string): ServerPlaybookStep {
  const start = Date.now()
  try {
    const resultSummary = fn()
    return { name, status: 'complete', durationMs: Date.now() - start, resultSummary }
  } catch (err) {
    return {
      name,
      status: 'failed',
      durationMs: Date.now() - start,
      resultSummary: `Failed: ${err instanceof Error ? err.message : 'unknown'}`,
    }
  }
}

/**
 * Run extract → categorize → audit when transactions exist.
 * Completeness/package handled separately with requirement counts.
 */
export function runServerExtractCategorizeAudit(params: {
  transactions: ServerTxn[]
}): ServerPlaybookResult {
  const alerts: string[] = []
  const steps: ServerPlaybookStep[] = []
  const mapped = params.transactions

  steps.push(
    timed('Extract & map transactions', () => {
      if (mapped.length === 0) throw new Error('No transactions extracted from storage CSVs')
      return `Extracted ${mapped.length} transactions from storage parse`
    }),
  )

  if (mapped.length === 0) {
    return {
      steps,
      alerts: ['No transactions — skipped categorize/audit'],
      status: 'failed',
      readinessScore: 0,
      totalTransactions: 0,
    }
  }

  steps.push(
    timed('Auto-categorize', () => {
      const report = categorizeTransactions(
        mapped.map(t => ({
          description: t.description,
          amount: t.type === 'debit' ? -t.amount : t.amount,
          date: t.date,
        })),
      )
      const total = report.summary.totalCategorized
      const highMed = report.summary.highConfidence + report.summary.mediumConfidence
      const rate = total > 0 ? Math.round((highMed / total) * 100) : 0
      if (report.summary.lowConfidence > total * 0.3 && total > 0) {
        alerts.push(
          `${report.summary.lowConfidence} low-confidence categorizations — review on Period Desk → Exceptions`,
        )
      }
      return `${total} categorized (${rate}% high/medium), ${report.summary.flaggedCount} flagged`
    }),
  )

  steps.push(
    timed('Duplicate & anomaly detection', () => {
      const audit = runAuditChecks(
        mapped.map(t => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          type: t.type,
          category: t.category,
        })),
      )
      if (audit.duplicates.length > 0) {
        alerts.push(`${audit.duplicates.length} potential duplicate(s)`)
      }
      if (audit.unusualTransactions.length > 0) {
        alerts.push(`${audit.unusualTransactions.length} unusual transaction(s)`)
      }
      return `Grade ${audit.grade}: ${audit.duplicates.length} duplicates, ${audit.unusualTransactions.length} anomalies`
    }),
  )

  const failed = steps.filter(s => s.status === 'failed').length
  const status: ServerPlaybookResult['status'] =
    failed === 0 ? 'complete' : failed < steps.length ? 'partial' : 'failed'

  let readinessScore = 50
  if (steps.every(s => s.status === 'complete')) readinessScore = 75
  readinessScore = Math.max(0, readinessScore - failed * 20)

  return {
    steps,
    alerts,
    status,
    readinessScore,
    totalTransactions: mapped.length,
  }
}
