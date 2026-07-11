// ClientConfirmProofStrip — bookkeeper Documents tab audit of portal confirms.

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { DocumentUpload } from '@/types'
import {
  fetchPortalLineEventsForClient,
  summarizeConfirmProof,
  type ConfirmProofSummary,
} from '@/lib/confirm-proof'

interface Props {
  clientId: string
  bookkeeperId: string | null
  uploads: DocumentUpload[]
}

export function ClientConfirmProofStrip({ clientId, bookkeeperId, uploads }: Props) {
  const [summary, setSummary] = useState<ConfirmProofSummary | null>(null)

  useEffect(() => {
    if (!bookkeeperId) {
      // Still show upload-level stamps without events
      setSummary(summarizeConfirmProof([], uploads))
      return
    }
    let cancelled = false
    const uploadIds = uploads.map(u => u.id)
    void fetchPortalLineEventsForClient({ clientId, bookkeeperId, uploadIds }).then(events => {
      if (!cancelled) setSummary(summarizeConfirmProof(events, uploads))
    })
    return () => {
      cancelled = true
    }
  }, [clientId, bookkeeperId, uploads])

  if (!summary?.hasClientActivity) {
    // Quiet empty: don't clutter when nothing happened
    const anyAuto = uploads.some(u => u.auto_categorized_at)
    if (!anyAuto) return null
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <p className="font-medium text-gray-800">Client portal confirms</p>
            <p className="mt-0.5 text-xs text-gray-500">{summary?.detail}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        <div>
          <p className="font-semibold">{summary.headline}</p>
          <p className="mt-0.5 text-xs text-sky-900/90">{summary.detail}</p>
          {summary.lastFingerprintPrefix && (
            <p className="mt-1 font-mono text-[11px] text-sky-800/80">
              proof:{summary.lastFingerprintPrefix}…
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
