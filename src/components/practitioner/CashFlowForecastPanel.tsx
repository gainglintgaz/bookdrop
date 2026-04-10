// src/components/practitioner/CashFlowForecastPanel.tsx
// Displays 3-month cash flow forecast, recurring items, runway, and alerts.

import { cn } from '@/lib/utils'
import type { CashFlowForecast } from '@/lib/cash-flow-forecast'
import {
  TrendingUp, TrendingDown, AlertTriangle,
  Repeat, Gauge, ArrowRight,
} from 'lucide-react'

interface Props {
  forecast: CashFlowForecast
}

export function CashFlowForecastPanel({ forecast }: Props) {
  const { forecast: months, recurringIncome, recurringExpenses, runwayMonths, alerts, seasonalPatterns } = forecast

  return (
    <div className="space-y-6">
      {/* Runway alert */}
      {runwayMonths !== null && runwayMonths < 6 && (
        <div className={cn(
          'flex items-start gap-3 rounded-lg border px-4 py-4',
          runwayMonths < 3 ? 'border-danger/30 bg-danger/5' : 'border-warning/30 bg-warning/5',
        )}>
          <AlertTriangle className={cn('mt-0.5 h-5 w-5 shrink-0', runwayMonths < 3 ? 'text-danger' : 'text-warning')} />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {runwayMonths < 3 ? 'Critical: Cash Runway Low' : 'Warning: Cash Runway Limited'}
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              At current burn rate, this business has approximately <strong>{runwayMonths} months</strong> of runway before cash runs out.
              {runwayMonths < 3 && ' Immediate action recommended.'}
            </p>
          </div>
        </div>
      )}

      {/* 3-Month Forecast Cards */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-700">3-Month Cash Flow Forecast</h4>
        <div className="grid gap-3 md:grid-cols-3">
          {months.map((m, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-gray-900">{m.label}</h5>
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  m.confidenceLevel === 'high' ? 'bg-success/10 text-success' :
                  m.confidenceLevel === 'medium' ? 'bg-warning/10 text-warning' :
                  'bg-gray-100 text-gray-500',
                )}>
                  {m.confidenceLevel} confidence
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <TrendingUp className="h-3.5 w-3.5 text-success" /> Income
                  </span>
                  <span className="font-medium text-success">${m.predictedIncome.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <TrendingDown className="h-3.5 w-3.5 text-danger" /> Expenses
                  </span>
                  <span className="font-medium text-danger">${m.predictedExpenses.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-100 pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">Net Cash Flow</span>
                    <span className={cn('font-bold', m.predictedNetCashFlow >= 0 ? 'text-success' : 'text-danger')}>
                      {m.predictedNetCashFlow >= 0 ? '+' : ''}${m.predictedNetCashFlow.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">{m.basis}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Forecast Alerts */}
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

      {/* Recurring Items */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recurring Income */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Repeat className="h-4 w-4 text-success" />
            Recurring Income ({recurringIncome.length})
          </h4>
          {recurringIncome.length > 0 ? (
            <div className="space-y-1.5">
              {recurringIncome.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-success/20 bg-white px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-400">~day {item.dayOfMonth} · {item.frequency}</p>
                  </div>
                  <span className="font-semibold text-success">+${item.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-gray-100 bg-white px-3 py-4 text-center text-xs text-gray-400">
              No recurring income detected yet
            </p>
          )}
        </div>

        {/* Recurring Expenses */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Repeat className="h-4 w-4 text-danger" />
            Recurring Expenses ({recurringExpenses.length})
          </h4>
          {recurringExpenses.length > 0 ? (
            <div className="space-y-1.5">
              {recurringExpenses.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-danger/20 bg-white px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-400">~day {item.dayOfMonth} · {item.category}</p>
                  </div>
                  <span className="font-semibold text-danger">-${item.amount.toLocaleString()}</span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
                <span className="font-medium text-gray-700">Monthly Recurring Total</span>
                <span className="font-bold text-danger">
                  -${recurringExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}/mo
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-md border border-gray-100 bg-white px-3 py-4 text-center text-xs text-gray-400">
              No recurring expenses detected yet
            </p>
          )}
        </div>
      </div>

      {/* Seasonal Patterns */}
      {seasonalPatterns.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Gauge className="h-4 w-4 text-primary" />
            Seasonal Patterns
          </h4>
          <div className="space-y-1.5">
            {seasonalPatterns.map((p, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-primary/10 bg-white px-4 py-2.5 text-sm text-gray-700">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                {p}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runway */}
      {runwayMonths !== null && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-center text-xs text-gray-500">
          <span className="font-medium">Business Runway:</span>{' '}
          {runwayMonths > 12
            ? '12+ months (healthy)'
            : `~${runwayMonths} months at current burn rate`}
        </div>
      )}
    </div>
  )
}
