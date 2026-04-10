// src/pages/UploadPage.tsx
// Public upload page — no auth required.
// Clients reach this via their unique portal link: /upload/:token

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { fetchClientByToken, uploadDocumentFile, notifyBookkeeperOfUpload, fetchEngagementLettersForPortal } from '@/lib/db'
import { tenantConfig } from '@/lib/tenant.config'
import { formatPeriod, cn } from '@/lib/utils'
import { computeSubmissionStatus, getMissingDocuments } from '@/types'
import type { ClientPortalData, EngagementLetterWithSignature } from '@/types'
import { RequirementRow } from '@/components/client/RequirementRow'
import { EngagementLetterRow } from '@/components/portal/EngagementLetterRow'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { generateUploadDeadlineICS, getNextDeadline } from '@/lib/calendar'
import { formatFileSize } from '@/lib/utils'
import { CheckCircle, Clock, FileText, Calendar, Upload, History, AlertCircle, FileSignature } from 'lucide-react'

export function UploadPage() {
  const { token } = useParams<{ token: string }>()
  const [portalData, setPortalData] = useState<ClientPortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadingRequirementId, setUploadingRequirementId] = useState<string | null>(null)
  const [engagementLetters, setEngagementLetters] = useState<EngagementLetterWithSignature[]>([])

  const loadPortalData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)

    try {
      const data = await fetchClientByToken(token)
      if (!data) {
        setError('This upload link is not valid or has been deactivated.')
        return
      }
      setPortalData(data)
      const letters = await fetchEngagementLettersForPortal(data.client.id, token)
      setEngagementLetters(letters)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load portal data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadPortalData()
  }, [loadPortalData])

  const refreshLetters = useCallback(async () => {
    if (!portalData || !token) return
    const letters = await fetchEngagementLettersForPortal(portalData.client.id, token)
    setEngagementLetters(letters)
  }, [portalData, token])

  const handleUpload = useCallback(async (requirementId: string, file: File) => {
    if (!portalData) return

    setUploadingRequirementId(requirementId)
    try {
      const upload = await uploadDocumentFile(
        file,
        portalData.client.id,
        portalData.bookkeeperId,
        requirementId,
        portalData.period.year,
        portalData.period.month,
      )

      // Notify bookkeeper (fire-and-forget — never blocks the upload)
      notifyBookkeeperOfUpload(
        portalData.client.id,
        portalData.bookkeeperId,
        file.name,
        portalData.period.year,
        portalData.period.month,
        token ?? '',
      )

      // Update local state with new upload
      setPortalData(prev => {
        if (!prev) return prev
        return {
          ...prev,
          requirements: prev.requirements.map(req =>
            req.id === requirementId
              ? { ...req, uploads: [...req.uploads, upload] }
              : req,
          ),
        }
      })
    } finally {
      setUploadingRequirementId(null)
    }
  }, [portalData])

  // ─── LOADING STATE ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-surface">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-sm text-gray-500">Loading your upload portal...</p>
        </div>
      </div>
    )
  }

  // ─── ERROR STATE ────────────────────────────────────────────────────────────
  if (error || !portalData) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md">
          <ErrorState
            message={error ?? 'Something went wrong.'}
            onRetry={loadPortalData}
          />
        </div>
      </div>
    )
  }

  // ─── COMPUTED VALUES ────────────────────────────────────────────────────────
  const { client, bookkeeper, requirements, period } = portalData
  const status = computeSubmissionStatus(requirements)
  const missingDocs = getMissingDocuments(requirements)
  const requiredCount = requirements.filter(r => r.required).length
  const uploadedRequiredCount = requirements.filter(r => r.required && r.uploads.length > 0).length
  const isComplete = status === 'complete'
  const allUploads = requirements.flatMap(r => r.uploads)

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-svh bg-surface">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-sm font-medium text-primary">
            {bookkeeper.practice_name || bookkeeper.full_name}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {tenantConfig.documentSetLabel} — {formatPeriod(period.year, period.month)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            For {client.business_name}
            {client.contact_name ? ` (${client.contact_name})` : ''}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Notes from bookkeeper */}
        {client.notes_for_client && (
          <div className="mb-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-primary-dark">Note from your {tenantConfig.practitionerLabel.toLowerCase()}:</p>
            <p className="mt-1 text-sm text-gray-700">{client.notes_for_client}</p>
          </div>
        )}

        {/* Progress summary */}
        <div className={cn(
          'mb-6 rounded-lg p-4',
          isComplete ? 'border border-success/30 bg-success/5' : 'border border-gray-200 bg-white',
        )}>
          {isComplete ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="h-8 w-8 text-success" />
              <div>
                <p className="font-semibold text-success">All done!</p>
                <p className="text-sm text-gray-600">
                  All required documents have been uploaded. Thank you!
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-warning" />
              <div>
                <p className="font-semibold text-gray-900">
                  {uploadedRequiredCount} of {requiredCount} required documents uploaded
                </p>
                {missingDocs.length > 0 && (
                  <p className="mt-0.5 text-sm text-gray-500">
                    Still needed: {missingDocs.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Progress bar */}
          {requiredCount > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isComplete ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${(uploadedRequiredCount / requiredCount) * 100}%` }}
              />
            </div>
          )}
        </div>

        {/* Engagement Letters / E-Signatures */}
        {engagementLetters.length > 0 && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Documents to sign ({engagementLetters.filter(l => l.signature).length}/
                {engagementLetters.length} signed)
              </h2>
            </div>
            <div className="space-y-3">
              {engagementLetters.map(letter => (
                <EngagementLetterRow
                  key={letter.id}
                  letter={letter}
                  clientId={portalData.client.id}
                  portalToken={token ?? ''}
                  signerName={portalData.client.contact_name ?? 'Client'}
                  signerEmail={portalData.client.contact_email}
                  onSigned={refreshLetters}
                />
              ))}
            </div>
          </section>
        )}

        {/* Requirements list */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
            <FileText className="h-4 w-4" />
            <span>Documents to upload</span>
          </div>

          {requirements.map(req => (
            <RequirementRow
              key={req.id}
              requirement={req}
              onUpload={handleUpload}
              uploading={uploadingRequirementId === req.id}
            />
          ))}
        </div>

        {/* Upload History */}
        {allUploads.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-500">
              <History className="h-4 w-4" />
              <span>Your upload history this month</span>
            </div>
            <div className="space-y-2">
              {allUploads
                .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
                .map(upload => {
                  const req = requirements.find(r => r.id === upload.requirement_id)
                  return (
                    <div key={upload.id} className="flex items-center justify-between rounded-lg border border-success/20 bg-white px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-4 w-4 shrink-0 text-success" />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{upload.filename_original}</p>
                          <p className="text-xs text-gray-400">
                            {req?.label ?? 'Document'} · {formatFileSize(upload.file_size_bytes)}
                          </p>
                        </div>
                      </div>
                      <time className="text-xs text-gray-400">
                        {new Date(upload.uploaded_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </time>
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Still missing — clear call to action */}
        {!isComplete && missingDocs.length > 0 && allUploads.length > 0 && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertCircle className="h-4 w-4" />
              Still needed ({missingDocs.length} remaining)
            </div>
            <ul className="mt-2 space-y-1">
              {missingDocs.map(doc => (
                <li key={doc} className="flex items-center gap-2 text-sm text-amber-700">
                  <Upload className="h-3 w-3 shrink-0" />
                  {doc}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-amber-600">
              Scroll up to upload the remaining documents.
            </p>
          </div>
        )}

        {/* Calendar + Contact */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">
          <button
            onClick={() => generateUploadDeadlineICS(client.business_name, getNextDeadline(portalData.dueDay))}
            className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Calendar className="h-3.5 w-3.5" />
            Add Next Deadline to My Calendar
          </button>
          <p>
            Questions? Contact{' '}
            <a
              href={`mailto:${bookkeeper.reply_to_email}`}
              className="font-medium text-primary hover:underline"
            >
              {bookkeeper.full_name}
            </a>
          </p>
        </div>

        {/* Footer */}
        <footer className="mt-6 pb-8 text-center text-xs text-gray-400">
          Powered by {tenantConfig.productName}
        </footer>
      </main>
    </div>
  )
}
