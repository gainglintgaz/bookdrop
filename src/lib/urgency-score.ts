// src/lib/urgency-score.ts
//
// V1.1 — AI-first pivot D.5: surface the clients most likely to need attention
// this week, instead of an alphabetical wall.
//
// Honesty (ai-first-principles.md §5): the score is built ONLY from data we
// actually have. When a factor has no real signal (e.g. no late-rate history
// yet), it contributes ZERO — never a fabricated value. The result is a
// transparent 0-100 with a per-factor breakdown the UI can show on hover.

import { computeSubmissionStatus } from '@/types'
import type { ClientWithStatus, SubmissionStatus } from '@/types'

/** Status contribution — not-started is the most urgent (nothing received). */
const STATUS_WEIGHT: Record<SubmissionStatus, number> = {
  not_started: 40,
  missing: 30,
  partial: 15,
  complete: 0,
}

export interface UrgencyBreakdown {
  /** Final 0-100 score. Higher = needs attention sooner. */
  score: number
  /** Bucket for badge color. */
  level: 'high' | 'medium' | 'low' | 'none'
  factors: {
    status: number          // from submission status
    incompleteDocs: number  // from fraction of required docs missing
    lateHistory: number     // from historical lateRate (0 when unknown)
  }
  /** Plain-English reason, derived from the dominant factor. */
  reason: string
}

/**
 * Compute an urgency score for one client. Pure + deterministic.
 *
 * Factors (max contribution):
 *   - status:          0-40  (not_started highest)
 *   - incompleteDocs:  0-30  (fraction of required docs not yet received)
 *   - lateHistory:     0-30  (historical lateRate; 0 when null — no fabrication)
 */
export function urgencyScore(client: ClientWithStatus): UrgencyBreakdown {
  // Recompute status from requirements so the score never trusts a stale field.
  const status = client.requirements.length > 0
    ? computeSubmissionStatus(client.requirements)
    : client.submissionStatus

  const statusFactor = STATUS_WEIGHT[status] ?? 0

  const required = client.requirements.filter(r => r.required)
  const missingCount = required.filter(r => r.uploads.length === 0).length
  const incompleteFraction = required.length > 0 ? missingCount / required.length : 0
  const incompleteFactor = Math.round(incompleteFraction * 30)

  // Late-rate is null until there's history. Null → 0 (honest), not assumed.
  const lateFactor = client.lateRate !== null
    ? Math.round(Math.min(1, Math.max(0, client.lateRate)) * 30)
    : 0

  const score = Math.min(100, statusFactor + incompleteFactor + lateFactor)

  const level: UrgencyBreakdown['level'] =
    score >= 50 ? 'high' :
    score >= 25 ? 'medium' :
    score > 0 ? 'low' :
    'none'

  // Reason = dominant factor.
  let reason: string
  if (score === 0) {
    reason = 'All required documents received.'
  } else if (statusFactor >= incompleteFactor && statusFactor >= lateFactor) {
    reason = status === 'not_started'
      ? 'No documents received yet this period.'
      : status === 'missing'
        ? 'Required documents still missing.'
        : 'Partial submission — some documents outstanding.'
  } else if (incompleteFactor >= lateFactor) {
    reason = `${missingCount} of ${required.length} required documents outstanding.`
  } else {
    reason = 'Historically late submitter — follow up early.'
  }

  return {
    score,
    level,
    factors: { status: statusFactor, incompleteDocs: incompleteFactor, lateHistory: lateFactor },
    reason,
  }
}

/**
 * Sort clients by urgency (most urgent first). Stable: ties fall back to
 * business name so the order is deterministic across renders.
 */
export function sortByUrgency(clients: ClientWithStatus[]): ClientWithStatus[] {
  return [...clients]
    .map(c => ({ c, u: urgencyScore(c).score }))
    .sort((a, b) => b.u - a.u || a.c.business_name.localeCompare(b.c.business_name))
    .map(x => x.c)
}
