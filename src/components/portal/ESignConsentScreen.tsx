// src/components/portal/ESignConsentScreen.tsx
//
// ESIGN/UETA consent screen. Renders BEFORE the SignatureCanvas opens.
// Block 3 Phase E1 deliverable.
//
// Design intent:
//   • Plain-language summary above the checkbox so most signers can act without expanding
//   • Full disclosure available in an expandable panel (don't bury legal text)
//   • Single required checkbox (no auto-check) — the signer must take an action
//   • On accept, invokes onAccept() with the disclosure version and the timestamp
//     of acceptance, both of which travel with the eventual signature payload
//   • Cancel returns to the previous state without recording anything

import { useState } from 'react'
import { ChevronDown, ChevronUp, ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { currentDisclosure } from '@/lib/esign-disclosures'

export interface ConsentAcceptance {
  version: string
  agreedAt: string // ISO timestamp
}

export interface ESignConsentScreenProps {
  /** Called when the signer accepts the disclosure. */
  onAccept: (consent: ConsentAcceptance) => void
  /** Called when the signer declines or closes the consent screen. */
  onCancel: () => void
  /** Optional: short context line shown above the disclosure summary (e.g. "for [Engagement Letter Apr 2026]"). */
  documentLabel?: string
}

export function ESignConsentScreen({ onAccept, onCancel, documentLabel }: ESignConsentScreenProps) {
  const [agreed, setAgreed] = useState(false)
  const [showFullText, setShowFullText] = useState(false)
  const disclosure = currentDisclosure()

  const handleAccept = () => {
    if (!agreed) return
    onAccept({
      version: disclosure.version,
      agreedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
          <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900">{disclosure.label}</h3>
          {documentLabel && (
            <p className="mt-0.5 text-xs text-gray-500">for {documentLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel and close consent screen"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Plain-language summary */}
      <p className="mb-3 text-sm leading-relaxed text-gray-700">{disclosure.summary}</p>

      {/* Expandable full text */}
      <button
        type="button"
        onClick={() => setShowFullText(v => !v)}
        aria-expanded={showFullText}
        className="mb-3 inline-flex items-center gap-1 rounded text-xs font-medium text-emerald-700 hover:underline"
      >
        {showFullText ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showFullText ? 'Hide full disclosure' : 'Read full disclosure'}
      </button>

      {showFullText && (
        <div
          className="mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700"
          aria-label="Full electronic signature disclosure text"
        >
          {disclosure.fullText}
        </div>
      )}

      {/* Consent checkbox */}
      <label className="mb-4 flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          aria-describedby="esign-consent-text"
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
        />
        <span id="esign-consent-text" className="text-sm leading-relaxed text-gray-800">
          I have read and agree to the Electronic Signature Disclosure and Consent above. I agree
          to use an electronic signature in place of a handwritten signature for this document
          and to receive electronic records.
        </span>
      </label>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={!agreed}
          className={cn(
            'rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition',
            agreed
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-gray-300 cursor-not-allowed',
          )}
        >
          Continue to Sign
        </button>
      </div>

      {/* Disclosure version + audit reminder */}
      <p className="mt-3 text-[10px] text-gray-400">
        Disclosure version: <code>{disclosure.version}</code>. Your acceptance is recorded with
        the date, time, and version of this disclosure.
      </p>
    </div>
  )
}
