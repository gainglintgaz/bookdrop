// firm-aggregates.ts — P4 firm brain: vendor → category suggestions above k floor.
// Cross-firm aggregates suppressed below DEFAULT_COHORT_FLOOR (privacy + honesty).

import { meetsCohortFloor, cohortLockedCopy, DEFAULT_COHORT_FLOOR } from './aggregate-gate'
import { normalizeVendor } from './category-memory'

export interface FirmCategoryObservation {
  /** Already normalized preferred; will normalize if raw. */
  vendorPattern: string
  category: string
  /** Distinct bookkeeper/firm ids contributing (not users within one firm for V1). */
  contributorId: string
}

export interface FirmCategorySuggestion {
  vendorPattern: string
  topCategory: string
  topShare: number
  contributorCount: number
  observationCount: number
  breakdown: Array<{ category: string; count: number; share: number }>
  dataBasis: string
}

/**
 * Build cross-firm suggestions. Emits nothing when k floor not met per vendor.
 */
export function buildFirmCategorySuggestions(
  observations: FirmCategoryObservation[],
  floor: number = DEFAULT_COHORT_FLOOR,
): FirmCategorySuggestion[] {
  // Group by normalized vendor
  const byVendor = new Map<
    string,
    { categories: Map<string, number>; contributors: Set<string>; total: number }
  >()

  for (const o of observations) {
    const vendor = normalizeVendor(o.vendorPattern) || o.vendorPattern.toLowerCase().trim()
    if (!vendor || !o.category) continue
    let bucket = byVendor.get(vendor)
    if (!bucket) {
      bucket = { categories: new Map(), contributors: new Set(), total: 0 }
      byVendor.set(vendor, bucket)
    }
    bucket.contributors.add(o.contributorId)
    bucket.categories.set(o.category, (bucket.categories.get(o.category) ?? 0) + 1)
    bucket.total += 1
  }

  const out: FirmCategorySuggestion[] = []
  for (const [vendorPattern, bucket] of byVendor) {
    const contributorCount = bucket.contributors.size
    if (!meetsCohortFloor(contributorCount, floor)) continue

    const breakdown = [...bucket.categories.entries()]
      .map(([category, count]) => ({
        category,
        count,
        share: Math.round((count / bucket.total) * 100),
      }))
      .sort((a, b) => b.count - a.count)

    const top = breakdown[0]
    if (!top) continue

    out.push({
      vendorPattern,
      topCategory: top.category,
      topShare: top.share,
      contributorCount,
      observationCount: bucket.total,
      breakdown,
      dataBasis: `Based on ${contributorCount} firms and ${bucket.total} corrections (k≥${floor}). Observation only — not advice.`,
    })
  }

  return out.sort((a, b) => b.contributorCount - a.contributorCount)
}

export function firmAggregateEmptyCopy(currentFirms: number, floor = DEFAULT_COHORT_FLOOR): string {
  return cohortLockedCopy(currentFirms, floor)
}

/** Lookup suggestion for a vendor description; null if below floor or no data. */
export function suggestFirmCategory(
  observations: FirmCategoryObservation[],
  vendorDescription: string,
  floor: number = DEFAULT_COHORT_FLOOR,
): FirmCategorySuggestion | null {
  const q = normalizeVendor(vendorDescription)
  if (!q) return null
  const all = buildFirmCategorySuggestions(observations, floor)
  return (
    all.find(s => s.vendorPattern === q) ??
    all.find(s => q.includes(s.vendorPattern) || s.vendorPattern.includes(q)) ??
    null
  )
}
