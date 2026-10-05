// PortalConfirmPanel — magic-link client confirm of low-confidence lines.
// Auditable: accept/change writes events; no fake client login identity.

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, ShieldCheck, Loader2 } from 'lucide-react'
import type { DocumentLineItem } from '@/types'
import type { ConfirmPolicy } from '@/lib/portal-confirm'
import {
  listPortalConfirmLines,
  portalConfirmLine,
  formatConfirmProof,
} from '@/lib/portal-confirm'
import { correctionCategoryOptions } from '@/lib/exceptions-queue'
import { cn } from '@/lib/utils'

interface Props {
  portalToken: string
  uploadId: string
  filename: string
  policy?: ConfirmPolicy
  onUploadFullyConfirmed?: () => void
}

export function PortalConfirmPanel({
  portalToken,
  uploadId,
  filename,
  policy = 'low_confidence',
  onUploadFullyConfirmed,
}: Props) {
  const [lines, setLines] = useState<DocumentLineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastProof, setLastProof] = useState<string | null>(null)
  const [doneBanner, setDoneBanner] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listPortalConfirmLines({
        portalToken,
        uploadId,
        policy,
      })
      setLines(rows)
      if (rows.length === 0) setDoneBanner(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load lines')
    } finally {
      setLoading(false)
    }
  }, [portalToken, uploadId, policy])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (policy === 'off') return null

  async function act(line: DocumentLineItem, action: 'accept' | 'change', category?: string) {
    setBusyId(line.id)
    setError(null)
    const result = await portalConfirmLine({
      portalToken,
      lineId: line.id,
      action,
      category,
      policy,
    })
    setBusyId(null)
    if (!result.ok) {
      setError(result.error ?? 'Confirm failed')
      return
    }
    const proof = formatConfirmProof(result)
    if (proof) setLastProof(proof)
    if (result.uploadFullyConfirmed) {
      setDoneBanner(true)
      setLines([])
      onUploadFullyConfirmed?.()
    } else {
      await refresh()
    }
  }

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading items to confirm…
      </div>
    )
  }

  if (doneBanner && lines.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
        <div className="flex items-center gap-1.5 font-medium">
          <CheckCircle className="h-3.5 w-3.5" />
          Confirmations complete for {filename}
        </div>
        {lastProof && (
          <p className="mt-1 text-emerald-800/90">
            Audit: {lastProof}. Your bookkeeper can verify this — no account required.
          </p>
        )}
      </div>
    )
  }

  if (lines.length === 0) return null

  const categories = correctionCategoryOptions()

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">
            Please confirm {lines.length} item{lines.length === 1 ? '' : 's'}
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            From {filename}. Accept our suggested category or change it. Each action is
            recorded with time and link proof (not a login).
          </p>

          {error && (
            <p className="mt-2 text-xs text-red-600">{error}</p>
          )}
          {lastProof && (
            <p className="mt-1 text-[11px] text-gray-500">Last action: {lastProof}</p>
          )}

          <ul className="mt-3 space-y-2">
            {lines.map(line => {
              const suggested = line.suggested_category ?? 'Uncategorized'
              const amt = `$${(line.amount_cents / 100).toFixed(2)}`
              const busy = busyId === line.id
              return (
                <li
                  key={line.id}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2"
                >
                  <p className="text-xs font-medium text-gray-900 break-words">
                    {line.description_display || line.description_raw}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {amt} · suggested: {suggested}
                    {line.confidence ? ` · ${line.confidence} confidence` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(line, 'accept')}
                      className={cn(
                        'rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white',
                        'hover:bg-primary/90 disabled:opacity-50',
                      )}
                    >
                      {busy ? 'Saving…' : 'Accept'}
                    </button>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      Change to
                      <select
                        className="max-w-[180px] rounded border border-gray-200 px-1.5 py-1 text-xs"
                        defaultValue=""
                        disabled={busy}
                        onChange={e => {
                          const v = e.target.value
                          if (v) void act(line, 'change', v)
                        }}
                      >
                        <option value="" disabled>
                          Category…
                        </option>
                        {categories.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
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
