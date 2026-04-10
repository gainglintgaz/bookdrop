// src/lib/category-memory.ts
// Category learning/memory system that remembers user corrections to auto-categorization.
// When a user re-categorizes a transaction, the system learns that vendor → category
// mapping for next time. Runs entirely in the browser via localStorage.
//
// Integrates with categorization-engine.ts — after auto-categorization runs,
// call getLearnedCategory() to override any auto-categorized results with
// user-corrected mappings.

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'bookdrop_category_memory'
const MAX_CORRECTIONS = 500
const CURRENT_VERSION = 1

// Common prefixes on bank statement descriptions that should be stripped
// during normalization so "POS STARBUCKS" and "STARBUCKS" match the same vendor.
const STRIP_PREFIXES = [
  'pos',
  'ach',
  'eft',
  'dbt',
  'pmt',
  'chk',
  'wire',
  'debit',
  'credit',
  'purchase',
  'payment',
  'withdrawal',
  'deposit',
  'transfer',
  'recurring',
  'autopay',
  'online',
  'mobile',
  'card',
  'visa',
  'mc',
  'mastercard',
  'amex',
  'check',
  'sq',       // Square POS
  'tst',      // Toast POS
  'pp',       // PayPal prefix
  'paypal',
]

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface CategoryCorrection {
  vendorPattern: string       // normalized vendor name
  originalCategory: string
  correctedCategory: string
  correctedSubcategory: string
  correctedAt: string         // ISO date
  confidence: number          // increases each time same correction is made, starts at 1
}

export interface CategoryMemory {
  corrections: CategoryCorrection[]
  version: number
  lastUpdated: string
}

// ─── NORMALIZATION ───────────────────────────────────────────────────────────

/**
 * Normalize a vendor description for consistent matching.
 * - lowercases everything
 * - strips digits (card numbers, transaction IDs, dates, amounts)
 * - strips common POS/ACH/etc. prefixes
 * - collapses whitespace and trims
 */
function normalizeVendor(description: string): string {
  let normalized = description.toLowerCase()

  // Strip digits (card numbers, transaction codes, dates, amounts)
  normalized = normalized.replace(/\d+/g, '')

  // Strip common punctuation that varies between banks
  normalized = normalized.replace(/[*#@/\\.,;:(){}[\]"'`~!$%^&+=|<>?_-]/g, ' ')

  // Split into words so we can remove prefix tokens
  const words = normalized.split(/\s+/).filter(Boolean)

  // Remove leading words that match known noise prefixes
  while (words.length > 1 && STRIP_PREFIXES.includes(words[0])) {
    words.shift()
  }

  return words.join(' ').trim()
}

// ─── STORAGE HELPERS ─────────────────────────────────────────────────────────

function loadMemory(): CategoryMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { corrections: [], version: CURRENT_VERSION, lastUpdated: new Date().toISOString() }
    }
    const parsed: CategoryMemory = JSON.parse(raw)
    // Future-proof: handle version migrations here if version changes
    if (!parsed.corrections || !Array.isArray(parsed.corrections)) {
      return { corrections: [], version: CURRENT_VERSION, lastUpdated: new Date().toISOString() }
    }
    return parsed
  } catch (error) {
    console.warn('[category-memory] Failed to load category memory from localStorage — returning empty memory.', error)
    return { corrections: [], version: CURRENT_VERSION, lastUpdated: new Date().toISOString() }
  }
}

function saveMemory(memory: CategoryMemory): void {
  memory.lastUpdated = new Date().toISOString()
  memory.version = CURRENT_VERSION
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memory))
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Save a correction — the user recategorized a transaction.
 *
 * If the same normalized vendor already has a correction:
 *   - Same category+subcategory → bump confidence
 *   - Different category → replace with the new one (latest wins), reset confidence to 1
 *
 * Evicts the oldest corrections when the list exceeds MAX_CORRECTIONS.
 */
export function recordCorrection(
  vendorDescription: string,
  originalCategory: string,
  newCategory: string,
  newSubcategory?: string,
): void {
  const memory = loadMemory()
  const pattern = normalizeVendor(vendorDescription)

  if (!pattern) return // nothing useful to learn from empty descriptions

  const existingIndex = memory.corrections.findIndex(
    (c) => c.vendorPattern === pattern,
  )

  if (existingIndex >= 0) {
    const existing = memory.corrections[existingIndex]
    if (
      existing.correctedCategory === newCategory &&
      existing.correctedSubcategory === (newSubcategory ?? '')
    ) {
      // Same correction again — increase confidence
      existing.confidence += 1
      existing.correctedAt = new Date().toISOString()
    } else {
      // Different correction — latest wins, reset confidence
      existing.correctedCategory = newCategory
      existing.correctedSubcategory = newSubcategory ?? ''
      existing.originalCategory = originalCategory
      existing.correctedAt = new Date().toISOString()
      existing.confidence = 1
    }
  } else {
    memory.corrections.push({
      vendorPattern: pattern,
      originalCategory,
      correctedCategory: newCategory,
      correctedSubcategory: newSubcategory ?? '',
      correctedAt: new Date().toISOString(),
      confidence: 1,
    })
  }

  // Evict oldest corrections if over the limit
  if (memory.corrections.length > MAX_CORRECTIONS) {
    // Sort by correctedAt ascending so oldest are first, then slice off the excess
    memory.corrections.sort(
      (a, b) => new Date(a.correctedAt).getTime() - new Date(b.correctedAt).getTime(),
    )
    memory.corrections = memory.corrections.slice(memory.corrections.length - MAX_CORRECTIONS)
  }

  saveMemory(memory)
}

/**
 * Look up whether we have a learned category for the given vendor description.
 * Uses the same normalization and does substring matching — if the normalized
 * query is a substring of a stored pattern or vice versa, it counts as a match.
 * Prefers exact matches over substring matches; among substring matches, prefers
 * the one with highest confidence.
 */
export function getLearnedCategory(vendorDescription: string): {
  category: string
  subcategory: string
  confidence: number
} | null {
  const memory = loadMemory()
  const query = normalizeVendor(vendorDescription)

  if (!query || memory.corrections.length === 0) return null

  // Try exact match first
  const exact = memory.corrections.find((c) => c.vendorPattern === query)
  if (exact) {
    return {
      category: exact.correctedCategory,
      subcategory: exact.correctedSubcategory,
      confidence: exact.confidence,
    }
  }

  // Substring matching: query contains pattern or pattern contains query
  let bestMatch: CategoryCorrection | null = null

  for (const correction of memory.corrections) {
    const isSubstring =
      query.includes(correction.vendorPattern) ||
      correction.vendorPattern.includes(query)

    if (isSubstring) {
      if (!bestMatch || correction.confidence > bestMatch.confidence) {
        bestMatch = correction
      }
    }
  }

  if (bestMatch) {
    return {
      category: bestMatch.correctedCategory,
      subcategory: bestMatch.correctedSubcategory,
      confidence: bestMatch.confidence,
    }
  }

  return null
}

/**
 * Get all corrections, sorted by most recent first.
 */
export function getAllCorrections(): CategoryCorrection[] {
  const memory = loadMemory()
  return [...memory.corrections].sort(
    (a, b) => new Date(b.correctedAt).getTime() - new Date(a.correctedAt).getTime(),
  )
}

/**
 * Delete a specific correction by its normalized vendor pattern.
 */
export function deleteCorrection(vendorPattern: string): void {
  const memory = loadMemory()
  memory.corrections = memory.corrections.filter(
    (c) => c.vendorPattern !== vendorPattern,
  )
  saveMemory(memory)
}

/**
 * Clear all learned categories.
 */
export function clearAllCorrections(): void {
  saveMemory({ corrections: [], version: CURRENT_VERSION, lastUpdated: new Date().toISOString() })
}

/**
 * Export corrections as a JSON string for backup or transfer between devices.
 */
export function exportCorrections(): string {
  const memory = loadMemory()
  return JSON.stringify(memory, null, 2)
}

/**
 * Import corrections from a JSON string. Merges with existing corrections —
 * if the same vendor pattern exists, keeps the one with higher confidence.
 * Returns the number of corrections imported (new or updated).
 */
export function importCorrections(json: string): number {
  let imported: CategoryMemory
  try {
    imported = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: could not parse category corrections file')
  }

  if (!imported.corrections || !Array.isArray(imported.corrections)) {
    throw new Error('Invalid format: expected a CategoryMemory object with a corrections array')
  }

  const memory = loadMemory()
  let count = 0

  for (const incoming of imported.corrections) {
    // Validate required fields
    if (!incoming.vendorPattern || !incoming.correctedCategory) continue

    const existingIndex = memory.corrections.findIndex(
      (c) => c.vendorPattern === incoming.vendorPattern,
    )

    if (existingIndex >= 0) {
      // Keep whichever has higher confidence
      if (incoming.confidence > memory.corrections[existingIndex].confidence) {
        memory.corrections[existingIndex] = {
          vendorPattern: incoming.vendorPattern,
          originalCategory: incoming.originalCategory ?? '',
          correctedCategory: incoming.correctedCategory,
          correctedSubcategory: incoming.correctedSubcategory ?? '',
          correctedAt: incoming.correctedAt ?? new Date().toISOString(),
          confidence: incoming.confidence ?? 1,
        }
        count++
      }
    } else {
      memory.corrections.push({
        vendorPattern: incoming.vendorPattern,
        originalCategory: incoming.originalCategory ?? '',
        correctedCategory: incoming.correctedCategory,
        correctedSubcategory: incoming.correctedSubcategory ?? '',
        correctedAt: incoming.correctedAt ?? new Date().toISOString(),
        confidence: incoming.confidence ?? 1,
      })
      count++
    }
  }

  // Enforce max corrections after import
  if (memory.corrections.length > MAX_CORRECTIONS) {
    memory.corrections.sort(
      (a, b) => new Date(a.correctedAt).getTime() - new Date(b.correctedAt).getTime(),
    )
    memory.corrections = memory.corrections.slice(memory.corrections.length - MAX_CORRECTIONS)
  }

  saveMemory(memory)
  return count
}

/**
 * Get stats about the learning system.
 */
export function getLearningStats(): {
  totalCorrections: number
  uniqueVendors: number
  mostCorrectedCategory: string | null
  accuracyImprovement: number
} {
  const memory = loadMemory()
  const corrections = memory.corrections

  if (corrections.length === 0) {
    return {
      totalCorrections: 0,
      uniqueVendors: 0,
      mostCorrectedCategory: null,
      accuracyImprovement: 0,
    }
  }

  // Unique vendors = unique patterns (already deduplicated in storage, so just count)
  const uniqueVendors = new Set(corrections.map((c) => c.vendorPattern)).size

  // Most corrected-to category (which category do users correct TO the most)
  const categoryCounts = new Map<string, number>()
  for (const c of corrections) {
    categoryCounts.set(
      c.correctedCategory,
      (categoryCounts.get(c.correctedCategory) ?? 0) + 1,
    )
  }
  let mostCorrectedCategory: string | null = null
  let maxCount = 0
  categoryCounts.forEach((count, cat) => {
    if (count > maxCount) {
      maxCount = count
      mostCorrectedCategory = cat
    }
  })

  // Accuracy improvement estimate:
  // corrections with confidence > 1 means the system has learned and would
  // now auto-apply the correct category. Ratio of those to total corrections.
  const learnedCount = corrections.filter((c) => c.confidence > 1).length
  const accuracyImprovement =
    corrections.length > 0
      ? Math.round((learnedCount / corrections.length) * 100)
      : 0

  return {
    totalCorrections: corrections.length,
    uniqueVendors,
    mostCorrectedCategory,
    accuracyImprovement,
  }
}
