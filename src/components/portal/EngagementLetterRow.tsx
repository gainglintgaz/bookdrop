import { useState } from 'react'
import { CheckCircle, FileSignature, Loader2, ExternalLink } from 'lucide-react'
import { SignatureCanvas } from './SignatureCanvas'
import { ESignConsentScreen, type ConsentAcceptance } from './ESignConsentScreen'
import { supabase } from '@/lib/supabase'
import type { EngagementLetterWithSignature } from '@/types'

interface EngagementLetterRowProps {
  letter: EngagementLetterWithSignature
  clientId: string
  portalToken: string
  signerName: string
  signerEmail: string
  onSigned: () => void
}

/**
 * Three states drive this component:
 *   • idle            — initial render, "View document" + "Begin signing" button
 *   • consenting      — ESIGN consent screen open (Block 3 E1)
 *   • drawing         — consent accepted, SignatureCanvas open
 *
 * If letter is already signed, render the "Signed" pill and only the View button.
 */
type Stage = 'idle' | 'consenting' | 'drawing'

export function EngagementLetterRow({
  letter,
  clientId,
  portalToken,
  signerName,
  signerEmail,
  onSigned,
}: EngagementLetterRowProps) {
  const [stage, setStage] = useState<Stage>('idle')
  const [consent, setConsent] = useState<ConsentAcceptance | null>(null)
  const [signatureData, setSignatureData] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewUrl, setViewUrl] = useState<string | null>(null)

  const isSigned = !!letter.signature

  const handleViewDocument = async () => {
    if (viewUrl) { window.open(viewUrl, '_blank'); return }
    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(letter.storage_path, 3600)
    if (data?.signedUrl) {
      setViewUrl(data.signedUrl)
      window.open(data.signedUrl, '_blank')
    }
  }

  const handleConsentAccepted = (c: ConsentAcceptance) => {
    setConsent(c)
    setStage('drawing')
  }

  const handleConsentCancelled = () => {
    setStage('idle')
    setConsent(null)
  }

  const handleSubmitSignature = async () => {
    if (!signatureData) {
      setError('Please draw your signature above')
      return
    }
    if (!consent) {
      // Defensive: shouldn't be reachable since the canvas only renders post-consent.
      setError('Consent required before signing')
      setStage('consenting')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/sign-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engagementLetterId: letter.id,
          clientId,
          portalToken,
          signerName,
          signerEmail,
          signatureImageData: signatureData,
          // Block 3 E1: include consent metadata in every signing request
          consentDisclosureVersion: consent.version,
          consentDisclosureAgreedAt: consent.agreedAt,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Block 3 E1: surface rate limit + storage failure messages clearly
        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After')
          setError(
            `Too many signing attempts. Please try again in ${
              retryAfter ? `${Math.ceil(Number(retryAfter) / 60)} minutes` : 'an hour'
            }.`
          )
        } else {
          setError(data.error ?? 'Failed to submit signature')
        }
        return
      }
      onSigned()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-900">{letter.label}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleViewDocument}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            View document
          </button>
          {isSigned && letter.signature && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" />
              Signed {new Date(letter.signature.signed_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* idle: prompt to begin */}
      {!isSigned && stage === 'idle' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Please review the document above, then click below to begin signing. You'll see a brief
            electronic-signature disclosure first.
          </p>
          <button
            type="button"
            onClick={() => setStage('consenting')}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <FileSignature className="h-3.5 w-3.5" />
            Begin Signing
          </button>
        </div>
      )}

      {/* consenting: ESIGN/UETA consent screen */}
      {!isSigned && stage === 'consenting' && (
        <ESignConsentScreen
          onAccept={handleConsentAccepted}
          onCancel={handleConsentCancelled}
          documentLabel={letter.label}
        />
      )}

      {/* drawing: consent accepted, capture signature */}
      {!isSigned && stage === 'drawing' && (
        <div className="space-y-3">
          <div className="rounded border-l-2 border-emerald-500 bg-emerald-50/40 px-3 py-2">
            <p className="text-xs text-emerald-800">
              ✓ Disclosure accepted. Now draw your signature below.
            </p>
          </div>
          <SignatureCanvas
            onSignature={setSignatureData}
            disabled={submitting}
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmitSignature}
              disabled={submitting || !signatureData}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting...</>
              ) : (
                <><FileSignature className="h-3.5 w-3.5" /> Sign Document</>
              )}
            </button>
            <button
              type="button"
              onClick={handleConsentCancelled}
              disabled={submitting}
              className="text-xs text-gray-500 hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
