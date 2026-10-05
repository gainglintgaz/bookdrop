// src/components/practitioner/SignaturePlacementDesigner.tsx
//
// Block 3 Phase E3 stretch (shipped 2026-05-06).
//
// Visual click-to-drop UX for designating where each signatory's signature,
// initials, date, or text-field placement should land on a multi-page PDF.
//
// Design intent:
//   • Bookkeeper sees the actual PDF rendered (multi-page scrollable list)
//   • Picks a signatory + placement type from the toolbar
//   • Clicks anywhere on a page → a marker appears at that pixel
//   • Pixel coords convert to PDF points (bottom-left origin per pdf-lib)
//     which are stored on the signatory's `placement` jsonb array
//   • Click an existing marker to remove it
//
// V1.1 stretch deferred:
//   • Drag-to-reposition existing markers
//   • Resize handles
//   • Per-coord input fields for keyboard-only operation
//   • Auto-detection of signature lines via PDF text scan
//
// PDF.js renders each page to a canvas at a fixed scale. We track placement
// coordinates in PDF points (page-space) so they survive zoom + page-size
// changes. The DB stores the same point coords; api/sign-document.ts uses
// them directly with pdf-lib at sign time (which uses the same point system).

import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { Loader2, X, Pencil, Type, Calendar, FileSignature } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SignaturePlacement } from '@/types'

// Reuse the worker config established in parse-bank-statement.ts. Setting it
// here too is safe (idempotent) and protects this component from being
// loaded before the parser.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

/** Default pixel size of each placement type at the rendered scale. */
const DEFAULT_SIZE: Record<SignaturePlacement['type'], { width: number; height: number }> = {
  signature: { width: 200, height: 60 },
  initials: { width: 60, height: 40 },
  date: { width: 100, height: 24 },
  text: { width: 150, height: 24 },
}

/** Render scale — affects clarity vs. memory. 1.5 is a good default for letter-sized PDFs. */
const RENDER_SCALE = 1.5

interface SignatoryOption {
  id: string                  // local key — stable for this designer session
  label: string               // e.g. "Sue Smith (spouse)"
  color: string               // distinct color per signatory for marker visualization
  /** Existing placements for this signatory (will be merged with newly added ones). */
  placements: SignaturePlacement[]
}

export interface SignaturePlacementDesignerProps {
  /** PDF byte stream to render. Either an ArrayBuffer or a URL string. */
  pdfSource: ArrayBuffer | string
  /** All signatories available for placement assignment. */
  signatories: SignatoryOption[]
  /** Called when bookkeeper clicks Done — returns updated placements per signatory. */
  onDone: (placementsBySignatory: Record<string, SignaturePlacement[]>) => void
  onCancel: () => void
}

interface RenderedPage {
  pageNumber: number      // 1-indexed
  width: number           // CSS pixels
  height: number          // CSS pixels
  pdfHeight: number       // page height in PDF points (used for y-coord conversion)
  canvas: HTMLCanvasElement
}

const PLACEMENT_ICONS: Record<SignaturePlacement['type'], typeof FileSignature> = {
  signature: FileSignature,
  initials: Pencil,
  date: Calendar,
  text: Type,
}

const TYPE_LABELS: Record<SignaturePlacement['type'], string> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text field',
}

export function SignaturePlacementDesigner({
  pdfSource, signatories, onDone, onCancel,
}: SignaturePlacementDesignerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Toolbar state
  const [activeSignatory, setActiveSignatory] = useState<string>(signatories[0]?.id ?? '')
  const [activeType, setActiveType] = useState<SignaturePlacement['type']>('signature')

  // Track placements per signatory id. Initialize from props so existing
  // placements are visible and editable.
  const [placements, setPlacements] = useState<Record<string, SignaturePlacement[]>>(() => {
    const map: Record<string, SignaturePlacement[]> = {}
    for (const s of signatories) map[s.id] = [...s.placements]
    return map
  })

  // ── Render the PDF ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function render() {
      try {
        setLoading(true)
        setError(null)
        const pdfDoc = await pdfjsLib.getDocument(
          typeof pdfSource === 'string' ? { url: pdfSource } : { data: pdfSource },
        ).promise

        const newPages: RenderedPage[] = []
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) return
          const page = await pdfDoc.getPage(i)
          const viewport = page.getViewport({ scale: RENDER_SCALE })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport, canvas }).promise

          // Get the unscaled (PDF point) height so we can convert click y-coords
          // (top-left origin in CSS) into PDF point y-coords (bottom-left origin)
          const naturalViewport = page.getViewport({ scale: 1 })
          newPages.push({
            pageNumber: i,
            width: viewport.width,
            height: viewport.height,
            pdfHeight: naturalViewport.height,
            canvas,
          })
        }

        if (cancelled) return
        setPages(newPages)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render PDF')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    render()
    return () => { cancelled = true }
  }, [pdfSource])

  // ── Click-to-place handler ──────────────────────────────────────────────
  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, page: RenderedPage) => {
    if (!activeSignatory) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xPx = e.clientX - rect.left
    const yPxFromTop = e.clientY - rect.top

    // Convert to PDF points (bottom-left origin per pdf-lib).
    // pdf.js renders at RENDER_SCALE so we divide by it to get point coords.
    const xPoints = xPx / RENDER_SCALE
    const yPointsFromTop = yPxFromTop / RENDER_SCALE
    const yPoints = page.pdfHeight - yPointsFromTop  // flip Y

    const size = DEFAULT_SIZE[activeType]
    const newPlacement: SignaturePlacement = {
      page: page.pageNumber,
      type: activeType,
      x: Math.round(xPoints - size.width / 2),  // center the box on the click
      y: Math.round(yPoints - size.height / 2),
      width: size.width,
      height: size.height,
    }

    setPlacements(prev => ({
      ...prev,
      [activeSignatory]: [...(prev[activeSignatory] ?? []), newPlacement],
    }))
  }

  // ── Click marker to remove ──────────────────────────────────────────────
  const removeMarker = (signatoryId: string, index: number) => {
    setPlacements(prev => ({
      ...prev,
      [signatoryId]: (prev[signatoryId] ?? []).filter((_, i) => i !== index),
    }))
  }

  // ── Render the markers overlaid on a page ───────────────────────────────
  const renderMarkers = (page: RenderedPage) => {
    const markers: Array<{ signatoryId: string; idx: number; placement: SignaturePlacement }> = []
    for (const [sigId, placementsForSig] of Object.entries(placements)) {
      placementsForSig.forEach((p, idx) => {
        if (p.page === page.pageNumber) {
          markers.push({ signatoryId: sigId, idx, placement: p })
        }
      })
    }
    return markers.map(({ signatoryId, idx, placement }) => {
      const sig = signatories.find(s => s.id === signatoryId)
      const Icon = PLACEMENT_ICONS[placement.type]
      // Convert back to CSS pixel coords for rendering
      const xPx = placement.x * RENDER_SCALE
      const widthPx = placement.width * RENDER_SCALE
      const heightPx = placement.height * RENDER_SCALE
      const yPxFromTop = (page.pdfHeight - placement.y - placement.height) * RENDER_SCALE

      return (
        <div
          key={`${signatoryId}-${idx}`}
          onClick={(e) => { e.stopPropagation(); removeMarker(signatoryId, idx) }}
          role="button"
          tabIndex={0}
          aria-label={`Remove ${placement.type} placement for ${sig?.label ?? 'signatory'}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              removeMarker(signatoryId, idx)
            }
          }}
          className="group absolute flex cursor-pointer items-center justify-center rounded border-2 border-dashed text-[10px] font-semibold transition-all hover:bg-white/95 hover:shadow-lg"
          style={{
            left: xPx,
            top: yPxFromTop,
            width: widthPx,
            height: heightPx,
            borderColor: sig?.color ?? '#666',
            backgroundColor: `${sig?.color ?? '#666'}22`,
            color: sig?.color ?? '#666',
          }}
          title={`${sig?.label ?? 'Signatory'} — ${TYPE_LABELS[placement.type]} (click to remove)`}
        >
          <Icon className="mr-1 h-3 w-3" />
          {TYPE_LABELS[placement.type]}
          <X className="ml-1 h-3 w-3 opacity-0 group-hover:opacity-100" />
        </div>
      )
    })
  }

  // ── Mount canvases into the container ───────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || pages.length === 0) return
    // Append each canvas into its placeholder parent
    for (const page of pages) {
      const parent = containerRef.current.querySelector(
        `[data-page-canvas="${page.pageNumber}"]`,
      )
      if (parent && !parent.contains(page.canvas)) {
        parent.innerHTML = ''
        parent.appendChild(page.canvas)
      }
    }
  }, [pages])

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-gray-500">Rendering document…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">Could not render PDF</p>
        <p className="mt-1 text-xs text-red-700">{error}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-700">Signatory:</span>
          <select
            value={activeSignatory}
            onChange={e => setActiveSignatory(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            aria-label="Active signatory for placement"
          >
            {signatories.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs font-semibold text-gray-700">Place:</span>
          {(['signature', 'initials', 'date', 'text'] as const).map(type => {
            const Icon = PLACEMENT_ICONS[type]
            const active = activeType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'bg-primary text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100',
                )}
                aria-pressed={active}
                aria-label={`Place ${TYPE_LABELS[type]}`}
              >
                <Icon className="h-3 w-3" />
                {TYPE_LABELS[type]}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onDone(placements)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90"
          >
            Save placements
          </button>
        </div>
      </div>

      {/* Hint banner */}
      <div className="border-b border-gray-100 bg-blue-50/50 px-4 py-2 text-[11px] text-blue-800">
        Click anywhere on a page to drop a {TYPE_LABELS[activeType].toLowerCase()} for{' '}
        <strong>{signatories.find(s => s.id === activeSignatory)?.label ?? '—'}</strong>.
        Click an existing marker to remove it.
      </div>

      {/* PDF preview */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-200 p-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {pages.map(page => (
            <div
              key={page.pageNumber}
              className="relative cursor-crosshair rounded shadow-md"
              onClick={(e) => handlePageClick(e, page)}
              data-page-canvas={page.pageNumber}
              style={{ width: page.width, height: page.height }}
            >
              {/* Canvas mounted via useEffect into [data-page-canvas] */}

              {/* Page number watermark */}
              <div className="pointer-events-none absolute bottom-1 right-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                Page {page.pageNumber} of {pages.length}
              </div>

              {/* Markers */}
              {renderMarkers(page)}
            </div>
          ))}
        </div>
      </div>

      {/* Footer summary */}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-600">
        {Object.entries(placements).map(([sigId, ps]) => {
          const sig = signatories.find(s => s.id === sigId)
          if (!sig) return null
          return (
            <span key={sigId} className="mr-4 inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: sig.color }} />
              <strong>{sig.label}:</strong> {ps.length} placement{ps.length === 1 ? '' : 's'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
