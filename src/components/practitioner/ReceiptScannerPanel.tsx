// src/components/practitioner/ReceiptScannerPanel.tsx
// Receipt/document photo scanner panel. Captures images via camera, file upload,
// or clipboard paste, then allows manual metadata entry and batch export.

import { cn } from '@/lib/utils'
import {
  Camera, Upload, Clipboard, Trash2, Download,
  ImagePlus, X, StopCircle, RotateCw, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useState, useRef, useEffect, useCallback } from 'react'
import type {
  ScannedDocument,
  ScanBatch,
} from '@/lib/receipt-scanner'
import {
  processImage,
  extractReceiptData,
  runOCR,
  terminateOCR,
  exportScansAsZip,
} from '@/lib/receipt-scanner'

// ---------- Category options for the dropdown ----------

const CATEGORY_OPTIONS = [
  'Office Supplies',
  'Supplies',
  'Maintenance',
  'Shipping',
  'Travel',
  'Lodging',
  'Utilities',
  'Meals',
  'Fuel',
  'Software',
  'Advertising',
  'Insurance',
  'Professional Services',
  'Rent',
  'Other',
]

// ---------- Props ----------

interface Props {
  clientName: string
  year: number
  month: number
  onScansComplete?: (batch: ScanBatch) => void
}

// ---------- Component ----------

export function ReceiptScannerPanel({ clientName, year, month, onScansComplete }: Props) {
  const [documents, setDocuments] = useState<ScannedDocument[]>([])
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [processing, setProcessing] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // ---- Camera ----

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera not available'
      setCameraError(
        message.includes('NotAllowed') || message.includes('Permission')
          ? 'Camera permission denied. Please allow access in your browser settings.'
          : `Could not access camera: ${message}`,
      )
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setCameraError(null)
  }, [])

  // Cleanup camera stream + OCR worker on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      terminateOCR()
    }
  }, [])

  const snapPhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      setProcessing(true)
      try {
        const doc = await processImage(blob, 'camera')
        setDocuments(prev => [...prev, doc])
      } catch (err) {
        console.error('Failed to process camera capture:', err)
      } finally {
        setProcessing(false)
      }
    }, 'image/jpeg', 0.92)
  }, [])

  // ---- File upload ----

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf',
    )
    if (imageFiles.length === 0) return

    setProcessing(true)
    try {
      const results = await Promise.all(
        imageFiles
          .filter(f => f.type.startsWith('image/'))
          .map(f => processImage(f, 'file-upload')),
      )
      setDocuments(prev => [...prev, ...results])
    } catch (err) {
      console.error('Failed to process uploaded files:', err)
    } finally {
      setProcessing(false)
    }
  }, [])

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = '' // reset so same file can be re-selected
    }
  }, [handleFiles])

  // ---- Drag and drop ----

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  // ---- Clipboard paste ----

  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (!blob) continue
          setProcessing(true)
          try {
            const doc = await processImage(blob, 'clipboard')
            setDocuments(prev => [...prev, doc])
          } catch (err) {
            console.error('Failed to process clipboard image:', err)
          } finally {
            setProcessing(false)
          }
        }
      }
    }

    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [])

  // ---- Document editing ----

  const updateDocument = useCallback((id: string, updates: Partial<ScannedDocument>) => {
    setDocuments(prev => prev.map(doc => {
      if (doc.id !== id) return doc

      // If notes changed, re-extract data
      if (updates.notes !== undefined && updates.notes !== doc.notes) {
        const reExtracted = extractReceiptData(doc.filename, updates.notes)
        return {
          ...doc,
          ...updates,
          extractedData: {
            ...doc.extractedData,
            // Only overwrite nulls — don't clobber manual edits
            possibleAmount: doc.extractedData.possibleAmount ?? reExtracted.possibleAmount,
            possibleDate: doc.extractedData.possibleDate ?? reExtracted.possibleDate,
            possibleVendor: doc.extractedData.possibleVendor ?? reExtracted.possibleVendor,
            possibleCategory: doc.extractedData.possibleCategory ?? reExtracted.possibleCategory,
          },
        }
      }

      return { ...doc, ...updates }
    }))
  }, [])

  const updateExtractedField = useCallback((
    id: string,
    field: keyof ScannedDocument['extractedData'],
    value: string | number | null,
  ) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === id
        ? { ...doc, extractedData: { ...doc.extractedData, [field]: value } }
        : doc,
    ))
  }, [])

  const removeDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(doc => doc.id !== id))
  }, [])

  /** Re-run OCR on a single document and update extracted fields */
  const rescanOCR = useCallback(async (id: string) => {
    const doc = documents.find(d => d.id === id)
    if (!doc) return
    const text = await runOCR(doc.imageDataUrl)
    const extracted = extractReceiptData(doc.filename, text)
    setDocuments(prev => prev.map(d =>
      d.id === id
        ? { ...d, ocrText: text || null, extractedData: extracted }
        : d,
    ))
  }, [documents])

  // ---- Batch actions ----

  const handleExportZip = useCallback(async () => {
    const batch: ScanBatch = {
      documents,
      createdAt: new Date().toISOString(),
      businessName: clientName,
      period: { year, month },
    }
    await exportScansAsZip(batch)
  }, [documents, clientName, year, month])

  const handleSendToPractitioner = useCallback(() => {
    const batch: ScanBatch = {
      documents,
      createdAt: new Date().toISOString(),
      businessName: clientName,
      period: { year, month },
    }
    onScansComplete?.(batch)
  }, [documents, clientName, year, month, onScansComplete])

  // ---- Render ----

  const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          Receipt & Document Scanner
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {clientName} &mdash; {monthName} {year}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={cameraActive ? stopCamera : startCamera}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors',
            cameraActive
              ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : 'bg-primary/10 text-primary hover:bg-primary/20',
          )}
        >
          {cameraActive ? <StopCircle className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
          {cameraActive ? 'Stop Camera' : 'Take Photo'}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload Files
        </button>

        <button
          type="button"
          onClick={() => {
            // Prompt the user to paste — the paste listener handles the rest
            navigator.clipboard.read?.().then(items => {
              for (const item of items) {
                const imageType = item.types.find(t => t.startsWith('image/'))
                if (imageType) {
                  item.getType(imageType).then(async blob => {
                    setProcessing(true)
                    try {
                      const doc = await processImage(blob, 'clipboard')
                      setDocuments(prev => [...prev, doc])
                    } catch (err) {
                      console.error('Failed to process clipboard image:', err)
                    } finally {
                      setProcessing(false)
                    }
                  })
                }
              }
            }).catch(() => {
              // Fallback: clipboard API not available, user can Ctrl+V
            })
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Clipboard className="h-3.5 w-3.5" />
          Paste from Clipboard
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFileInputChange}
          className="hidden"
        />
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {cameraError}
        </div>
      )}

      {/* Camera preview */}
      {cameraActive && (
        <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-auto w-full max-h-80 object-contain"
          />
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            <button
              type="button"
              onClick={snapPhoto}
              disabled={processing}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-900 shadow-lg transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              <Camera className="mr-1 inline h-3.5 w-3.5" />
              Snap
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="rounded-full bg-gray-800/80 px-4 py-2 text-xs font-medium text-white shadow-lg transition-colors hover:bg-gray-700"
            >
              <X className="mr-1 inline h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        ref={dropZoneRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400',
        )}
      >
        <ImagePlus className={cn('h-8 w-8', dragOver ? 'text-primary' : 'text-gray-400')} />
        <p className="text-xs text-gray-500">
          {dragOver ? 'Drop images here' : 'Drag & drop images here, or use the buttons above'}
        </p>
        <p className="text-[10px] text-gray-400">
          You can also paste images from your clipboard (Ctrl+V / Cmd+V)
        </p>
      </div>

      {/* Processing indicator */}
      {processing && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Processing image &amp; extracting text (OCR)…
        </div>
      )}

      {/* Gallery */}
      {documents.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-700">
              Scanned Items ({documents.length})
            </h4>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map(doc => (
              <ScannedItemCard
                key={doc.id}
                document={doc}
                onUpdate={updateDocument}
                onUpdateField={updateExtractedField}
                onRemove={removeDocument}
                onRescanOCR={rescanOCR}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {documents.length === 0 && !cameraActive && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center">
          <Camera className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm font-medium text-gray-500">No scans yet</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Take a photo, upload files, or paste an image to get started.
          </p>
        </div>
      )}

      {/* Batch actions */}
      {documents.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <span className="mr-auto text-xs text-gray-600">
            {documents.length} document{documents.length !== 1 ? 's' : ''} scanned
          </span>
          <button
            type="button"
            onClick={handleExportZip}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 transition-colors hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export ZIP
          </button>
          {onScansComplete && (
            <button
              type="button"
              onClick={handleSendToPractitioner}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              <Upload className="h-3.5 w-3.5" />
              Send to Bookkeeper
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Gallery item card ----------

interface ScannedItemCardProps {
  document: ScannedDocument
  onUpdate: (id: string, updates: Partial<ScannedDocument>) => void
  onUpdateField: (id: string, field: keyof ScannedDocument['extractedData'], value: string | number | null) => void
  onRemove: (id: string) => void
  onRescanOCR: (id: string) => Promise<void>
}

function ScannedItemCard({ document: doc, onUpdate, onUpdateField, onRemove, onRescanOCR }: ScannedItemCardProps) {
  const [rescanning, setRescanning] = useState(false)
  const [showOcrText, setShowOcrText] = useState(false)

  const handleRescan = async () => {
    setRescanning(true)
    try {
      await onRescanOCR(doc.id)
    } finally {
      setRescanning(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-gray-100">
        <img
          src={doc.thumbnailDataUrl}
          alt={doc.filename}
          className="h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={() => onRemove(doc.id)}
          className="absolute right-1.5 top-1.5 rounded-full bg-red-600 p-1 text-white shadow transition-colors hover:bg-red-700"
          title="Remove"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1">
          <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
            {doc.source === 'camera' ? 'Camera' : doc.source === 'clipboard' ? 'Clipboard' : 'Upload'}
          </span>
          {doc.ocrText && (
            <span className="rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] text-white">
              OCR ✓
            </span>
          )}
        </div>
      </div>

      {/* Metadata form */}
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between">
          <p className="truncate text-[11px] text-gray-500" title={doc.filename}>
            {doc.filename}
          </p>
          <button
            type="button"
            onClick={handleRescan}
            disabled={rescanning}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            title="Re-run OCR"
          >
            <RotateCw className={cn('h-3 w-3', rescanning && 'animate-spin')} />
            {rescanning ? 'Scanning...' : 'Re-scan'}
          </button>
        </div>

        {/* OCR extracted text (collapsible) */}
        {doc.ocrText && (
          <div className="rounded border border-gray-100 bg-gray-50">
            <button
              type="button"
              onClick={() => setShowOcrText(!showOcrText)}
              className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-medium text-gray-500 hover:text-gray-700"
            >
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Extracted Text ({doc.ocrText.length} chars)
              </span>
              {showOcrText ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showOcrText && (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap border-t border-gray-100 px-2 py-1.5 text-[10px] leading-relaxed text-gray-600">
                {doc.ocrText}
              </pre>
            )}
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Amount
          </label>
          <div className="relative mt-0.5">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              $
            </span>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={doc.extractedData.possibleAmount ?? ''}
              onChange={e => {
                const val = e.target.value === '' ? null : parseFloat(e.target.value)
                onUpdateField(doc.id, 'possibleAmount', val)
              }}
              className="w-full rounded border border-gray-200 py-1 pl-5 pr-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Date
          </label>
          <input
            type="date"
            value={doc.extractedData.possibleDate ?? ''}
            onChange={e => onUpdateField(doc.id, 'possibleDate', e.target.value || null)}
            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Vendor */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Vendor
          </label>
          <input
            type="text"
            placeholder="e.g. Office Depot"
            value={doc.extractedData.possibleVendor ?? ''}
            onChange={e => onUpdateField(doc.id, 'possibleVendor', e.target.value || null)}
            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Category
          </label>
          <select
            value={doc.extractedData.possibleCategory ?? ''}
            onChange={e => onUpdateField(doc.id, 'possibleCategory', e.target.value || null)}
            className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select category...</option>
            {CATEGORY_OPTIONS.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">
            Notes
          </label>
          <textarea
            rows={2}
            placeholder="Description, receipt details..."
            value={doc.notes}
            onChange={e => onUpdate(doc.id, { notes: e.target.value })}
            className="mt-0.5 w-full resize-none rounded border border-gray-200 px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </div>
  )
}
