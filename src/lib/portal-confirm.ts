// portal-confirm.ts — Phase 2 magic-link line confirm (auditable).
// Demo: localStorage lines + events. Cloud: SECURITY DEFINER RPCs.

import { supabase } from './supabase'
import { isDemoMode } from './mode'
import { fingerprintPortalToken } from './document-lines'
import type { DocumentLineItem, PortalLineEvent } from '@/types'
import { correctionCategoryOptions } from './exceptions-queue'
import { recordCorrection as recordLocalMemory } from './category-memory'

const DEMO_EVENTS_KEY = 'bookdrop:demo:portal_line_events'
const DEMO_LINES_KEY = 'bookdrop:demo:document_line_items'
const RATE_KEY = 'bookdrop:demo:portal_confirm_rate'

export type ConfirmPolicy = 'off' | 'low_confidence' | 'all_lines'

export interface ConfirmResult {
  ok: boolean
  error?: string
  already?: boolean
  afterCategory?: string
  uploadFullyConfirmed?: boolean
  openRemaining?: number
  confirmedAt?: string
  tokenFingerprintPrefix?: string
}

function readDemoLines(): DocumentLineItem[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_LINES_KEY) ?? '[]') as DocumentLineItem[]
  } catch {
    return []
  }
}

function writeDemoLines(rows: DocumentLineItem[]): void {
  localStorage.setItem(DEMO_LINES_KEY, JSON.stringify(rows))
}

function appendDemoEvent(ev: PortalLineEvent): void {
  try {
    const existing = JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) ?? '[]') as PortalLineEvent[]
    existing.push(ev)
    localStorage.setItem(DEMO_EVENTS_KEY, JSON.stringify(existing))
  } catch {
    /* ignore */
  }
}

/** Simple client-side rate limit for demo (honest soft guard). */
function checkDemoRateLimit(tokenFp: string, maxPerHour = 120): boolean {
  try {
    const raw = localStorage.getItem(RATE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number[]>) : {}
    const now = Date.now()
    const windowMs = 60 * 60 * 1000
    const stamps = (map[tokenFp] ?? []).filter(t => now - t < windowMs)
    if (stamps.length >= maxPerHour) return false
    stamps.push(now)
    map[tokenFp] = stamps
    localStorage.setItem(RATE_KEY, JSON.stringify(map))
    return true
  } catch {
    return true
  }
}

function lineNeedsConfirm(line: DocumentLineItem, policy: ConfirmPolicy): boolean {
  if (policy === 'off') return false
  if (line.confirmed_at) return false
  if (policy === 'all_lines') return true
  return line.confidence === 'low'
}

/** Pure filter for tests + UI. */
export function filterLinesForConfirmPolicy(
  lines: DocumentLineItem[],
  policy: ConfirmPolicy,
): DocumentLineItem[] {
  if (policy === 'off') return []
  return lines
    .filter(l => lineNeedsConfirm(l, policy))
    .sort((a, b) => a.line_index - b.line_index)
}

export async function listPortalConfirmLines(params: {
  portalToken: string
  uploadId: string
  policy?: ConfirmPolicy
}): Promise<DocumentLineItem[]> {
  const policy = params.policy ?? 'low_confidence'

  if (isDemoMode || params.uploadId.startsWith('demo-upload-')) {
    const lines = readDemoLines().filter(l => l.upload_id === params.uploadId)
    return filterLinesForConfirmPolicy(lines, policy)
  }

  const { data, error } = await supabase.rpc('portal_list_confirm_lines', {
    p_token: params.portalToken,
    p_upload_id: params.uploadId,
  })

  if (error) {
    console.warn('[listPortalConfirmLines]', error.message)
    return []
  }
  return (data ?? []) as DocumentLineItem[]
}

export async function portalConfirmLine(params: {
  portalToken: string
  lineId: string
  action: 'accept' | 'change'
  category?: string
  policy?: ConfirmPolicy
}): Promise<ConfirmResult> {
  const { portalToken, lineId, action, category } = params

  if (action === 'change') {
    const cat = (category ?? '').trim()
    if (!cat) return { ok: false, error: 'Category required' }
    if (!correctionCategoryOptions().includes(cat) && cat !== 'Uncategorized') {
      // Allow any non-empty for firm flexibility, but prefer known list
    }
  }

  if (isDemoMode || lineId.includes(':')) {
    return demoConfirmLine(params)
  }

  // Prefer RPC for cloud UUID lines
  const { data, error } = await supabase.rpc('portal_confirm_line', {
    p_token: portalToken,
    p_line_id: lineId,
    p_action: action,
    p_category: action === 'change' ? category ?? null : null,
  })

  if (error) {
    console.warn('[portalConfirmLine]', error.message)
    // Fallback demo path if RPC fails on local-only ids
    if (lineId.length === 36) {
      return { ok: false, error: error.message }
    }
    return demoConfirmLine(params)
  }

  const row = data as Record<string, unknown>
  return {
    ok: Boolean(row.ok),
    already: Boolean(row.already),
    afterCategory: row.after_category as string | undefined,
    uploadFullyConfirmed: Boolean(row.upload_fully_confirmed),
    openRemaining: Number(row.open_remaining ?? 0),
    confirmedAt: row.confirmed_at as string | undefined,
    tokenFingerprintPrefix: row.token_fingerprint_prefix as string | undefined,
  }
}

async function demoConfirmLine(params: {
  portalToken: string
  lineId: string
  action: 'accept' | 'change'
  category?: string
  policy?: ConfirmPolicy
}): Promise<ConfirmResult> {
  const fp = await fingerprintPortalToken(params.portalToken)
  if (!checkDemoRateLimit(fp)) {
    return { ok: false, error: 'Rate limit — try again later' }
  }

  const lines = readDemoLines()
  const idx = lines.findIndex(l => l.id === params.lineId)
  if (idx < 0) return { ok: false, error: 'Line not found' }
  const line = lines[idx]
  if (line.confirmed_at) {
    return { ok: true, already: true, afterCategory: line.final_category ?? undefined }
  }

  const before = line.final_category ?? line.suggested_category
  const after =
    params.action === 'accept'
      ? (line.suggested_category ?? 'Uncategorized')
      : (params.category ?? '').trim()

  if (params.action === 'change' && !after) {
    return { ok: false, error: 'Category required' }
  }

  const now = new Date().toISOString()
  lines[idx] = {
    ...line,
    final_category: after,
    confirmed_by: 'client_portal',
    confirmed_at: now,
  }
  writeDemoLines(lines)

  appendDemoEvent({
    id: crypto.randomUUID(),
    line_id: line.id,
    upload_id: line.upload_id,
    client_id: line.client_id,
    bookkeeper_id: line.bookkeeper_id,
    event_type: params.action === 'accept' ? 'accept' : 'change',
    before_category: before,
    after_category: after,
    portal_token_fingerprint: fp,
    recorded_at: now,
    meta: { line_index: line.line_index, demo: true },
  })

  if (params.action === 'change' && before !== after) {
    try {
      recordLocalMemory(line.client_id, line.description_raw, before ?? 'Uncategorized', after)
    } catch {
      /* ignore */
    }
  }

  const policy = params.policy ?? 'low_confidence'
  const remaining = filterLinesForConfirmPolicy(
    lines.filter(l => l.upload_id === line.upload_id),
    policy,
  ).length

  return {
    ok: true,
    afterCategory: after,
    uploadFullyConfirmed: remaining === 0,
    openRemaining: remaining,
    confirmedAt: now,
    tokenFingerprintPrefix: fp.slice(0, 12),
  }
}

export function formatConfirmProof(result: ConfirmResult): string | null {
  if (!result.ok || !result.confirmedAt) return null
  const t = new Date(result.confirmedAt).toLocaleString()
  const fp = result.tokenFingerprintPrefix ? ` · link ${result.tokenFingerprintPrefix}…` : ''
  return `Recorded ${t}${fp}`
}
