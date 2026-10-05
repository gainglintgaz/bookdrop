// document-lines.ts — Phase 1 line persistence + demo store.
// Cloud: document_line_items table. Demo: localStorage (honest demo, not cloud).

import { supabase } from './supabase'
import { isDemoMode } from './mode'
import type { DocumentLineItem } from '@/types'
import type { AutoCategorizedLineDraft } from './auto-categorize-upload'

const DEMO_LINES_KEY = 'bookdrop:demo:document_line_items'

export async function fingerprintPortalToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function readDemoLines(): DocumentLineItem[] {
  try {
    const raw = localStorage.getItem(DEMO_LINES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as DocumentLineItem[]
  } catch {
    return []
  }
}

function writeDemoLines(rows: DocumentLineItem[]): void {
  localStorage.setItem(DEMO_LINES_KEY, JSON.stringify(rows))
}

/**
 * Insert line drafts for an upload. Replaces any existing lines for that upload
 * in demo; cloud uses delete+insert for same upload_id (re-parse safety).
 */
export async function insertDocumentLineItems(params: {
  uploadId: string
  clientId: string
  bookkeeperId: string
  lines: AutoCategorizedLineDraft[]
}): Promise<DocumentLineItem[]> {
  const { uploadId, clientId, bookkeeperId, lines } = params
  if (lines.length === 0) return []

  const now = new Date().toISOString()
  const rows: DocumentLineItem[] = lines.map(l => ({
    id: crypto.randomUUID(),
    upload_id: uploadId,
    client_id: clientId,
    bookkeeper_id: bookkeeperId,
    line_index: l.line_index,
    txn_date: l.txn_date,
    description_raw: l.description_raw,
    description_display: l.description_display,
    amount_cents: l.amount_cents,
    amount_sign: l.amount_sign,
    suggested_category: l.suggested_category,
    suggested_subcategory: l.suggested_subcategory,
    confidence: l.confidence,
    matched_vendor: l.matched_vendor,
    final_category: null,
    final_subcategory: null,
    confirmed_by: null,
    confirmed_at: null,
    source_kind: l.source_kind,
    source_rule: l.source_rule,
    content_hash: null,
    engine_version: l.engine_version,
    created_at: now,
  }))

  if (isDemoMode || uploadId.startsWith('demo-upload-')) {
    const existing = readDemoLines().filter(r => r.upload_id !== uploadId)
    writeDemoLines([...existing, ...rows])
    return rows
  }

  // Clear prior lines for re-categorize paths
  await supabase.from('document_line_items').delete().eq('upload_id', uploadId)

  const insertPayload = rows.map(r => ({
    id: r.id,
    upload_id: r.upload_id,
    client_id: r.client_id,
    bookkeeper_id: r.bookkeeper_id,
    line_index: r.line_index,
    txn_date: r.txn_date,
    description_raw: r.description_raw,
    description_display: r.description_display,
    amount_cents: r.amount_cents,
    amount_sign: r.amount_sign,
    suggested_category: r.suggested_category,
    suggested_subcategory: r.suggested_subcategory,
    confidence: r.confidence,
    matched_vendor: r.matched_vendor,
    source_kind: r.source_kind,
    source_rule: r.source_rule,
    engine_version: r.engine_version,
  }))

  const { data, error } = await supabase
    .from('document_line_items')
    .insert(insertPayload)
    .select()

  if (error) throw new Error(`Line insert failed: ${error.message}`)
  return (data ?? rows) as DocumentLineItem[]
}

/** Open low-confidence or unconfirmed lines for a client (bookkeeper view). */
export async function fetchOpenExceptionLines(params: {
  clientId: string
  bookkeeperId: string
}): Promise<DocumentLineItem[]> {
  if (isDemoMode) {
    return readDemoLines().filter(
      r =>
        r.client_id === params.clientId &&
        r.confirmed_at == null &&
        (r.confidence === 'low' || r.final_category == null),
    )
  }

  const { data, error } = await supabase
    .from('document_line_items')
    .select('*')
    .eq('client_id', params.clientId)
    .eq('bookkeeper_id', params.bookkeeperId)
    .is('confirmed_at', null)
    .order('line_index', { ascending: true })

  if (error) {
    console.warn('[fetchOpenExceptionLines]', error.message)
    return []
  }
  return (data ?? []) as DocumentLineItem[]
}

export async function fetchLinesForUpload(uploadId: string): Promise<DocumentLineItem[]> {
  if (isDemoMode || uploadId.startsWith('demo-upload-')) {
    return readDemoLines()
      .filter(r => r.upload_id === uploadId)
      .sort((a, b) => a.line_index - b.line_index)
  }
  const { data, error } = await supabase
    .from('document_line_items')
    .select('*')
    .eq('upload_id', uploadId)
    .order('line_index', { ascending: true })
  if (error) {
    console.warn('[fetchLinesForUpload]', error.message)
    return []
  }
  return (data ?? []) as DocumentLineItem[]
}
