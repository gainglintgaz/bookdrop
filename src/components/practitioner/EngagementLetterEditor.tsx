// src/components/practitioner/EngagementLetterEditor.tsx
//
// Block 3 Phase E2: bookkeeper UX for designating multiple signatories on
// an engagement letter, then sending each one a unique invite email.
//
// Form-based for V1 — the visual SignaturePlacementDesigner (drag-drop on
// PDF preview) is Phase E3 stretch. For now, signatories without explicit
// placement metadata get the default last-page signature placement
// (matches single-signer legacy behavior, just N times — once per signatory).
//
// State machine:
//   idle           → "Add signatories" button
//   editing        → form with signatory rows
//   sending        → invite request in flight
//   sent           → success, shows results per signatory
//
// Existing single-signer letters keep working: this editor is OPT-IN.
// If the bookkeeper never opens it, the legacy "send the client your portal
// token" flow stays unchanged.

import { useState, lazy, Suspense } from 'react'
import { Plus, Trash2, Send, Loader2, CheckCircle, AlertCircle, Users, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import type { SignerRole, SignaturePlacement, EngagementLetter } from '@/types'

// Lazy-load the placement designer — pdfjs-dist is heavy (440KB chunk) and
// most bookkeepers will use the default last-page placement without ever
// opening the visual editor.
const SignaturePlacementDesigner = lazy(() =>
  import('./SignaturePlacementDesigner').then(m => ({ default: m.SignaturePlacementDesigner }))
)

interface SignatoryDraft {
  id: string  // local-only, stable for keys
  role: SignerRole
  name: string
  email: string
  /** Per-page placement coords. Empty = default last-page signature. Set via SignaturePlacementDesigner. */
  placement?: SignaturePlacement[]
}

/** Stable color palette for signatory markers in the placement designer. */
const SIGNATORY_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

interface InviteResult {
  email: string
  signatoryId?: string
  status: 'invited' | 'reminder' | 'failed'
  error?: string
}

interface Props {
  letter: EngagementLetter
  bookkeeperId: string
  /** Called when invites are successfully sent — caller refreshes letter list. */
  onInvitesSent?: () => void
}

const ROLE_OPTIONS: Array<{ value: SignerRole; label: string }> = [
  { value: 'primary', label: 'Primary signer' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'partner', label: 'Partner / co-owner' },
  { value: 'guarantor', label: 'Guarantor' },
  { value: 'other', label: 'Other' },
]

function makeId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function EngagementLetterEditor({ letter, bookkeeperId, onInvitesSent }: Props) {
  const [stage, setStage] = useState<'idle' | 'editing' | 'designing' | 'sending' | 'sent'>('idle')
  const [drafts, setDrafts] = useState<SignatoryDraft[]>([
    { id: makeId(), role: 'primary', name: '', email: '' },
  ])
  const [results, setResults] = useState<InviteResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null)
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null)

  const addRow = () => {
    setDrafts(prev => [
      ...prev,
      { id: makeId(), role: prev.length === 0 ? 'primary' : 'spouse', name: '', email: '' },
    ])
  }

  const removeRow = (id: string) => {
    setDrafts(prev => prev.length > 1 ? prev.filter(d => d.id !== id) : prev)
  }

  const updateRow = (id: string, field: keyof Omit<SignatoryDraft, 'id'>, value: string) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
  }

  const validate = (): string | null => {
    if (drafts.length === 0) return 'Add at least one signatory.'
    const seenEmails = new Set<string>()
    for (const d of drafts) {
      if (!d.name.trim()) return `Missing name for one of the signatories.`
      if (!d.email.trim()) return `Missing email for ${d.name || 'a signatory'}.`
      if (!d.email.includes('@')) return `Invalid email for ${d.name}.`
      const lower = d.email.trim().toLowerCase()
      if (seenEmails.has(lower)) return `Duplicate email: ${d.email}.`
      seenEmails.add(lower)
    }
    // At most one of each non-'other' role
    const nonOtherRoles = drafts.map(d => d.role).filter(r => r !== 'other')
    if (new Set(nonOtherRoles).size !== nonOtherRoles.length) {
      return 'Each role (Primary, Spouse, Partner, Guarantor) can only be used once. Use "Other" for additional signatories.'
    }
    return null
  }

  /**
   * Open the visual placement designer.
   * Validates signatories first (need at least name + email per row), then
   * downloads the PDF from Supabase Storage so the designer can render it.
   */
  const handleOpenDesigner = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)

    // Need to download the PDF — uses a 1-hour signed URL like EngagementLetterRow.
    try {
      const { data, error: dlErr } = await supabase.storage
        .from('documents')
        .createSignedUrl(letter.storage_path, 3600)
      if (dlErr || !data?.signedUrl) {
        setPdfLoadError(dlErr?.message ?? 'Could not generate document URL')
        return
      }
      const resp = await fetch(data.signedUrl)
      if (!resp.ok) {
        setPdfLoadError(`Failed to download document (HTTP ${resp.status})`)
        return
      }
      const bytes = await resp.arrayBuffer()
      setPdfBytes(bytes)
      setPdfLoadError(null)
      setStage('designing')
    } catch (err) {
      setPdfLoadError(err instanceof Error ? err.message : 'Unknown error loading document')
    }
  }

  const handlePlacementsSaved = (placementsBySignatory: Record<string, SignaturePlacement[]>) => {
    setDrafts(prev => prev.map(d => ({
      ...d,
      placement: placementsBySignatory[d.id] ?? d.placement ?? [],
    })))
    setStage('editing')
  }

  const handleSendInvites = async () => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setStage('sending')

    try {
      const res = await fetch('/api/invite-signatories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagementLetterId: letter.id,
          bookkeeperId,
          signatories: drafts.map(d => ({
            role: d.role,
            name: d.name.trim(),
            email: d.email.trim(),
            placement: d.placement && d.placement.length > 0 ? d.placement : undefined,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to send invites')
        setStage('editing')
        return
      }
      setResults(data.results ?? [])
      setStage('sent')
      onInvitesSent?.()
    } catch {
      setError('Network error — please try again')
      setStage('editing')
    }
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  if (stage === 'idle') {
    return (
      <button
        type="button"
        onClick={() => setStage('editing')}
        className="inline-flex items-center gap-2 rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-primary hover:bg-primary/5 hover:text-primary"
      >
        <Users className="h-4 w-4" />
        Add signatories
      </button>
    )
  }

  if (stage === 'sent') {
    const successCount = results.filter(r => r.status !== 'failed').length
    const failedCount = results.length - successCount
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-900">
            Sent {successCount} invite{successCount === 1 ? '' : 's'}
            {failedCount > 0 && `, ${failedCount} failed`}
          </span>
        </div>
        <ul className="ml-7 space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              {r.status === 'failed' ? (
                <>
                  <AlertCircle className="h-3 w-3 text-red-500" />
                  <span className="text-red-700">{r.email} — {r.error}</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                  <span className="text-gray-700">
                    {r.email} {r.status === 'reminder' ? '(reminder sent)' : '(invited)'}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => { setStage('idle'); setDrafts([{ id: makeId(), role: 'primary', name: '', email: '' }]); setResults([]) }}
          className="mt-3 text-xs text-emerald-700 hover:underline"
        >
          Done
        </button>
      </div>
    )
  }

  // designing: visual placement editor open in fullscreen-ish modal
  if (stage === 'designing' && pdfBytes) {
    const validDrafts = drafts.filter(d => d.name.trim() && d.email.trim())
    return (
      <div className="fixed inset-0 z-50 bg-gray-100 p-4">
        <Suspense fallback={
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        }>
          <SignaturePlacementDesigner
            pdfSource={pdfBytes}
            signatories={validDrafts.map((d, i) => ({
              id: d.id,
              label: `${d.name} (${d.role})`,
              color: SIGNATORY_COLORS[i % SIGNATORY_COLORS.length],
              placements: d.placement ?? [],
            }))}
            onDone={handlePlacementsSaved}
            onCancel={() => setStage('editing')}
          />
        </Suspense>
      </div>
    )
  }

  // editing | sending
  const totalPlacements = drafts.reduce((sum, d) => sum + (d.placement?.length ?? 0), 0)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Users className="h-4 w-4 text-primary" />
          Signatories for {letter.label}
        </h4>
        <button
          type="button"
          onClick={() => { setStage('idle'); setError(null) }}
          disabled={stage === 'sending'}
          className="text-xs text-gray-500 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Each signatory gets a unique invite email with their own signing link. Add joint filers,
        spouses, partners, or other parties as needed.
      </p>

      <div className="space-y-2">
        {drafts.map((d, idx) => (
          <div key={d.id} className="flex items-start gap-2 rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={d.role}
                onChange={e => updateRow(d.id, 'role', e.target.value)}
                disabled={stage === 'sending'}
                aria-label={`Role for signatory ${idx + 1}`}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={d.name}
                onChange={e => updateRow(d.id, 'name', e.target.value)}
                placeholder="Full name"
                disabled={stage === 'sending'}
                aria-label={`Name for signatory ${idx + 1}`}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="email"
                value={d.email}
                onChange={e => updateRow(d.id, 'email', e.target.value)}
                placeholder="email@example.com"
                disabled={stage === 'sending'}
                aria-label={`Email for signatory ${idx + 1}`}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(d.id)}
              disabled={drafts.length <= 1 || stage === 'sending'}
              aria-label={`Remove signatory ${idx + 1}`}
              className={cn(
                'mt-1 rounded p-1.5',
                drafts.length <= 1 ? 'cursor-not-allowed text-gray-300' : 'text-gray-400 hover:bg-gray-200 hover:text-red-600',
              )}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        disabled={stage === 'sending'}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-primary hover:text-primary disabled:opacity-50"
      >
        <Plus className="h-3 w-3" />
        Add another signatory
      </button>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pdfLoadError && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{pdfLoadError} — placement designer unavailable; signatures will use the default last-page placement.</span>
        </div>
      )}

      {/* Placement summary + designer entry point */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={handleOpenDesigner}
          disabled={stage === 'sending'}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-primary hover:text-primary disabled:opacity-50"
        >
          <MapPin className="h-3.5 w-3.5" />
          {totalPlacements > 0 ? 'Edit signature placement' : 'Configure signature placement (optional)'}
        </button>
        {totalPlacements > 0 && (
          <span className="text-[11px] text-gray-500">
            {totalPlacements} placement{totalPlacements === 1 ? '' : 's'} configured.
          </span>
        )}
        {totalPlacements === 0 && (
          <span className="text-[11px] text-gray-500">
            Without explicit placement, signatures appear on the last page (default).
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleSendInvites}
          disabled={stage === 'sending'}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === 'sending' ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending invites...</>
          ) : (
            <><Send className="h-4 w-4" /> Send invites</>
          )}
        </button>
      </div>
    </div>
  )
}
