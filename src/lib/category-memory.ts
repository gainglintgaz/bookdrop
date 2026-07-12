// category-memory.ts — Phase 5: per-client learned category map.
// Corrections scope to client_id so Client A's Starbucks → Meals never
// bleeds into Client B. Applied on next upload via auto-categorize-upload.
//
// Storage: localStorage (demo + browser learning). Cloud corrections also
// go to categorization_corrections table via separate helper.

const STORAGE_KEY = 'bookdrop_category_memory_v2'
const LEGACY_STORAGE_KEY = 'bookdrop_category_memory'
const MAX_CORRECTIONS_PER_CLIENT = 500
const CURRENT_VERSION = 2

const STRIP_PREFIXES = [
  'pos', 'ach', 'eft', 'dbt', 'pmt', 'chk', 'wire', 'debit', 'credit',
  'purchase', 'payment', 'withdrawal', 'deposit', 'transfer', 'recurring',
  'autopay', 'online', 'mobile', 'card', 'visa', 'mc', 'mastercard', 'amex',
  'check', 'sq', 'tst', 'pp', 'paypal',
]

export interface CategoryCorrection {
  vendorPattern: string
  originalCategory: string
  correctedCategory: string
  correctedSubcategory: string
  correctedAt: string
  confidence: number
  clientId: string
}

interface MemoryStore {
  version: number
  lastUpdated: string
  /** clientId → corrections for that client only */
  byClient: Record<string, CategoryCorrection[]>
}

// ─── Normalization ───────────────────────────────────────────────────────────

export function normalizeVendor(description: string): string {
  let normalized = description.toLowerCase()
  normalized = normalized.replace(/\d+/g, '')
  normalized = normalized.replace(/[*#@/\\.,;:(){}[\]"'`~!$%^&+=|<>?_-]/g, ' ')
  const words = normalized.split(/\s+/).filter(Boolean)
  while (words.length > 1 && STRIP_PREFIXES.includes(words[0])) {
    words.shift()
  }
  return words.join(' ').trim()
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function emptyStore(): MemoryStore {
  return { version: CURRENT_VERSION, lastUpdated: new Date().toISOString(), byClient: {} }
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
}

/** In-memory fallback for Vitest / SSR. */
let memoryStore: MemoryStore = emptyStore()

function loadStore(): MemoryStore {
  if (!hasLocalStorage()) return structuredCloneSafe(memoryStore)

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MemoryStore
      if (parsed?.byClient && typeof parsed.byClient === 'object') {
        return parsed
      }
    }
    // One-time migrate legacy global (no client scope) → discard into empty
    // rather than invent a fake client. Old data was not per-client honest.
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      console.info(
        '[category-memory] Legacy global memory ignored — Phase 5 is per-client only. Make new corrections to re-teach.',
      )
    }
  } catch (error) {
    console.warn('[category-memory] load failed:', error)
  }
  return emptyStore()
}

function structuredCloneSafe(store: MemoryStore): MemoryStore {
  return JSON.parse(JSON.stringify(store)) as MemoryStore
}

function saveStore(store: MemoryStore): void {
  store.lastUpdated = new Date().toISOString()
  store.version = CURRENT_VERSION
  memoryStore = structuredCloneSafe(store)
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* quota */
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Record a bookkeeper/client correction for THIS client only.
 */
export function recordCorrection(
  clientId: string,
  vendorDescription: string,
  originalCategory: string,
  newCategory: string,
  newSubcategory?: string,
): void {
  if (!clientId) return
  const store = loadStore()
  const pattern = normalizeVendor(vendorDescription)
  if (!pattern) return

  const list = store.byClient[clientId] ?? []
  const existingIndex = list.findIndex(c => c.vendorPattern === pattern)

  if (existingIndex >= 0) {
    const existing = list[existingIndex]
    if (
      existing.correctedCategory === newCategory &&
      existing.correctedSubcategory === (newSubcategory ?? '')
    ) {
      existing.confidence += 1
      existing.correctedAt = new Date().toISOString()
    } else {
      existing.correctedCategory = newCategory
      existing.correctedSubcategory = newSubcategory ?? ''
      existing.originalCategory = originalCategory
      existing.correctedAt = new Date().toISOString()
      existing.confidence = 1
    }
  } else {
    list.push({
      vendorPattern: pattern,
      originalCategory,
      correctedCategory: newCategory,
      correctedSubcategory: newSubcategory ?? '',
      correctedAt: new Date().toISOString(),
      confidence: 1,
      clientId,
    })
  }

  if (list.length > MAX_CORRECTIONS_PER_CLIENT) {
    list.sort((a, b) => new Date(a.correctedAt).getTime() - new Date(b.correctedAt).getTime())
    store.byClient[clientId] = list.slice(list.length - MAX_CORRECTIONS_PER_CLIENT)
  } else {
    store.byClient[clientId] = list
  }

  saveStore(store)
}

/**
 * Look up learned category for this client + vendor.
 * Never returns another client's mapping.
 */
export function getLearnedCategory(
  clientId: string,
  vendorDescription: string,
): { category: string; subcategory: string; confidence: number } | null {
  if (!clientId) return null
  const store = loadStore()
  const corrections = store.byClient[clientId] ?? []
  const query = normalizeVendor(vendorDescription)
  if (!query || corrections.length === 0) return null

  const exact = corrections.find(c => c.vendorPattern === query)
  if (exact) {
    return {
      category: exact.correctedCategory,
      subcategory: exact.correctedSubcategory,
      confidence: exact.confidence,
    }
  }

  let best: CategoryCorrection | null = null
  for (const correction of corrections) {
    const isSubstring =
      query.includes(correction.vendorPattern) ||
      correction.vendorPattern.includes(query)
    if (isSubstring && (!best || correction.confidence > best.confidence)) {
      best = correction
    }
  }

  if (!best) return null
  return {
    category: best.correctedCategory,
    subcategory: best.correctedSubcategory,
    confidence: best.confidence,
  }
}

export function getClientCorrections(clientId: string): CategoryCorrection[] {
  const store = loadStore()
  const list = store.byClient[clientId] ?? []
  return [...list].sort(
    (a, b) => new Date(b.correctedAt).getTime() - new Date(a.correctedAt).getTime(),
  )
}

export function getAllCorrections(clientId?: string): CategoryCorrection[] {
  if (clientId) return getClientCorrections(clientId)
  const store = loadStore()
  const all: CategoryCorrection[] = []
  for (const list of Object.values(store.byClient)) {
    all.push(...list)
  }
  return all.sort(
    (a, b) => new Date(b.correctedAt).getTime() - new Date(a.correctedAt).getTime(),
  )
}

export function deleteCorrection(clientId: string, vendorPattern: string): void {
  const store = loadStore()
  const list = store.byClient[clientId] ?? []
  store.byClient[clientId] = list.filter(c => c.vendorPattern !== vendorPattern)
  saveStore(store)
}

export function clearClientCorrections(clientId: string): void {
  const store = loadStore()
  delete store.byClient[clientId]
  saveStore(store)
}

export function clearAllCorrections(): void {
  saveStore(emptyStore())
}

export function getLearningStats(clientId?: string): {
  totalCorrections: number
  uniqueVendors: number
  mostCorrectedCategory: string | null
  accuracyImprovement: number
  clientCount: number
} {
  const corrections = clientId
    ? getClientCorrections(clientId)
    : getAllCorrections()
  const store = loadStore()
  const clientCount = Object.keys(store.byClient).filter(
    id => (store.byClient[id]?.length ?? 0) > 0,
  ).length

  if (corrections.length === 0) {
    return {
      totalCorrections: 0,
      uniqueVendors: 0,
      mostCorrectedCategory: null,
      accuracyImprovement: 0,
      clientCount,
    }
  }

  const uniqueVendors = new Set(corrections.map(c => c.vendorPattern)).size
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
  const learnedCount = corrections.filter(c => c.confidence > 1).length
  const accuracyImprovement =
    corrections.length > 0
      ? Math.round((learnedCount / corrections.length) * 100)
      : 0

  return {
    totalCorrections: corrections.length,
    uniqueVendors,
    mostCorrectedCategory,
    accuracyImprovement,
    clientCount,
  }
}

/** Test helper. */
export function __resetCategoryMemoryStore(): void {
  memoryStore = emptyStore()
  if (!hasLocalStorage()) return
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
