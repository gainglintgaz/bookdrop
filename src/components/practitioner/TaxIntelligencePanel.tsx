// src/components/practitioner/TaxIntelligencePanel.tsx
// Displays tax deductions, 1099 tracking, quarterly estimates, and alerts.

import { cn } from '@/lib/utils'
import type { TaxIntelligenceReport } from '@/lib/tax-intelligence'
import {
  DollarSign, AlertTriangle, Users, Receipt,
  TrendingDown, Lightbulb, Calendar, ShieldAlert,
} from 'lucide-react'

interface Props {
  report: TaxIntelligenceReport
}

export function TaxIntelligencePanel({ report }: Props) {
  const { deductions, vendors1099, quarterlyEstimate, alerts, tips } = report

  return (
    <div className="space-y-6">
      {/* Tax Savings Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total Deductible"
          value={`$${deductions.totalDeductible.toLocaleString()}`}
          icon={Receipt}
          color="text-success"
        />
        <StatCard
          label="Est. Tax Savings"
          value={`$${deductions.estimatedTaxSavings.toLocaleString()}`}
          icon={DollarSign}
          color="text-primary"
        />
        <StatCard
          label="1099 Vendors"
          value={`${vendors1099.filter(v => v.needs1099).length}`}
          icon={Users}
          color="text-warning"
        />
        <StatCard
          label="Q Est. Tax Owed"
          value={`$${quarterlyEstimate.estimatedTaxOwed.toLocaleString()}`}
          icon={Calendar}
          color="text-danger"
        />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-4 py-3',
                a.severity === 'critical' ? 'border-danger/20 bg-danger/5' :
                a.severity === 'warning' ? 'border-warning/20 bg-warning/5' :
                'border-primary/20 bg-primary/5',
              )}
            >
              <ShieldAlert className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                a.severity === 'critical' ? 'text-danger' :
                a.severity === 'warning' ? 'text-warning' : 'text-primary',
              )} />
              <div>
                <p className="text-sm font-medium text-gray-900">{a.title}</p>
                <p className="mt-0.5 text-xs text-gray-600">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deductions by Category */}
      {deductions.byCategory.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Tax Deductions by Category</h4>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">IRS Category</th>
                  <th className="px-4 py-2 text-right font-medium">Deductible</th>
                  <th className="px-4 py-2 text-right font-medium">Items</th>
                </tr>
              </thead>
              <tbody>
                {deductions.byCategory.map(cat => (
                  <tr key={cat.category} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-3.5 w-3.5 text-success" />
                        <span className="text-gray-900">{cat.category}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-success">${cat.total.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{cat.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">Total Deductible</td>
                  <td className="px-4 py-2.5 text-right text-sm font-bold text-success">${deductions.totalDeductible.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-500">{deductions.items.length} items</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Missed Deductions */}
      {deductions.missedDeductions.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Lightbulb className="h-4 w-4 text-warning" />
            Potentially Missed Deductions
          </h4>
          <div className="space-y-1.5">
            {deductions.missedDeductions.map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm text-gray-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                {d}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1099 Vendor Tracking */}
      {vendors1099.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">1099 Vendor Tracking</h4>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 text-right font-medium">Total Paid</th>
                  <th className="px-4 py-2 text-right font-medium">Txns</th>
                  <th className="px-4 py-2 text-center font-medium">1099 Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors1099.map(v => (
                  <tr key={v.name} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-gray-900">{v.name}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">${v.totalPaid.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{v.transactionCount}</td>
                    <td className="px-4 py-2.5 text-center">
                      {v.needs1099 ? (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                          1099 Required
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          ${v.amountRemaining.toFixed(0)} until threshold
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarterly Estimate */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Quarterly Tax Estimate — {quarterlyEstimate.quarter}</h4>
            <p className="mt-0.5 text-xs text-gray-500">{quarterlyEstimate.basis}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-primary">${quarterlyEstimate.estimatedTaxOwed.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Due {quarterlyEstimate.nextDueDate}</p>
          </div>
        </div>
      </div>

      {/* Tax Tips */}
      {tips.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Lightbulb className="h-4 w-4 text-primary" />
            Tax-Saving Tips
          </h4>
          <div className="space-y-2">
            {tips.map((tip, i) => (
              <div key={i} className="rounded-lg border-l-4 border-l-primary bg-white px-4 py-3 text-sm text-gray-700">
                {tip}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof DollarSign; color: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5', color)} />
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className={cn('mt-1 text-lg font-bold', color)}>{value}</p>
    </div>
  )
}
