import { useState } from 'react'
import { CheckCircle, FileSignature, Loader2, ExternalLink } from 'lucide-react'
import { SignatureCanvas } from './SignatureCanvas'
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

export function EngagementLetterRow({
  letter,
  clientId,
  portalToken,
  signerName,
  signerEmail,
  onSigned,
}: EngagementLetterRowProps) {
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

  const handleSubmitSignature = async () => {
    if (!signatureData) {
      setError('Please draw your signature above')
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
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to submit signature')
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

      {!isSigned && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Please review the document above, then draw your signature below.
          </p>
          <SignatureCanvas
            onSignature={setSignatureData}
            disabled={submitting}
          />
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
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
        </div>
      )}
    </div>
  )
}
