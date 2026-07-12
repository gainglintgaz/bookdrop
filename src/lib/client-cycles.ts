// client-cycles.ts — Phase 5 loop count for Trust Ladder gates.
// One "cycle" = one period where the client completed required uploads
// (uploadedDocs >= requiredDocs when requiredDocs > 0).
// Used to lock reminder personalization until Loop 2+.

export const REMINDER_PERSONALIZATION_UNLOCKS_AT = 2 as const

export interface ClientPeriodSnapshot {
  year: number
  month: number
  requiredDocs: number
  uploadedRequiredDocs: number
}

/**
 * Count completed monthly cycles for a client.
 * Incomplete or zero-requirement periods do not count.
 */
export function countCompletedCycles(periods: ClientPeriodSnapshot[]): number {
  return periods.filter(
    p => p.requiredDocs > 0 && p.uploadedRequiredDocs >= p.requiredDocs,
  ).length
}

export type ReminderPersonalizationState =
  | {
      unlocked: true
      loopCount: number
      unlocksAt: typeof REMINDER_PERSONALIZATION_UNLOCKS_AT
    }
  | {
      unlocked: false
      loopCount: number
      unlocksAt: typeof REMINDER_PERSONALIZATION_UNLOCKS_AT
      lockedCopy: string
    }

/**
 * Reminder personalization (per-client preferred day / tone inference)
 * is LOCKED until the client has completed 2 full document cycles.
 * Honest empty/locked copy — never invent "they prefer day 3".
 */
export function getReminderPersonalizationState(
  loopCount: number,
): ReminderPersonalizationState {
  const unlocksAt = REMINDER_PERSONALIZATION_UNLOCKS_AT
  if (loopCount >= unlocksAt) {
    return { unlocked: true, loopCount, unlocksAt }
  }
  return {
    unlocked: false,
    loopCount,
    unlocksAt,
    lockedCopy:
      `Personalized reminder timing unlocks after ${unlocksAt} complete months for this client ` +
      `(done ${loopCount} / ${unlocksAt}). Until then, use your firm default schedule only.`,
  }
}

/**
 * Infer preferred submission day only when unlocked and enough samples.
 * Returns null when locked or sparse — caller must not invent a day.
 */
export function inferPreferredSubmissionDay(params: {
  loopCount: number
  /** Day-of-month of historical full submissions (1–31). */
  submissionDays: number[]
  minSamples?: number
}): { day: number; sampleSize: number; dataBasis: string } | null {
  const gate = getReminderPersonalizationState(params.loopCount)
  if (!gate.unlocked) return null

  const minSamples = params.minSamples ?? 2
  const days = params.submissionDays.filter(d => d >= 1 && d <= 31)
  if (days.length < minSamples) return null

  // Median day
  const sorted = [...days].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const day =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid]

  return {
    day,
    sampleSize: days.length,
    dataBasis: `Based on ${days.length} complete months for this client (median submission day).`,
  }
}
