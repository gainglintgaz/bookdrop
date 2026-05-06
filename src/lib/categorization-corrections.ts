// src/lib/categorization-corrections.ts
// Phase A flywheel write path: every bookkeeper categorization correction lands
// here. This is the highest-density training signal in the entire product
// (per DATA_FLYWHEEL.md §C — corrections are Phase A for BookDrop, not Phase E).
//
// Two storage paths:
//   • Cloud (production): writes to Supabase `categorization_corrections` table
//   • Demo: writes to localStorage so the UX behaves identically and we can
//     test the full correction-capture flow without a database
//
// The function returns the ID of the new correction. Callers can use this to
// undo an accidental correction (sets status='undone').

import { supabase } from './supabase'
import { isDemoMode } from './mode'
import type { CategorizationCorrection } from '@/types'

const DEMO_STORAGE_KEY = 'bookdrop:demo:categorization_corrections'

export interface CorrectionInput {
  bookkeeperId: string
  clientId: string
  uploadId?: string | null
  transactionDate?: string | null
  transactionAmountCents?: number | null
  vendorNormalized?: string | null
  descriptionRaw?: string | null
  originalCategory?: string | null
  correctedCategory: string
  originalSubcategory?: string | null
  correctedSubcategory?: string | null
  originalConfidence?: 'high' | 'medium' | 'low' | null
  reason?: string | null
}

/**
 * Record a single categorization correction. Never throws — failures are logged
 * with full context and the function returns null. Correction-capture must
 * never block the bookkeeper's UI flow.
 *
 * Per ai-first-principles.md §5 anti-fabrication rule 6: silent failure surfaces
 * a real placeholder result (null) rather than fabricating success.
 */
export async function recordCorrection(input: CorrectionInput): Promise<string | null> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const correction: CategorizationCorrection = {
    id,
    bookkeeper_id: input.bookkeeperId,
    client_id: input.clientId,
    upload_id: input.uploadId ?? null,
    transaction_date: input.transactionDate ?? null,
    transaction_amount_cents: input.transactionAmountCents ?? null,
    vendor_normalized: input.vendorNormalized ?? null,
    description_raw: input.descriptionRaw ?? null,
    original_category: input.originalCategory ?? null,
    corrected_category: input.correctedCategory,
    original_subcategory: input.originalSubcategory ?? null,
    corrected_subcategory: input.correctedSubcategory ?? null,
    reason: input.reason ?? null,
    status: 'applied',
    applied_at: now,
    original_confidence: input.originalConfidence ?? null,
  }

  if (isDemoMode) {
    try {
      const existing = readDemoCorrections()
      existing.push(correction)
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(existing))
      return id
    } catch (err) {
      console.warn('[recordCorrection] demo storage failed:', err)
      return null
    }
  }

  try {
    const { error } = await supabase
      .from('categorization_corrections')
      .insert(correction)
    if (error) {
      console.warn('[recordCorrection] supabase insert failed:', error.message)
      return null
    }
    return id
  } catch (err) {
    console.warn('[recordCorrection] threw:', err)
    return null
  }
}

/**
 * Mark a previously-applied correction as undone. The row stays in the table
 * (never delete — corrections are part of the audit trail) but loses its weight
 * in the learning corpus.
 */
export async function undoCorrection(correctionId: string): Promise<boolean> {
  if (isDemoMode) {
    try {
      const existing = readDemoCorrections()
      const idx = existing.findIndex(c => c.id === correctionId)
      if (idx === -1) return false
      existing[idx] = { ...existing[idx], status: 'undone' }
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(existing))
      return true
    } catch {
      return false
    }
  }

  try {
    const { error } = await supabase
      .from('categorization_corrections')
      .update({ status: 'undone' })
      .eq('id', correctionId)
    return !error
  } catch {
    return false
  }
}

/**
 * Read all corrections this bookkeeper has applied. In demo mode, scoped to the
 * single localStorage bucket. In cloud mode, RLS automatically scopes to the
 * authenticated bookkeeper.
 */
export async function getCorrectionsForBookkeeper(
  bookkeeperId: string,
): Promise<CategorizationCorrection[]> {
  if (isDemoMode) {
    return readDemoCorrections().filter(c => c.bookkeeper_id === bookkeeperId)
  }

  try {
    const { data, error } = await supabase
      .from('categorization_corrections')
      .select('*')
      .eq('bookkeeper_id', bookkeeperId)
      .order('applied_at', { ascending: false })
    if (error) {
      console.warn('[getCorrectionsForBookkeeper] failed:', error.message)
      return []
    }
    return (data ?? []) as CategorizationCorrection[]
  } catch (err) {
    console.warn('[getCorrectionsForBookkeeper] threw:', err)
    return []
  }
}

/**
 * Count of corrections per (vendor → corrected_category) for a given bookkeeper.
 * Powers the source-provenance citation "you've corrected this vendor N times to X".
 *
 * In cloud mode this would be a SQL query against the materialized view
 * `vendor_correction_stats`; in demo mode we compute it on the fly from
 * localStorage.
 */
export async function getVendorCorrectionStats(
  bookkeeperId: string,
  vendorNormalized: string,
): Promise<Array<{ category: string; count: number; lastAt: string }>> {
  const all = await getCorrectionsForBookkeeper(bookkeeperId)
  const buckets = new Map<string, { count: number; lastAt: string }>()
  for (const c of all) {
    if (c.status !== 'applied') continue
    if (c.vendor_normalized !== vendorNormalized) continue
    const cur = buckets.get(c.corrected_category)
    if (!cur) {
      buckets.set(c.corrected_category, { count: 1, lastAt: c.applied_at })
    } else {
      cur.count += 1
      if (c.applied_at > cur.lastAt) cur.lastAt = c.applied_at
    }
  }
  return Array.from(buckets.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count)
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo-mode helpers
// ─────────────────────────────────────────────────────────────────────────────

function readDemoCorrections(): CategorizationCorrection[] {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Test/dev helper. Not exposed to UI. */
export function _clearDemoCorrections(): void {
  if (isDemoMode) {
    window.localStorage.removeItem(DEMO_STORAGE_KEY)
  }
}
