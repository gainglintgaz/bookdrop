// aggregate-gate.ts — Phase 5: cross-firm cohort floor (k≥N).
// Never render "firms like yours" stats below the privacy/honesty floor.
// Default N=5 per data-flywheel.md / aggregate-design.md.

export const DEFAULT_COHORT_FLOOR = 5 as const

export function meetsCohortFloor(
  distinctContributors: number,
  floor: number = DEFAULT_COHORT_FLOOR,
): boolean {
  return Number.isFinite(distinctContributors) && distinctContributors >= floor
}

export function cohortAggregateOrNull<T>(
  distinctContributors: number,
  value: T,
  floor: number = DEFAULT_COHORT_FLOOR,
): T | null {
  return meetsCohortFloor(distinctContributors, floor) ? value : null
}

/** Locked-state copy when below floor — honest, no promised dates. */
export function cohortLockedCopy(
  current: number,
  floor: number = DEFAULT_COHORT_FLOOR,
): string {
  return (
    `Cross-firm comparison needs ${floor}+ contributing firms ` +
    `(done ${Math.max(0, current)} / ${floor}). We won't show numbers until the sample is honest.`
  )
}
