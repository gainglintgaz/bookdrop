// ExceptionsQueue — default-path correction UX (Documents tab).
// Surfaces low-confidence auto-categorization lines without opening Analysis.

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildExceptionItems,
  correctionCategoryOptions,
  type ExceptionItem,
} from '@/lib/exceptions-queue'
import { recordCorrection } from '@/lib/categorization-corrections'
import { recordCorrection as recordLocalMemory } from '@/lib/category-memory'
import type { RequirementWithUploads } from '@/types'

interface Props {
  requirements: RequirementWithUploads[]
  clientId: string
  bookkeeperId: string | null
}

export function ExceptionsQueue({ requirements, clientId, bookkeeperId }: Props) {
  const items = useMemo(() => buildExceptionItems(requirements), [requirements])
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)

  if (items.length === 0) return null

  const open = items.filter(i => !resolved[i.id])
  const categories = correctionCategoryOptions()

  async function applyCorrection(item: ExceptionItem, newCategory: string) {
    if (newCategory === item.originalCategory) return
    setSavingId(item.id)
    setErrorId(null)

    // Local learning memory (browser) — always try
    try {
      recordLocalMemory(item.description, item.originalCategory, newCategory)
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
        originalConfidence: item.confidence,
        reason: 'documents_tab_exception_queue',
      })
      if (!id) {
        setErrorId(item.id)
        setSavingId(null)
        return
      }
    } else {
      // Demo without auth still records local memory; mark UI resolved.
      console.warn('[ExceptionsQueue] No bookkeeperId — local memory only')
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
            Built from upload auto-categorization summaries (default path — no Analysis tab required).
            Full line text may be summarized when the original file is not re-parsed.
          </p>

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
