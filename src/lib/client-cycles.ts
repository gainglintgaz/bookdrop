// client-cycles.ts — Phase 5 / 5.1 Trust Ladder loop count.
// One cycle = one period where all *currently required* docs have ≥1 upload.
// Multi-period history powers reminder personalization unlock (Loop 2+).
// Never invents completion days or loop counts.

export const REMINDER_PERSONALIZATION_UNLOCKS_AT = 2 as const
/** Max months of history considered for loop gates. */
export const CYCLE_LOOKBACK_MONTHS = 12 as const

export interface ClientPeriodSnapshot {
  year: number
  month: number
  requiredDocs: number
  uploadedRequiredDocs: number
  complete: boolean
  /**
   * Day-of-month (1–31) of the latest required upload when complete.
   * null if incomplete or missing timestamps.
   */
  completionDay: number | null
}

export interface UploadHistoryRow {
  requirement_id: string
  period_year: number
  period_month: number
  uploaded_at: string
}

export interface RequirementRef {
  id: string
  required: boolean
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Inclusive list of (year, month) for lookback ending at endYear/endMonth. */
export function listLookbackPeriods(
  endYear: number,
  endMonth: number,
  months: number = CYCLE_LOOKBACK_MONTHS,
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = []
  let y = endYear
  let m = endMonth
  for (let i = 0; i < months; i++) {
    out.push({ year: y, month: m })
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return out
}

/**
 * Build per-period completeness snapshots from current requirements + upload history.
 * Only periods that appear in lookback are returned (including empty incomplete months
 * that fall in the window — empty months stay incomplete and do not count as cycles).
 *
 * Uses *current* required set against historical uploads (disclosed assumption).
 */
export function buildPeriodSnapshots(params: {
  requirements: RequirementRef[]
  uploads: UploadHistoryRow[]
  /** Inclusive end of lookback window (usually selected period or "now"). */
  endYear: number
  endMonth: number
  lookbackMonths?: number
}): ClientPeriodSnapshot[] {
  const requiredIds = params.requirements.filter(r => r.required).map(r => r.id)
  const requiredDocs = requiredIds.length
  const lookback = listLookbackPeriods(
    params.endYear,
    params.endMonth,
    params.lookbackMonths ?? CYCLE_LOOKBACK_MONTHS,
  )
  const lookbackSet = new Set(lookback.map(p => periodKey(p.year, p.month)))

  // Group uploads by period
  const byPeriod = new Map<
    string,
    { year: number; month: number; rows: UploadHistoryRow[] }
  >()
  for (const u of params.uploads) {
    const key = periodKey(u.period_year, u.period_month)
    if (!lookbackSet.has(key)) continue
    let bucket = byPeriod.get(key)
    if (!bucket) {
      bucket = { year: u.period_year, month: u.period_month, rows: [] }
      byPeriod.set(key, bucket)
    }
    bucket.rows.push(u)
  }

  const snapshots: ClientPeriodSnapshot[] = []
  for (const p of lookback) {
    const key = periodKey(p.year, p.month)
    const rows = byPeriod.get(key)?.rows ?? []
    if (requiredDocs === 0) {
      snapshots.push({
        year: p.year,
        month: p.month,
        requiredDocs: 0,
        uploadedRequiredDocs: 0,
        complete: false,
        completionDay: null,
      })
      continue
    }

    const uploadedRequired = new Set(
      rows.filter(r => requiredIds.includes(r.requirement_id)).map(r => r.requirement_id),
    )
    const uploadedRequiredDocs = uploadedRequired.size
    const complete = uploadedRequiredDocs >= requiredDocs

    let completionDay: number | null = null
    if (complete) {
      const requiredRows = rows.filter(r => requiredIds.includes(r.requirement_id))
      let latestMs = 0
      for (const r of requiredRows) {
        const t = Date.parse(r.uploaded_at)
        if (!Number.isNaN(t) && t >= latestMs) {
          latestMs = t
          completionDay = new Date(t).getUTCDate()
        }
      }
    }

    snapshots.push({
      year: p.year,
      month: p.month,
      requiredDocs,
      uploadedRequiredDocs,
      complete,
      completionDay,
    })
  }

  return snapshots
}

/** Count complete cycles only. */
export function countCompletedCycles(periods: ClientPeriodSnapshot[]): number {
  return periods.filter(p => p.complete).length
}

/** Completion days from complete cycles only (for median preferred-day inference). */
export function completionDaysFromSnapshots(periods: ClientPeriodSnapshot[]): number[] {
  return periods
    .filter(p => p.complete && p.completionDay != null)
    .map(p => p.completionDay as number)
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
 * Reminder personalization is LOCKED until 2 complete months for this client.
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
 * Returns null when locked or sparse — never invent a day.
 */
export function inferPreferredSubmissionDay(params: {
  loopCount: number
  submissionDays: number[]
  minSamples?: number
}): { day: number; sampleSize: number; dataBasis: string } | null {
  const gate = getReminderPersonalizationState(params.loopCount)
  if (!gate.unlocked) return null

  const minSamples = params.minSamples ?? 2
  const days = params.submissionDays.filter(d => d >= 1 && d <= 31)
  if (days.length < minSamples) return null

  const sorted = [...days].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const day =
    sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid]

  return {
    day,
    sampleSize: days.length,
    dataBasis: `Based on ${days.length} complete months for this client (median completion day). Using current requirement list against past uploads.`,
  }
}

/** Aggregate view for UI strip. */
export function summarizeClientCycles(snapshots: ClientPeriodSnapshot[]): {
  loopCount: number
  completePeriods: Array<{ year: number; month: number; completionDay: number | null }>
  preferredDay: { day: number; sampleSize: number; dataBasis: string } | null
  reminderGate: ReminderPersonalizationState
} {
  const loopCount = countCompletedCycles(snapshots)
  const reminderGate = getReminderPersonalizationState(loopCount)
  const preferredDay = inferPreferredSubmissionDay({
    loopCount,
    submissionDays: completionDaysFromSnapshots(snapshots),
  })
  return {
    loopCount,
    completePeriods: snapshots
      .filter(s => s.complete)
      .map(s => ({ year: s.year, month: s.month, completionDay: s.completionDay })),
    preferredDay,
    reminderGate,
  }
}
