// src/components/practitioner/AuditReportPanel.tsx
// Displays duplicate detection, missing recurring items, unusual transactions, data quality grade.

import { cn } from '@/lib/utils'
import type {
  AuditReport,
  DuplicateGroup,
  MissingRecurringItem,
  UnusualTransaction,
} from '@/lib/duplicate-detector'
import {
  AlertTriangle, CheckCircle, Copy, Clock,
  XCircle, TrendingUp, AlertOctagon,
} from 'lucide-react'
import { Provenance } from '@/components/shared/Provenance'
import type { ProvenanceData } from '@/types/provenance'

/** Adapter: explain why this duplicate group was flagged. */
function duplicateProvenance(d: DuplicateGroup): ProvenanceData {
  return {
    type: 'rule',
    summary: 'Duplicate detection rule fired',
    detail: d.reason,
    confidence: d.confidence,
    citations: d.transactions.map((t, idx) => ({
      label: `Txn ${idx + 1}: ${t.description}`,
      meta: `${t.date} · $${Math.abs(t.amount).toFixed(2)}`,
    })),
  }
}

/** Adapter: explain why this recurring item is missing. */
function missingRecurringProvenance(m: MissingRecurringItem): ProvenanceData {
  return {
    type: 'computed',
    summary: `Missing expected recurring "${m.description}"`,
    detail: `Recurring detection looked for a transaction matching this vendor near ${m.expectedDate}. Last seen on ${m.lastSeen}.`,
    confidence: m.severity === 'critical' ? 'high' : 'medium',
    formula: 'recurringDetector(vendor, cycleDays=25..32, lastSeenDate)',
    citations: [
      { label: `Vendor pattern: ${m.description}`, meta: `Last seen: ${m.lastSeen}` },
    ],
  }
}

/** Adapter: explain why this transaction is unusual. */
function unusualProvenance(t: UnusualTransaction): ProvenanceData {
  return {
    type: 'computed',
    summary: `Unusual amount for "${t.description}"`,
    detail: `Z-score = ${t.zScore.toFixed(2)} (this transaction is ${t.zScore.toFixed(1)} standard deviations from this vendor's average of $${t.averageAmount.toFixed(2)}).`,
    confidence: t.severity === 'critical' ? 'high' : 'medium',
    formula: '(amount − vendorMean) / vendorStdDev',
    citations: [
      { label: `Vendor mean: $${t.averageAmount.toFixed(2)}` },
      { label: `This txn: $${Math.abs(t.amount).toFixed(2)}`, meta: t.date },
    ],
  }
}

interface Props {
  report: AuditReport
}

const gradeColors: Record<string, string> = {
  A: 'text-success border-success/30 bg-success/5',
  B: 'text-success border-success/20 bg-success/5',
  C: 'text-warning border-warning/30 bg-warning/5',
  D: 'text-danger border-danger/20 bg-danger/5',
  F: 'text-danger border-danger/30 bg-danger/10',
}

export function AuditReportPanel({ report }: Props) {
  const { duplicates, missingRecurring, unusualTransactions, summary } = report

  return (
    <div className="space-y-6">
      {/* Grade + Summary */}
      <div className="flex items-start gap-4">
        <div className={cn('flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 text-2xl font-black', gradeColors[report.grade])}>
          {report.grade}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Data Quality: {report.gradeExplanation}</h4>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1 text-danger">
              <AlertOctagon className="h-3.5 w-3.5" />
              {summary.criticalItems} critical
            </span>
            <span className="flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.warningItems} warnings
            </span>
            <span className="flex items-center gap-1 text-gray-500">
              {summary.potentialIssues} total issues
            </span>
            {summary.estimatedRiskAmount > 0 && (
              <span className="flex items-center gap-1 font-medium text-danger">
                ${summary.estimatedRiskAmount.toLocaleString()} at risk
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Potential Duplicates */}
      {duplicates.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Copy className="h-4 w-4 text-danger" />
            Potential Duplicates ({duplicates.length})
          </h4>
          <div className="space-y-2">
            {duplicates.map((dup, i) => (
              <div key={i} className="rounded-lg border border-danger/20 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      dup.confidence === 'high' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning',
                    )}>
                      {dup.confidence} confidence
                    </span>
                    <Provenance data={duplicateProvenance(dup)} />
                  </div>
                  <span className="text-xs font-medium text-danger">${dup.totalAmount.toFixed(2)} at risk</span>
                </div>
                <div className="space-y-1">
                  {dup.transactions.map((t, j) => (
                    <div key={j} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{t.date} — {t.description}</span>
                      <span className="font-medium text-gray-900">${Math.abs(t.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">{dup.reason}</p>
                <p className="mt-1 text-xs font-medium text-danger">{dup.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing Recurring */}
      {missingRecurring.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Clock className="h-4 w-4 text-warning" />
            Missing Recurring Items ({missingRecurring.length})
          </h4>
          <div className="space-y-2">
            {missingRecurring.map((item, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 rounded-lg border bg-white px-4 py-3',
                  item.severity === 'critical' ? 'border-danger/20' : 'border-warning/20',
                )}
              >
                {item.severity === 'critical' ? (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                ) : (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                )}
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900">{item.description}</p>
                      <Provenance data={missingRecurringProvenance(item)} variant="icon-only" />
                    </div>
                    <span className="text-sm font-medium text-gray-600">${item.expectedAmount.toFixed(2)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Expected ~{item.expectedDate} · Last seen {item.lastSeen} · {item.category}
                  </p>
                  <p className="mt-1 text-xs font-medium text-gray-700">{item.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unusual Transactions */}
      {unusualTransactions.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <TrendingUp className="h-4 w-4 text-primary" />
            Unusual Transactions ({unusualTransactions.length})
          </h4>
          <div className="space-y-2">
            {unusualTransactions.map((t, i) => (
              <div key={i} className="rounded-lg border border-primary/20 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900">{t.date} — {t.description}</p>
                      <Provenance data={unusualProvenance(t)} variant="icon-only" />
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{t.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">${Math.abs(t.amount).toFixed(2)}</p>
                    <p className="text-[10px] text-gray-400">avg ${t.averageAmount.toFixed(2)}</p>
                  </div>
                </div>
                <p className="mt-1 text-xs font-medium text-primary">{t.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clean bill of health */}
      {duplicates.length === 0 && missingRecurring.length === 0 && unusualTransactions.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-success/20 bg-success/5 py-8">
          <CheckCircle className="h-8 w-8 text-success" />
          <p className="text-sm font-medium text-success">All Clear — No Issues Detected</p>
          <p className="text-xs text-gray-500">No duplicates, missing items, or unusual transactions found.</p>
        </div>
      )}

      {/* Round numbers + weekend transactions summary */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h5 className="mb-2 text-xs font-semibold text-gray-700">Round Number Transactions</h5>
          {report.roundNumberTransactions.length > 0 ? (
            <div className="space-y-1">
              {report.roundNumberTransactions.slice(0, 5).map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{t.date} — {t.description}</span>
                  <span className="font-medium">${Math.abs(t.amount).toFixed(0)}</span>
                </div>
              ))}
              {report.roundNumberTransactions.length > 5 && (
                <p className="text-[10px] text-gray-400">+{report.roundNumberTransactions.length - 5} more</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">None found</p>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h5 className="mb-2 text-xs font-semibold text-gray-700">Weekend Business Transactions</h5>
          {report.weekendBusinessTransactions.length > 0 ? (
            <div className="space-y-1">
              {report.weekendBusinessTransactions.slice(0, 5).map((t, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{t.date} — {t.description}</span>
                  <span className="font-medium">${Math.abs(t.amount).toFixed(0)}</span>
                </div>
              ))}
              {report.weekendBusinessTransactions.length > 5 && (
                <p className="text-[10px] text-gray-400">+{report.weekendBusinessTransactions.length - 5} more</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400">None found</p>
          )}
        </div>
      </div>
    </div>
  )
}
