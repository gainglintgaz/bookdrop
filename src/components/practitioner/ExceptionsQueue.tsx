// ExceptionsQueue — default-path correction UX (Documents tab).
// Prefers real document_line_items evidence; falls back to summary placeholders.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildExceptionItems,
  correctionCategoryOptions,
  type ExceptionItem,
} from '@/lib/exceptions-queue'
import { recordCorrection } from '@/lib/categorization-corrections'
import { recordCorrection as recordLocalMemory } from '@/lib/category-memory'
import { fetchOpenExceptionLines } from '@/lib/document-lines'
import type { DocumentLineItem, RequirementWithUploads } from '@/types'
import { Provenance } from '@/components/shared/Provenance'
import type { ProvenanceData } from '@/types/provenance'

interface Props {
  requirements: RequirementWithUploads[]
  clientId: string
  bookkeeperId: string | null
}

function lineProvenance(item: ExceptionItem): ProvenanceData {
  if (!item.hasLineEvidence) {
    return {
      type: 'baseline',
      summary: 'Summary-only (no line row yet)',
      detail:
        'This upload predates line-level storage or lines failed to persist. Re-upload the statement for full audit trail.',
      confidence: 'low',
    }
  }
  if (item.sourceRule) {
    return {
      type: 'rule',
      summary: `Source: ${item.sourceKind ?? 'parse'}`,
      detail: item.sourceRule,
      confidence: item.confidence,
      citations: [{ label: item.filename, meta: `Line ${item.lineIndex}` }],
    }
  }
  return {
    type: 'computed',
    summary: `Parsed line · ${item.sourceKind ?? 'statement_parse'}`,
    confidence: item.confidence,
    citations: [{ label: item.filename, meta: `Line ${item.lineIndex}` }],
  }
}

export function ExceptionsQueue({ requirements, clientId, bookkeeperId }: Props) {
  const [lines, setLines] = useState<DocumentLineItem[]>([])
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  useEffect(() => {
    if (!bookkeeperId) return
    let cancelled = false
    void fetchOpenExceptionLines({ clientId, bookkeeperId }).then(rows => {
      if (!cancelled) setLines(rows)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, bookkeeperId, requirements])

  const items = useMemo(
    () => buildExceptionItems(requirements, lines.length > 0 ? lines : undefined),
    [requirements, lines],
  )

  if (items.length === 0) return null

  const open = items.filter(i => !resolved[i.id])
  const categories = correctionCategoryOptions()
  const anySummaryOnly = items.some(i => !i.hasLineEvidence)

  async function applyCorrection(item: ExceptionItem, newCategory: string) {
    if (newCategory === item.originalCategory) return
    setSavingId(item.id)
    setErrorId(null)

    try {
      recordLocalMemory(clientId, item.description, item.originalCategory, newCategory)
    } catch {
      /* non-blocking */
    }

    if (bookkeeperId) {
      const id = await recordCorrection({
        bookkeeperId,
        clientId,
        uploadId: item.uploadId,
        descriptionRaw: item.description,
        vendorNormalized: null,
        originalCategory: item.originalCategory,
        correctedCategory: newCategory,
        originalConfidence: item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low'
          ? item.confidence
          : 'low',
        reason: item.hasLineEvidence
          ? 'documents_tab_line_evidence'
          : 'documents_tab_summary_fallback',
      })
      if (!id) {
        setErrorId(item.id)
        setSavingId(null)
        return
      }
    }

    setResolved(prev => ({ ...prev, [item.id]: newCategory }))
    setSavingId(null)
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-950">
            Exceptions needing your judgment
          </p>
          <p className="mt-0.5 text-xs text-amber-900/90">
            {open.length} open · {Object.keys(resolved).length} corrected this session.
            {lines.length > 0
              ? ' Backed by document_line_items (auditable).'
              : ' Using upload summaries until line rows exist for this period.'}
          </p>
          {anySummaryOnly && (
            <p className="mt-1 text-[11px] text-amber-800">
              Some rows lack line-level evidence. Re-upload statements after migration 009 for full trace.
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {items.map(item => {
              const done = resolved[item.id]
              return (
                <li
                  key={item.id}
                  className={cn(
                    'rounded-md border bg-white px-3 py-2 text-sm',
                    done ? 'border-emerald-200' : 'border-amber-100',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-xs font-medium', done ? 'text-emerald-800' : 'text-gray-800')}>
                        {item.requirementLabel}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600 break-words">{item.description}</p>
                      <div className="mt-1">
                        <Provenance data={lineProvenance(item)} variant="badge" />
                      </div>
                      {errorId === item.id && (
                        <p className="mt-1 text-[11px] text-red-600">Could not save correction — try again.</p>
                      )}
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                        {done}
                      </span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Pencil className="h-3 w-3" />
                        <select
                          className="max-w-[200px] rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                          defaultValue=""
                          disabled={savingId === item.id}
                          onChange={e => {
                            const v = e.target.value
                            if (v) void applyCorrection(item, v)
                          }}
                          aria-label={`Correct category for ${item.description}`}
                        >
                          <option value="" disabled>
                            Set category…
                          </option>
                          {categories.map(c => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
