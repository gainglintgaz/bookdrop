// src/components/practitioner/InsightsPanel.tsx
// Displays smart insights from parsed statement data:
// cash flow, spending categories, top vendors, anomalies, advice.

import { cn } from '@/lib/utils'
import type { MonthlyInsights } from '@/lib/insights'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Lightbulb,
  ShoppingCart, Building2, Repeat, CircleDot,
} from 'lucide-react'

interface InsightsPanelProps {
  insights: MonthlyInsights
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  const { cashFlow, spendingByCategory, topVendors, anomalies, advice } = insights

  return (
    <div className="space-y-6">
      {/* Cash Flow Summary */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-700">Cash Flow — {insights.period}</h4>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Income"
            value={`$${cashFlow.totalIncome.toFixed(0)}`}
            icon={TrendingUp}
            color="text-success"
          />
          <StatCard
            label="Expenses"
            value={`$${cashFlow.totalExpenses.toFixed(0)}`}
            icon={TrendingDown}
            color="text-danger"
          />
          <StatCard
            label="Net Cash Flow"
            value={`${cashFlow.netCashFlow >= 0 ? '+' : ''}$${cashFlow.netCashFlow.toFixed(0)}`}
            icon={DollarSign}
            color={cashFlow.netCashFlow >= 0 ? 'text-success' : 'text-danger'}
          />
          <StatCard
            label="Daily Avg Expense"
            value={`$${cashFlow.dailyAvgExpense.toFixed(0)}`}
            icon={ShoppingCart}
            color="text-gray-600"
          />
        </div>

        {/* Largest transactions */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {cashFlow.largestDeposit && (
            <div className="rounded-lg border border-success/20 bg-success/5 px-4 py-3">
              <p className="text-[10px] font-medium uppercase text-success">Largest Deposit</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                ${cashFlow.largestDeposit.amount.toFixed(2)}
              </p>
              <p className="truncate text-xs text-gray-500">{cashFlow.largestDeposit.description}</p>
            </div>
          )}
          {cashFlow.largestExpense && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3">
              <p className="text-[10px] font-medium uppercase text-danger">Largest Expense</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                ${Math.abs(cashFlow.largestExpense.amount).toFixed(2)}
              </p>
              <p className="truncate text-xs text-gray-500">{cashFlow.largestExpense.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Spending by Category */}
      {spendingByCategory.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Spending by Category</h4>
          <div className="space-y-2">
            {spendingByCategory.slice(0, 8).map(cat => (
              <div key={cat.category} className="rounded-lg border border-gray-100 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CircleDot className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium text-gray-900">{cat.category}</span>
                    <span className="text-xs text-gray-400">{cat.count} txn{cat.count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-900">${cat.total.toFixed(0)}</span>
                    <span className="w-10 text-right text-xs font-medium text-gray-500">{cat.percentage}%</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Vendors */}
      {topVendors.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Top Vendors</h4>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="px-4 py-2 font-medium">Vendor</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 text-right font-medium">Count</th>
                  <th className="px-4 py-2 text-right font-medium">Avg</th>
                </tr>
              </thead>
              <tbody>
                {topVendors.slice(0, 10).map(v => (
                  <tr key={v.name} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {v.isRecurring ? (
                          <Repeat className="h-3.5 w-3.5 text-purple-500" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        <span className="text-gray-900">{v.name}</span>
                        {v.isRecurring && (
                          <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                            recurring
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">${v.total.toFixed(0)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{v.count}x</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">${v.avgAmount.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Anomalies ({anomalies.length})
          </h4>
          <div className="space-y-2">
            {anomalies.slice(0, 8).map((a, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-4 py-3',
                  a.severity === 'critical' ? 'border-danger/20 bg-danger/5' :
                  a.severity === 'warning' ? 'border-warning/20 bg-warning/5' :
                  'border-gray-200 bg-white',
                )}
              >
                <AlertTriangle className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  a.severity === 'critical' ? 'text-danger' :
                  a.severity === 'warning' ? 'text-warning' :
                  'text-gray-400',
                )} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="mt-0.5 text-xs text-gray-600">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Smart Advice */}
      {advice.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Lightbulb className="h-4 w-4 text-primary" />
            Insights & Advice
          </h4>
          <div className="space-y-2">
            {advice.map(a => (
              <div
                key={a.id}
                className={cn(
                  'rounded-lg border-l-4 bg-white px-4 py-3',
                  a.impact === 'high' ? 'border-l-danger' :
                  a.impact === 'medium' ? 'border-l-warning' :
                  'border-l-success',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase',
                    a.category === 'risk' ? 'bg-danger/10 text-danger' :
                    a.category === 'savings' ? 'bg-success/10 text-success' :
                    a.category === 'compliance' ? 'bg-purple-50 text-purple-600' :
                    'bg-primary/10 text-primary',
                  )}>
                    {a.category}
                  </span>
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600">{a.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary footer */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
        Based on {insights.transactionCount} transactions from {insights.statementCount} statement{insights.statementCount !== 1 ? 's' : ''}
        {' '}covering ~{insights.daysCovered} days
      </div>
    </div>
  )
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string
  value: string
  icon: typeof TrendingUp
  color: string
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
