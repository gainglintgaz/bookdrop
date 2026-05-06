import { useState } from 'react'
import { cn, formatFileSize, formatDocType } from '@/lib/utils'
import { FileDropzone } from '@/components/client/FileDropzone'
import type { RequirementWithUploads } from '@/types'
import { CheckCircle, FileText, AlertCircle, Loader2, X, Sparkles } from 'lucide-react'

interface RequirementRowProps {
  requirement: RequirementWithUploads
  onUpload: (requirementId: string, file: File) => Promise<void>
  uploading: boolean
}

export function RequirementRow({ requirement, onUpload, uploading }: RequirementRowProps) {
  const [uploadError, setUploadError] = useState<string | null>(null)
  const hasUpload = requirement.uploads.length > 0
  const latestUpload = hasUpload ? requirement.uploads[requirement.uploads.length - 1] : null

  const handleFilesSelected = async (files: File[]) => {
    const file = files[0]
    if (!file) return

    // 25 MB limit
    if (file.size > 25 * 1024 * 1024) {
      setUploadError('File is too large. Maximum size is 25 MB.')
      return
    }

    setUploadError(null)
    try {
      await onUpload(requirement.id, file)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setUploadError(message)
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-4 transition-all',
        hasUpload ? 'border-success/30' : 'border-gray-200',
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {hasUpload ? (
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          ) : requirement.required ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          ) : (
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
          )}
          <div>
            <p className="font-medium text-gray-900">{requirement.label}</p>
            <p className="text-xs text-gray-500">
              {requirement.required ? 'Required' : 'Optional'}
              {requirement.doc_type !== 'other' && ` · ${formatDocType(requirement.doc_type)}`}
            </p>
          </div>
        </div>
        {hasUpload && (
          <span className="shrink-0 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Uploaded
          </span>
        )}
      </div>

      {/* Uploaded file info */}
      {latestUpload && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{latestUpload.filename_original}</span>
          <span className="shrink-0 text-xs text-gray-400">
            {formatFileSize(latestUpload.file_size_bytes)}
          </span>
        </div>
      )}

      {/*
        AI-first pivot D.1 — categorization receipt
        Shown only for uploads where auto-categorization actually ran.
        Honest counts come from the engine's own summary (no fabrication).
      */}
      {latestUpload?.categorization_summary && latestUpload.parsed_summary && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            <span className="font-medium text-emerald-800">
              We classified {latestUpload.categorization_summary.totalCategorized} of {latestUpload.parsed_summary.transactionCount} transactions
            </span>
          </div>
          {latestUpload.categorization_summary.lowConfidence > 0 && (
            <p className="mt-1 text-xs text-emerald-700">
              {latestUpload.categorization_summary.lowConfidence} need review by your bookkeeper.
              {' '}
              <span className="text-emerald-600/80">
                You don't have to do anything — this is just a receipt.
              </span>
            </p>
          )}
          {latestUpload.categorization_summary.lowConfidence === 0 && (
            <p className="mt-1 text-xs text-emerald-700">
              Your bookkeeper will review and confirm before close.
            </p>
          )}
        </div>
      )}

      {/* Upload area — always show to allow re-upload */}
      {uploading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-medium text-primary">Uploading...</span>
        </div>
      ) : (
        <FileDropzone
          onFilesSelected={handleFilesSelected}
          className={hasUpload ? 'border-gray-200 py-3' : ''}
        />
      )}

      {/* Error message */}
      {uploadError && (
        <div className="mt-2 flex items-center gap-1.5 text-sm text-danger">
          <X className="h-4 w-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}
    </div>
  )
}
