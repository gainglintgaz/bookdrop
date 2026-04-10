// src/components/practitioner/ExpensePolicyPanel.tsx
// Displays expense policy compliance check results.

import { cn } from '@/lib/utils'
import type { PolicyReport } from '@/lib/expense-policy'
import { downloadPolicyReport } from '@/lib/expense-policy'
import {
  ShieldCheck, AlertTriangle, CheckCircle, XCircle,
  Download,
} from 'lucide-react'

interface Props {
  report: PolicyReport
  businessName: string
}

const gradeStyles: Record<string, string> = {
  'Compliant': 'text-success border-success/30 bg-success/5',
  'Minor Issues': 'text-warning border-warning/30 bg-warning/5',
  'Needs Review': 'text-danger border-danger/20 bg-danger/5',
  'Non-Compliant': 'text-danger border-danger/30 bg-danger/10',
}

export function ExpensePolicyPanel({ report, businessName }: Props) {
  return (
    <div className="space-y-6">
      {/* Grade + Summary */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className={cn(
            'flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-bold',
            gradeStyles[report.grade] ?? 'text-gray-600 border-gray-200 bg-gray-50',
          )}>
            <ShieldCheck className="h-5 w-5" />
            {report.grade}
          </div>
          <div>
            <p className="text-sm text-gray-700">{report.summary}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle className="h-3.5 w-3.5" />
                {report.compliant} compliant
              </span>
              <span className="flex items-center gap-1 text-danger">
                <XCircle className="h-3.5 w-3.5" />
                {report.violations.length} violations
              </span>
              <span className="text-gray-500">
                {report.violationRate.toFixed(1)}% violation rate
              </span>
              {report.totalAtRisk > 0 && (
                <span className="font-medium text-danger">
                  ${report.totalAtRisk.toLocaleString()} at risk
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => downloadPolicyReport(report, businessName)}
          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Download className="h-3.5 w-3.5" />
          Download Report
        </button>
      </div>

      {/* Violations by Rule */}
      {report.byRule.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Violations by Policy Rule</h4>
          <div className="space-y-2">
            {report.byRule.map(rule => (
              <div key={rule.ruleId} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{rule.ruleName}</p>
                  <p className="text-xs text-gray-500">{rule.count} violation{rule.count !== 1 ? 's' : ''}</p>
                </div>
                <span className="text-sm font-semibold text-danger">${rule.totalAmount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Individual Violations */}
      {report.violations.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">
            Violations ({report.violations.length})
          </h4>
          <div className="space-y-2">
            {report.violations.slice(0, 15).map((v, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg border bg-white px-4 py-3',
                  v.severity === 'critical' ? 'border-danger/20' :
                  v.severity === 'warning' ? 'border-warning/20' :
                  'border-gray-200',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    {v.severity === 'critical' ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                    ) : v.severity === 'warning' ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    ) : (
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <div>
                      <p className="text-sm text-gray-900">{v.transactionDate} — {v.transactionDescription}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{v.explanation}</p>
                      <p className="mt-1 text-xs font-medium text-primary">{v.recommendation}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-gray-900">${v.transactionAmount.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {report.violations.length > 15 && (
              <p className="text-center text-xs text-gray-400">
                +{report.violations.length - 15} more violations
              </p>
            )}
          </div>
        </div>
      )}

      {/* All Clear */}
      {report.violations.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-success/20 bg-success/5 py-8">
          <CheckCircle className="h-8 w-8 text-success" />
          <p className="text-sm font-medium text-success">All Clear — All Transactions Comply</p>
          <p className="text-xs text-gray-500">No policy violations detected in this period.</p>
        </div>
      )}
    </div>
  )
}
