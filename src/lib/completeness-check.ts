// src/lib/completeness-check.ts
// Pre-work completeness checker — verifies a client's monthly package
// is ready for the bookkeeper to start working.
// Runs entirely client-side. No API calls.

import type { RequirementWithUploads } from '@/types'
import type { StatementSummary } from './parse-bank-statement'

export type CheckSeverity = 'pass' | 'warning' | 'fail'

export interface CompletenessCheck {
  id: string
  label: string
  severity: CheckSeverity
  detail: string
}

export interface CompletenessReport {
  checks: CompletenessCheck[]
  score: number          // 0-100
  readyForBookkeeper: boolean
  missingItems: string[]
  warnings: string[]
}

/** Run all completeness checks for a client's monthly document package */
export function runCompletenessChecks(
  requirements: RequirementWithUploads[],
  parsedStatements?: StatementSummary[],
): CompletenessReport {
  const checks: CompletenessCheck[] = []

  // 1. Required documents check
  const requiredReqs = requirements.filter(r => r.required)
  const missingRequired = requiredReqs.filter(r => r.uploads.length === 0)
  checks.push({
    id: 'required-docs',
    label: 'Required documents',
    severity: missingRequired.length === 0 ? 'pass' : 'fail',
    detail: missingRequired.length === 0
      ? `All ${requiredReqs.length} required documents received`
      : `Missing ${missingRequired.length} of ${requiredReqs.length}: ${missingRequired.map(r => r.label).join(', ')}`,
  })

  // 2. Bank statement coverage
  const bankReqs = requirements.filter(r => r.doc_type === 'bank')
  const bankWithUploads = bankReqs.filter(r => r.uploads.length > 0)
  if (bankReqs.length > 0) {
    checks.push({
      id: 'bank-coverage',
      label: 'Bank statements',
      severity: bankWithUploads.length === bankReqs.length ? 'pass' : bankWithUploads.length > 0 ? 'warning' : 'fail',
      detail: `${bankWithUploads.length}/${bankReqs.length} bank statements received`,
    })
  }

  // 3. Credit card coverage
  const ccReqs = requirements.filter(r => r.doc_type === 'credit_card')
  const ccWithUploads = ccReqs.filter(r => r.uploads.length > 0)
  if (ccReqs.length > 0) {
    checks.push({
      id: 'cc-coverage',
      label: 'Credit card statements',
      severity: ccWithUploads.length === ccReqs.length ? 'pass' : ccWithUploads.length > 0 ? 'warning' : 'fail',
      detail: `${ccWithUploads.length}/${ccReqs.length} credit card statements received`,
    })
  }

  // 4. Payroll coverage
  const payrollReqs = requirements.filter(r => r.doc_type === 'payroll')
  const payrollWithUploads = payrollReqs.filter(r => r.uploads.length > 0)
  if (payrollReqs.length > 0) {
    checks.push({
      id: 'payroll-coverage',
      label: 'Payroll reports',
      severity: payrollWithUploads.length === payrollReqs.length ? 'pass' : 'warning',
      detail: payrollWithUploads.length === payrollReqs.length
        ? 'All payroll reports received'
        : `${payrollWithUploads.length}/${payrollReqs.length} payroll reports received`,
    })
  }

  // 5. File size sanity check (bank statements should be > 10KB)
  const suspiciousFiles = requirements.flatMap(r =>
    r.uploads.filter(u => u.file_size_bytes < 10_000 && r.doc_type === 'bank')
  )
  if (suspiciousFiles.length > 0) {
    checks.push({
      id: 'file-size',
      label: 'File size check',
      severity: 'warning',
      detail: `${suspiciousFiles.length} bank statement(s) are under 10KB — may be incomplete or wrong file`,
    })
  }

  // 6. Duplicate file check
  const allFilenames = requirements.flatMap(r => r.uploads.map(u => u.filename_original.toLowerCase()))
  const duplicates = allFilenames.filter((name, i) => allFilenames.indexOf(name) !== i)
  if (duplicates.length > 0) {
    checks.push({
      id: 'duplicates',
      label: 'Duplicate files',
      severity: 'warning',
      detail: `Possible duplicates: ${[...new Set(duplicates)].join(', ')}`,
    })
  }

  // 7. Parsed statement checks (if available)
  if (parsedStatements && parsedStatements.length > 0) {
    // Check for zero-transaction statements
    const emptyStatements = parsedStatements.filter(s => s.transactions.length === 0)
    if (emptyStatements.length > 0) {
      checks.push({
        id: 'empty-statements',
        label: 'Empty statements',
        severity: 'warning',
        detail: `${emptyStatements.length} statement(s) had no extractable transactions — may need manual review`,
      })
    }

    // Check balance continuity across statements
    for (const stmt of parsedStatements) {
      if (stmt.openingBalance !== null && stmt.closingBalance !== null) {
        const expectedClosing = stmt.openingBalance + stmt.totalCredits - stmt.totalDebits
        const diff = Math.abs(expectedClosing - stmt.closingBalance)
        if (diff > 0.02) {
          checks.push({
            id: `balance-${stmt.bankName ?? 'unknown'}`,
            label: `Balance check — ${stmt.bankName ?? 'Statement'}`,
            severity: 'warning',
            detail: `Opening + credits - debits = ${expectedClosing.toFixed(2)}, but closing balance is ${stmt.closingBalance.toFixed(2)} (diff: $${diff.toFixed(2)})`,
          })
        }
      }
    }

    // Uncategorized transaction count
    const totalTxns = parsedStatements.reduce((sum, s) => sum + s.transactions.length, 0)
    const uncategorized = parsedStatements.reduce(
      (sum, s) => sum + s.transactions.filter(t => t.category === 'Uncategorized').length,
      0,
    )
    if (totalTxns > 0) {
      const pct = Math.round((1 - uncategorized / totalTxns) * 100)
      checks.push({
        id: 'categorization',
        label: 'Auto-categorization',
        severity: pct >= 70 ? 'pass' : 'warning',
        detail: `${pct}% of transactions auto-categorized (${totalTxns - uncategorized}/${totalTxns}). ${uncategorized} need manual review.`,
      })
    }
  }

  // Calculate score
  const passCount = checks.filter(c => c.severity === 'pass').length
  const warnCount = checks.filter(c => c.severity === 'warning').length
  const failCount = checks.filter(c => c.severity === 'fail').length
  const total = checks.length
  const score = total > 0 ? Math.round(((passCount + warnCount * 0.5) / total) * 100) : 0

  return {
    checks,
    score,
    readyForBookkeeper: failCount === 0,
    missingItems: missingRequired.map(r => r.label),
    warnings: checks.filter(c => c.severity === 'warning').map(c => c.detail),
  }
}
