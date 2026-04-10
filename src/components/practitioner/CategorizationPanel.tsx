// src/components/practitioner/CategorizationPanel.tsx
// Displays auto-categorized transactions with confidence levels, tax deductions, and flags.

import { cn } from '@/lib/utils'
import type { CategorizationReport } from '@/lib/categorization-engine'
import {
  CheckCircle, Tag, Receipt,
  DollarSign, Flag, Filter, ChevronDown,
} from 'lucide-react'
import { useState } from 'react'

interface Props {
  report: CategorizationReport
}

export function CategorizationPanel({ report }: Props) {
  const { transactions, summary } = report
  const [showAll, setShowAll] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)

  const filtered = filterCategory
    ? transactions.filter(t => t.category === filterCategory)
    : transactions

  const displayed = showAll ? filtered : filtered.slice(0, 20)

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] text-gray-500">Categorized</span>
          </div>
          <p className="mt-1 text-lg font-bold text-primary">{summary.totalCategorized}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="h-3.5 w-3.5 text-success" />
            <span className="text-[11px] text-gray-500">High Confidence</span>
          </div>
          <p className="mt-1 text-lg font-bold text-success">
            {summary.highConfidence}
            <span className="ml-1 text-xs font-normal text-gray-400">
              ({Math.round((summary.highConfidence / Math.max(summary.totalCategorized, 1)) * 100)}%)
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-success" />
            <span className="text-[11px] text-gray-500">Tax Deductible</span>
          </div>
          <p className="mt-1 text-lg font-bold text-success">{summary.totalDeductible}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3.5 w-3.5 text-success" />
            <span className="text-[11px] text-gray-500">Deductible Amount</span>
          </div>
          <p className="mt-1 text-lg font-bold text-success">${summary.deductibleAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-700">By Category</h4>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory(null)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              !filterCategory ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            All ({summary.totalCategorized})
          </button>
          {summary.categoryBreakdown.slice(0, 10).map(cat => (
            <button
              key={cat.category}
              onClick={() => setFilterCategory(filterCategory === cat.category ? null : cat.category)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filterCategory === cat.category
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {cat.category} ({cat.count})
            </button>
          ))}
        </div>
      </div>

      {/* Flagged items count */}
      {summary.flaggedCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3">
          <Flag className="h-4 w-4 text-warning" />
          <span className="text-sm text-gray-700">
            <strong>{summary.flaggedCount}</strong> transactions flagged for review
            (possible personal expenses, missing receipts, unusual amounts)
          </span>
        </div>
      )}

      {/* Transaction List */}
      <div>
        <h4 className="mb-3 flex items-center justify-between text-sm font-semibold text-gray-700">
          <span>
            <Filter className="mr-1 inline h-4 w-4" />
            Transactions ({filtered.length})
          </span>
        </h4>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 text-center font-medium">Confidence</th>
                <th className="px-4 py-2 text-center font-medium">Deductible</th>
                <th className="px-4 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-gray-900">{t.cleanedDescription || t.originalDescription}</p>
                    {t.matchedVendor && t.matchedVendor !== t.cleanedDescription && (
                      <p className="text-[10px] text-gray-400">Matched: {t.matchedVendor}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-gray-700">{t.category}</span>
                    {t.subcategory && (
                      <p className="text-[10px] text-gray-400">{t.subcategory}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium',
                      t.confidence === 'high' ? 'bg-success/10 text-success' :
                      t.confidence === 'medium' ? 'bg-warning/10 text-warning' :
                      'bg-gray-100 text-gray-500',
                    )}>
                      {t.confidence}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {t.taxDeductible ? (
                      <span className="text-xs text-success">✓ {t.deductionCategory}</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {t.flags.map(f => (
                        <span
                          key={f}
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                            f === 'possible-personal' ? 'bg-purple-50 text-purple-600' :
                            f === 'needs-receipt' ? 'bg-warning/10 text-warning' :
                            f === 'over-$500' ? 'bg-danger/10 text-danger' :
                            'bg-gray-100 text-gray-500',
                          )}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showAll && filtered.length > 20 && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Show all {filtered.length} transactions
          </button>
        )}
      </div>
    </div>
  )
}
