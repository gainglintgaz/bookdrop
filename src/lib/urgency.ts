// src/lib/urgency.ts
// DATA_FLYWHEEL D.5 — dashboard sort by who needs attention now.
// Pure local math. No LLM. No fabricated history when lateRate is null.

import type { ClientWithStatus, SubmissionStatus } from '@/types'

export interface UrgencyResult {
  clientId: string
  score: number // 0–100, higher = act sooner
  reasons: string[]
  band: 'critical' | 'high' | 'medium' | 'low'
}

const STATUS_BASE: Record<SubmissionStatus, number> = {
  not_started: 52,
  missing: 48,
  partial: 36,
  complete: 18, // package ready for review — still action, lower than chase
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Demo/historical field `lateRate` is stored as on-time fraction 0–1
 * (see demo-data: 0.92 reliable, 0.33 problematic). Higher on-time → lower urgency.
 * null = no history → no historical boost (honest empty).
 */
function historicalLateBoost(onTimeFraction: number | null): { boost: number; reason?: string } {
  if (onTimeFraction == null) return { boost: 0 }
  const lateFraction = clamp(1 - onTimeFraction, 0, 1)
  if (lateFraction < 0.15) return { boost: 0 }
  const boost = Math.round(lateFraction * 28)
  return {
    boost,
    reason: `Historical on-time ~${Math.round(onTimeFraction * 100)}%`,
  }
}

function daysSinceLastUpload(client: ClientWithStatus, now: Date): number | null {
  const times = client.requirements
    .flatMap(r => r.uploads)
    .map(u => new Date(u.uploaded_at).getTime())
    .filter(t => !Number.isNaN(t))
  if (times.length === 0) return null
  const last = Math.max(...times)
  return Math.max(0, Math.floor((now.getTime() - last) / (1000 * 60 * 60 * 24)))
}

function dayOfMonthPressure(now: Date, status: SubmissionStatus): { boost: number; reason?: string } {
  if (status === 'complete') return { boost: 0 }
  const day = now.getDate()
  if (day >= 15) return { boost: 14, reason: `Day ${day} of month — late window` }
  if (day >= 8) return { boost: 8, reason: `Day ${day} of month — follow-up window` }
  if (day >= 5) return { boost: 4, reason: `Day ${day} of month` }
  return { boost: 0 }
}

/** Compute urgency for one client for the current period view. */
export function computeClientUrgency(
  client: ClientWithStatus,
  now: Date = new Date(),
): UrgencyResult {
  const reasons: string[] = []
  let score = STATUS_BASE[client.submissionStatus] ?? 20

  const required = client.requirements.filter(r => r.required)
  const incomplete = required.filter(r => r.uploads.length === 0).length
  if (incomplete > 0) {
    const docBoost = Math.min(40, incomplete * 12)
    score += docBoost
    reasons.push(`${incomplete} required doc${incomplete === 1 ? '' : 's'} still missing`)
  }

  if (client.submissionStatus === 'complete') {
    reasons.push('All required docs in — package ready for review')
    // Surface low-confidence AI items if present
    const lowConf = client.requirements
      .flatMap(r => r.uploads)
      .reduce((n, u) => n + (u.categorization_summary?.lowConfidence ?? 0), 0)
    if (lowConf > 0) {
      score += Math.min(20, lowConf * 3)
      reasons.push(`${lowConf} low-confidence line${lowConf === 1 ? '' : 's'} to review`)
    }
  } else if (client.submissionStatus === 'partial') {
    reasons.push('Partial submission — needs nudge')
  } else if (client.submissionStatus === 'not_started' || client.submissionStatus === 'missing') {
    reasons.push('No complete submission this period')
  }

  const hist = historicalLateBoost(client.lateRate)
  score += hist.boost
  if (hist.reason) reasons.push(hist.reason)

  const days = daysSinceLastUpload(client, now)
  if (days === null && client.submissionStatus !== 'complete') {
    score += 10
    reasons.push('No uploads yet this period')
  } else if (days != null && days >= 7 && client.submissionStatus !== 'complete') {
    const staleBoost = Math.min(16, Math.floor(days / 3))
    score += staleBoost
    reasons.push(`Last upload ${days} day${days === 1 ? '' : 's'} ago`)
  }

  const pressure = dayOfMonthPressure(now, client.submissionStatus)
  score += pressure.boost
  if (pressure.reason) reasons.push(pressure.reason)

  score = clamp(Math.round(score), 0, 100)

  const band: UrgencyResult['band'] =
    score >= 70 ? 'critical' : score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low'

  // Cap reasons for UI
  return {
    clientId: client.id,
    score,
    reasons: reasons.slice(0, 3),
    band,
  }
}

/** Sort clients highest urgency first. Stable tie-break by business name. */
export function sortClientsByUrgency(
  clients: ClientWithStatus[],
  now: Date = new Date(),
): Array<ClientWithStatus & { urgency: UrgencyResult }> {
  const withUrgency = clients.map(c => ({
    ...c,
    urgency: computeClientUrgency(c, now),
  }))
  withUrgency.sort((a, b) => {
    if (b.urgency.score !== a.urgency.score) return b.urgency.score - a.urgency.score
    return a.business_name.localeCompare(b.business_name)
  })
  return withUrgency
}

export function urgencyBandLabel(band: UrgencyResult['band']): string {
  switch (band) {
    case 'critical':
      return 'Act now'
    case 'high':
      return 'High'
    case 'medium':
      return 'Medium'
    case 'low':
      return 'Low'
  }
}
