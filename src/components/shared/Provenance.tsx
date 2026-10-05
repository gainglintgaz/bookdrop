// src/components/shared/Provenance.tsx
// Click-to-source badge that explains where an AI claim came from.
//
// Usage:
//   <Provenance data={{ type: 'rule', summary: 'Matched Costco vendor rule', ... }} />
//   <Provenance data={...} variant="inline">{anyChildren}</Provenance>
//
// Adheres to:
//   - .claude/rules/ai-first-principles.md §5 (anti-fabrication — content
//     should always be a verifiable claim, never invented)
//   - data-flywheel.md §4 (k=N suppression — locked aggregates render as
//     a "needs more data" hint instead of fake numbers)
//
// No external popover dependency. Click-outside via document listener.
// Keyboard accessible: Tab to focus, Space/Enter to toggle, Escape to close.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Info,
  Sparkles,
  Brain,
  Database,
  Calculator,
  GitCommitVertical,
  ShieldCheck,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isLockedByThreshold,
  provenanceLabel,
  type ProvenanceData,
  type ProvenanceSourceType,
} from '@/types/provenance'

// ──────────────────────────────────────────────────────────────────────────────
// Visual mapping per source type
// ──────────────────────────────────────────────────────────────────────────────

interface TypeStyle {
  icon: typeof Info
  badgeBg: string
  badgeText: string
  ringFocus: string
}

const TYPE_STYLES: Record<ProvenanceSourceType, TypeStyle> = {
  rule:       { icon: ShieldCheck,       badgeBg: 'bg-indigo-50',   badgeText: 'text-indigo-700',   ringFocus: 'focus:ring-indigo-300' },
  correction: { icon: GitCommitVertical, badgeBg: 'bg-emerald-50',  badgeText: 'text-emerald-700',  ringFocus: 'focus:ring-emerald-300' },
  aggregate:  { icon: Database,          badgeBg: 'bg-purple-50',   badgeText: 'text-purple-700',   ringFocus: 'focus:ring-purple-300' },
  llm:        { icon: Sparkles,          badgeBg: 'bg-amber-50',    badgeText: 'text-amber-700',    ringFocus: 'focus:ring-amber-300' },
  computed:   { icon: Calculator,        badgeBg: 'bg-gray-100',    badgeText: 'text-gray-700',     ringFocus: 'focus:ring-gray-300' },
  baseline:   { icon: Brain,             badgeBg: 'bg-amber-50/50', badgeText: 'text-amber-600',    ringFocus: 'focus:ring-amber-200' },
}

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export interface ProvenanceProps {
  data: ProvenanceData
  /** Visual variant. `badge` = standalone pill; `inline` = wraps a child string. */
  variant?: 'badge' | 'inline' | 'icon-only'
  /** When `variant=inline`, the child whose source is being explained. */
  children?: ReactNode
  className?: string
}

export function Provenance({ data, variant = 'badge', children, className }: ProvenanceProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const locked = isLockedByThreshold(data)
  const style = TYPE_STYLES[data.type]
  const Icon = locked ? Lock : style.icon
  const typeLabel = locked ? 'Locked' : provenanceLabel(data.type)

  const ariaLabel =
    locked
      ? `Source: ${typeLabel} — ${data.summary}. Needs more data to unlock.`
      : `Source: ${typeLabel} — ${data.summary}. Click for details.`

  const button = (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => setOpen(o => !o)}
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex items-center gap-1 rounded-full text-[10px] font-medium transition-colors focus:outline-none focus:ring-2',
        variant === 'icon-only' ? 'p-0.5' : 'px-1.5 py-0.5',
        locked ? 'bg-gray-100 text-gray-500' : `${style.badgeBg} ${style.badgeText}`,
        style.ringFocus,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {variant !== 'icon-only' && <span>{typeLabel}</span>}
    </button>
  )

  return (
    <span
      ref={wrapperRef}
      className={cn(
        'relative inline-flex items-center gap-1',
        variant === 'inline' && 'group',
        className,
      )}
    >
      {variant === 'inline' && children}
      {button}
      {open && <ProvenancePopover data={data} locked={locked} />}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────────────────────
// Popover
// ──────────────────────────────────────────────────────────────────────────────

interface PopoverProps {
  data: ProvenanceData
  locked: boolean
}

function ProvenancePopover({ data, locked }: PopoverProps) {
  return (
    <div
      role="dialog"
      aria-label="Source details"
      className={cn(
        'absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-gray-200 bg-white p-3 text-xs shadow-lg',
        'animate-in fade-in-0 zoom-in-95',
      )}
    >
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {locked ? 'Source: locked' : `Source: ${provenanceLabel(data.type)}`}
          </p>
          <p className="mt-0.5 text-sm font-medium text-gray-900">{data.summary}</p>
        </div>
        {data.confidence !== undefined && !locked && (
          <ConfidencePill value={data.confidence} />
        )}
      </div>

      {/* Locked-state honest copy (per data-flywheel.md §4 + ai-first-principles.md §6) */}
      {locked && data.sampleSize && (
        <div className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          Need <strong>{data.sampleSize.threshold} contributions</strong> to unlock —{' '}
          done {data.sampleSize.observed} / {data.sampleSize.threshold}.
        </div>
      )}

      {/* Detail */}
      {data.detail && !locked && (
        <p className="mb-2 leading-snug text-gray-600">{data.detail}</p>
      )}

      {/* Sample size (when present and not locked) */}
      {!locked && data.sampleSize && (
        <p className="mb-2 text-[11px] text-gray-500">
          Based on <strong>{data.sampleSize.observed}</strong>
          {data.sampleSize.threshold ? ` of ${data.sampleSize.threshold}+ required` : ''} data
          points.
        </p>
      )}

      {/* Formula */}
      {data.formula && !locked && (
        <p className="mb-2 rounded bg-gray-50 px-2 py-1 font-mono text-[11px] text-gray-700">
          {data.formula}
        </p>
      )}

      {/* Citations */}
      {!locked && data.citations && data.citations.length > 0 && (
        <div className="border-t border-gray-100 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Sources
          </p>
          <ul className="space-y-1">
            {data.citations.map((c, i) => (
              <li key={i} className="leading-tight">
                {c.href ? (
                  <a
                    href={c.href}
                    className="text-indigo-600 hover:underline"
                  >
                    {c.label}
                  </a>
                ) : (
                  <span className="text-gray-700">{c.label}</span>
                )}
                {c.meta && <span className="ml-1 text-[10px] text-gray-400">· {c.meta}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ConfidencePill({ value }: { value: ProvenanceData['confidence'] }) {
  if (value === undefined) return null
  // Normalize numeric to a tier
  let tier: 'high' | 'medium' | 'low'
  let display: string
  if (typeof value === 'number') {
    tier = value >= 0.85 ? 'high' : value >= 0.6 ? 'medium' : 'low'
    display = `${Math.round(value * 100)}%`
  } else {
    tier = value
    display = value
  }
  const colors: Record<typeof tier, string> = {
    high: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-rose-100 text-rose-700',
  }
  return (
    <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium', colors[tier])}>
      {display}
    </span>
  )
}
