// src/components/shared/LockedFeatureGate.tsx
//
// Trust Ladder gating UI per ai-first-principles.md §3 + §4 + §6.
//
// Three states:
//   • LOCKED  — feature exists but user hasn't earned access. Honest "needs N
//               more X" copy with progress meter. Used at Loop 0-1.
//   • PREVIEW — feature renders, but with a sample-size disclosure ("based on
//               1 cycle — confidence is low until you've completed 2-3"). Used
//               at Loop 2.
//   • AVAILABLE — full feature, no apologies. Used at Loop 3+.
//
// The component renders LOCKED or PREVIEW. AVAILABLE means: don't use this
// component, just render the feature.
//
// Anti-pattern this prevents (per ai-first-principles.md §5 rule 1):
//   `if (no data) { showFakeNumber() }`
// Correct pattern this enforces:
//   `if (no data) { <LockedFeatureGate /> }` — never fabricate.

import { Lock, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LockedFeatureGateProps {
  /** Feature title — shown in the locked card header. */
  title: string
  /** What the feature does for the user, in 1 sentence. */
  description: string
  /** What input still needs to be supplied to unlock the feature. */
  inputLabel: string
  /** Current progress on the input (e.g. months of statements uploaded). */
  observed: number
  /** Threshold required to fully unlock (e.g. 3 months of statements). */
  required: number
  /** Optional CTA label for the unlock action. */
  ctaLabel?: string
  /** Optional CTA handler. If omitted, no button is rendered. */
  onCta?: () => void
  className?: string
}

/**
 * Render LOCKED state for an AI feature that hasn't earned its data yet.
 * Honest copy invites the user to feed the loop instead of hiding the feature
 * entirely.
 */
export function LockedFeatureGate({
  title, description, inputLabel, observed, required, ctaLabel, onCta, className,
}: LockedFeatureGateProps) {
  const remaining = Math.max(0, required - observed)
  const pct = required > 0 ? Math.min(100, Math.round((observed / required) * 100)) : 0

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-gray-50 p-5',
        className,
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
          <Lock className="h-4 w-4 text-amber-700" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            {title}
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
              Locked
            </span>
          </h4>
          <p className="mt-0.5 text-xs text-gray-600">{description}</p>
        </div>
      </div>

      {/* Honest progress copy */}
      <div className="mb-2 text-xs text-gray-700">
        Need <strong className="text-gray-900">{required}</strong> {inputLabel} to unlock —{' '}
        done <strong className="text-gray-900">{observed}</strong> of {required}.
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={observed} aria-valuemin={0} aria-valuemax={required} aria-label={`${observed} of ${required} ${inputLabel}`}>
        <div
          className="h-full bg-amber-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* CTA */}
      {onCta && ctaLabel && remaining > 0 && (
        <button
          type="button"
          onClick={onCta}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-primary-light"
        >
          <Sparkles className="h-3 w-3" />
          {ctaLabel}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PreviewBanner — for partial-data state (Loop 2 = data exists but k=N not met)
// ─────────────────────────────────────────────────────────────────────────────

export interface PreviewBannerProps {
  observed: number
  required: number
  /** What this feature is showing (e.g. "trends", "forecast"). */
  featureName: string
}

/**
 * Sample-size disclosure banner for PREVIEW state. Renders above the actual
 * feature output so the user always sees the disclosure when results show.
 *
 * Per ai-first-principles.md §3 (PREVIEW state) — confidence-low badge with
 * the n=N sample size visible inline.
 */
export function PreviewBanner({ observed, required, featureName }: PreviewBannerProps) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex-1 text-xs">
        <p className="font-medium text-amber-900">
          Preview — based on {observed} of {required} expected {observed === 1 ? 'period' : 'periods'}
        </p>
        <p className="mt-0.5 text-amber-700">
          {featureName} numbers below are early-signal only. Confidence stays low until you've completed {required}+ periods.
        </p>
      </div>
    </div>
  )
}
