// src/components/practitioner/TrendAnalysisPanel.tsx
// Displays month-over-month trends, category trends, vendor changes, and narrative.

import { cn } from '@/lib/utils'
import type { TrendReport } from '@/lib/trend-analysis'
import {
  TrendingUp, TrendingDown, ArrowRight, AlertTriangle,
  Plus, Minus, BarChart3,
} from 'lucide-react'

interface Props {
  report: TrendReport
}

export function TrendAnalysisPanel({ report }: Props) {
  const { monthOverMonth, categoryTrends, vendorTrends, newVendors, droppedVendors, alerts, narrative } = report

  return (
    <div className="space-y-6">
      {/* Narrative Summary */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-4">
        <p className="text-sm leading-relaxed text-gray-800">{narrative}</p>
      </div>

      {/* Month-over-Month Comparison */}
      {monthOverMonth && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">
            {monthOverMonth.previousMonth.label} → {monthOverMonth.currentMonth.label}
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <ComparisonCard
              label="Income"
              current={monthOverMonth.income.current}
              previous={monthOverMonth.income.previous}
              changePercent={monthOverMonth.income.changePercent}
              positiveIsGood
            />
            <ComparisonCard
              label="Expenses"
              current={monthOverMonth.expenses.current}
              previous={monthOverMonth.expenses.previous}
              changePercent={monthOverMonth.expenses.changePercent}
              positiveIsGood={false}
            />
            <ComparisonCard
              label="Net Cash Flow"
              current={monthOverMonth.netCashFlow.current}
              previous={monthOverMonth.netCashFlow.previous}
              changePercent={monthOverMonth.netCashFlow.changePercent}
              positiveIsGood
            />
          </div>
        </div>
      )}

      {/* Trend Alerts */}
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
              {a.type === 'positive' ? (
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <AlertTriangle className={cn(
                  'mt-0.5 h-4 w-4 shrink-0',
                  a.severity === 'critical' ? 'text-danger' : a.severity === 'warning' ? 'text-warning' : 'text-primary',
                )} />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{a.title}</p>
                <p className="mt-0.5 text-xs text-gray-600">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Trends */}
      {categoryTrends.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <BarChart3 className="h-4 w-4 text-primary" />
            Category Trends
          </h4>
          <div className="space-y-2">
            {categoryTrends.slice(0, 10).map(cat => (
              <div key={cat.category} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{cat.category}</span>
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      cat.trend === 'increasing' ? 'bg-danger/10 text-danger' :
                      cat.trend === 'decreasing' ? 'bg-success/10 text-success' :
                      'bg-gray-100 text-gray-500',
                    )}>
                      {cat.trend}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">${cat.avgMonthly.toLocaleString()}/mo</span>
                    {cat.changePercent !== 0 && (
                      <span className={cn(
                        'text-xs font-medium',
                        cat.changePercent > 0 ? 'text-danger' : 'text-success',
                      )}>
                        {cat.changePercent > 0 ? '+' : ''}{cat.changePercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
                {cat.alert && (
                  <p className="mt-1 text-xs text-warning">{cat.alert}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New & Dropped Vendors */}
      <div className="grid gap-4 md:grid-cols-2">
        {newVendors.length > 0 && (
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Plus className="h-4 w-4 text-success" />
              New Vendors ({newVendors.length})
            </h4>
            <div className="space-y-1">
              {newVendors.map(v => (
                <div key={v} className="flex items-center gap-2 rounded-md border border-success/20 bg-white px-3 py-2 text-sm text-gray-700">
                  <Plus className="h-3 w-3 text-success" />
                  {v}
                </div>
              ))}
            </div>
          </div>
        )}
        {droppedVendors.length > 0 && (
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Minus className="h-4 w-4 text-danger" />
              Dropped Vendors ({droppedVendors.length})
            </h4>
            <div className="space-y-1">
              {droppedVendors.map(v => (
                <div key={v} className="flex items-center gap-2 rounded-md border border-danger/20 bg-white px-3 py-2 text-sm text-gray-700">
                  <Minus className="h-3 w-3 text-danger" />
                  {v}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Vendor Price Changes */}
      {vendorTrends.filter(v => v.priceChange !== null && Math.abs(v.priceChange) > 10).length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Vendor Price Changes</h4>
          <div className="space-y-1.5">
            {vendorTrends.filter(v => v.priceChange !== null && Math.abs(v.priceChange!) > 10).map(v => (
              <div key={v.vendor} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm">
                <span className="text-gray-700">{v.vendor}</span>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium',
                    v.priceChange! > 0 ? 'text-danger' : 'text-success',
                  )}>
                    {v.priceChange! > 0 ? '+' : ''}{v.priceChange!.toFixed(0)}%
                  </span>
                  {v.alert && <span className="text-[10px] text-gray-400">{v.alert}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Growth Rates */}
      {(report.growthRate !== null || report.burnRateChange !== null) && (
        <div className="grid gap-3 md:grid-cols-2">
          {report.growthRate !== null && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className={cn('h-4 w-4', report.growthRate >= 0 ? 'text-success' : 'text-danger')} />
                <span className="text-xs text-gray-500">Income Growth Rate</span>
              </div>
              <p className={cn('mt-1 text-xl font-bold', report.growthRate >= 0 ? 'text-success' : 'text-danger')}>
                {report.growthRate >= 0 ? '+' : ''}{report.growthRate.toFixed(1)}%
              </p>
            </div>
          )}
          {report.burnRateChange !== null && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className={cn('h-4 w-4', report.burnRateChange <= 0 ? 'text-success' : 'text-danger')} />
                <span className="text-xs text-gray-500">Expense Growth Rate</span>
              </div>
              <p className={cn('mt-1 text-xl font-bold', report.burnRateChange <= 0 ? 'text-success' : 'text-danger')}>
                {report.burnRateChange >= 0 ? '+' : ''}{report.burnRateChange.toFixed(1)}%
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ComparisonCard({ label, current, previous, changePercent, positiveIsGood }: {
  label: string; current: number; previous: number; changePercent: number; positiveIsGood: boolean
}) {
  const isPositive = changePercent > 0
  const isGood = positiveIsGood ? isPositive : !isPositive

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">${current.toLocaleString()}</p>
      <div className="mt-1 flex items-center gap-1">
        {changePercent !== 0 && (
          <>
            <ArrowRight className={cn('h-3 w-3', isGood ? 'text-success' : 'text-danger')} />
            <span className={cn('text-xs font-medium', isGood ? 'text-success' : 'text-danger')}>
              {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
            </span>
          </>
        )}
        <span className="text-[10px] text-gray-400">vs ${previous.toLocaleString()}</span>
      </div>
    </div>
  )
}
