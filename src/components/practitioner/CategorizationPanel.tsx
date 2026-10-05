// src/components/practitioner/CategorizationPanel.tsx
// Displays auto-categorized transactions with confidence levels, tax deductions, and flags.

import { cn } from '@/lib/utils'
import type { CategorizationReport, CategorizedTransaction } from '@/lib/categorization-engine'
import { CATEGORIES } from '@/lib/categorization-engine'
import { recordCorrection } from '@/lib/categorization-corrections'
import { useAuthStore } from '@/stores/auth.store'
import {
  CheckCircle, Tag, Receipt,
  DollarSign, Flag, Filter, ChevronDown,
  Pencil, Check, X as XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Provenance } from '@/components/shared/Provenance'
import type { ProvenanceData } from '@/types/provenance'

const ALL_CATEGORIES = Object.values(CATEGORIES)

/**
 * Build provenance metadata for a categorized transaction.
 * Engine output today is decorative (category + confidence label) — this adapter
 * turns each CategorizedTransaction into auditable evidence per
 * .claude/rules/ai-first-principles.md §5 anti-fabrication.
 */
function categorizationProvenance(t: CategorizedTransaction): ProvenanceData {
  if (t.matchedVendor) {
    return {
      type: 'rule',
      summary: `Matched vendor rule: "${t.matchedVendor}"`,
      detail: `Transaction description matched a known vendor pattern. Auto-categorized as "${t.category}"${t.subcategory ? ` / ${t.subcategory}` : ''}.`,
      confidence: t.confidence,
      citations: [
        { label: `Vendor: ${t.matchedVendor}`, meta: t.cleanedDescription },
      ],
    }
  }
  if (t.category === 'Uncategorized' || t.confidence === 'low') {
    return {
      type: 'baseline',
      summary: 'No matching rule — flagged for manual review',
      detail: 'No vendor rule, learned correction, or pattern match fired. Categorize manually to teach the system.',
      confidence: 'low',
    }
  }
  return {
    type: 'computed',
    summary: `Pattern match → "${t.category}"`,
    detail: `Categorized using description heuristics (no exact vendor match). Confidence: ${t.confidence}.`,
    confidence: t.confidence,
    citations: [
      { label: `Original: ${t.originalDescription}` },
    ],
  }
}

interface Props {
  report: CategorizationReport
  /** Client this categorization belongs to. Required to scope corrections. */
  clientId?: string
}

export function CategorizationPanel({ report, clientId }: Props) {
  const { transactions: initialTxns, summary } = report
  const [showAll, setShowAll] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const bookkeeperId = useAuthStore(state => state.bookkeeper?.id ?? null)

  // Apply local overrides on top of the engine's output. Once a correction is
  // recorded, the row stays visually corrected even if the engine re-runs.
  const transactions = initialTxns.map((t, i) =>
    overrides[i] ? { ...t, category: overrides[i] } : t,
  )

  const filtered = filterCategory
    ? transactions.filter(t => t.category === filterCategory)
    : transactions

  const displayed = showAll ? filtered : filtered.slice(0, 20)

  async function handleCorrection(idx: number, txn: CategorizedTransaction, newCategory: string) {
    if (newCategory === txn.category) return
    // Optimistic UI update first
    setOverrides(prev => ({ ...prev, [idx]: newCategory }))
    if (!bookkeeperId || !clientId) {
      // Demo without an authenticated bookkeeper still shows the override —
      // we simply don't persist. Honest copy: this is a preview, not a write.
      console.warn('[CategorizationPanel] Skipping correction write (no bookkeeperId/clientId)')
      return
    }
    await recordCorrection({
      bookkeeperId,
      clientId,
      vendorNormalized: txn.matchedVendor ?? null,
      descriptionRaw: txn.originalDescription,
      originalCategory: txn.category,
      correctedCategory: newCategory,
      originalConfidence: txn.confidence,
    })
  }

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
                    <div className="flex items-center gap-1.5">
                      <CategoryEditor
                        index={i}
                        currentCategory={t.category}
                        wasCorrected={i in overrides}
                        onCorrect={(newCat) => handleCorrection(i, t, newCat)}
                      />
                      <Provenance data={categorizationProvenance(t)} variant="icon-only" />
                    </div>
                    {t.subcategory && !(i in overrides) && (
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

// ─────────────────────────────────────────────────────────────────────────────
// CategoryEditor — inline correction UI
// ─────────────────────────────────────────────────────────────────────────────
// Click the category to open a dropdown. Pick a new one to record a correction.
// "wasCorrected" badge = subtle visual cue that the bookkeeper trained the
// system on this row. Aligned with DATA_FLYWHEEL.md §C: corrections must
// land in-flow, not in a separate UX, so the highest-density training signal
// is captured every time a bookkeeper would have manually fixed something.

interface CategoryEditorProps {
  index: number
  currentCategory: string
  wasCorrected: boolean
  onCorrect: (newCategory: string) => void | Promise<void>
}

function CategoryEditor({ index, currentCategory, wasCorrected, onCorrect }: CategoryEditorProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group inline-flex items-center gap-1 rounded px-1 py-0.5 text-gray-700 transition-colors hover:bg-gray-100',
          wasCorrected && 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
        )}
        title={wasCorrected ? 'You corrected this — click to change again' : 'Click to correct'}
        aria-label={`Category: ${currentCategory}. Click to change.`}
      >
        <span>{currentCategory}</span>
        {wasCorrected ? (
          <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
        ) : (
          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" aria-hidden="true" />
        )}
      </button>
    )
  }

  return (
    <div className="relative inline-flex items-center gap-1">
      <select
        value={currentCategory}
        autoFocus
        aria-label={`Reassign category for row ${index + 1}`}
        onChange={async (e) => {
          await onCorrect(e.target.value)
          setOpen(false)
        }}
        onBlur={() => setOpen(false)}
        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-xs text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {ALL_CATEGORIES.map(cat => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        aria-label="Cancel correction"
      >
        <XIcon className="h-3 w-3" />
      </button>
    </div>
  )
}
