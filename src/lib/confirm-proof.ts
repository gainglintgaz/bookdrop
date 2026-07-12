// confirm-proof.ts — Bookkeeper-facing audit summary of portal confirms.
// Pure helpers + fetch from portal_line_events (cloud) / demo events (demo).

import { supabase } from './supabase'
import { isDemoMode } from './mode'
import type { PortalLineEvent, DocumentUpload } from '@/types'

const DEMO_EVENTS_KEY = 'bookdrop:demo:portal_line_events'

export interface ConfirmProofSummary {
  /** Any client portal accept/change for this client (current period uploads). */
  hasClientActivity: boolean
  acceptCount: number
  changeCount: number
  lastEventAt: string | null
  /** First 12 chars of last event fingerprint for display (not full secret). */
  lastFingerprintPrefix: string | null
  /** Uploads with client_confirmed_at set. */
  uploadsFullyConfirmed: number
  uploadIdsFullyConfirmed: string[]
  /** Human one-liner for the strip. */
  headline: string
  detail: string
}

function readDemoEvents(): PortalLineEvent[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_EVENTS_KEY) ?? '[]') as PortalLineEvent[]
  } catch {
    return []
  }
}

/** Build summary from events + uploads (pure — testable). */
export function summarizeConfirmProof(
  events: PortalLineEvent[],
  uploads: DocumentUpload[],
): ConfirmProofSummary {
  const clientEvents = events.filter(
    e => e.event_type === 'accept' || e.event_type === 'change',
  )
  const acceptCount = clientEvents.filter(e => e.event_type === 'accept').length
  const changeCount = clientEvents.filter(e => e.event_type === 'change').length
  const sorted = [...clientEvents].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  )
  const last = sorted[0] ?? null
  const fully = uploads.filter(u => u.client_confirmed_at)
  const fullyIds = fully.map(u => u.id)

  const hasClientActivity = clientEvents.length > 0 || fully.length > 0

  let headline = 'No client portal confirms yet'
  let detail =
    'When the client accepts or changes categories on their magic link, audit events appear here with time and link fingerprint.'

  if (hasClientActivity) {
    const lastAt = last?.recorded_at
      ? new Date(last.recorded_at).toLocaleString()
      : fully[0]?.client_confirmed_at
        ? new Date(fully[0].client_confirmed_at!).toLocaleString()
        : null
    const fp = last?.portal_token_fingerprint
      ? last.portal_token_fingerprint.slice(0, 12)
      : null

    if (fully.length > 0) {
      headline = `Client finished confirm on ${fully.length} upload${fully.length === 1 ? '' : 's'}`
    } else {
      headline = `Client portal activity: ${acceptCount} accept · ${changeCount} change`
    }

    detail = [
      lastAt ? `Last action ${lastAt}` : null,
      fp ? `link proof ${fp}…` : null,
      `${acceptCount + changeCount} recorded event${acceptCount + changeCount === 1 ? '' : 's'}`,
      'Identity = magic-link holder (not a login).',
    ]
      .filter(Boolean)
      .join(' · ')
  }

  return {
    hasClientActivity,
    acceptCount,
    changeCount,
    lastEventAt: last?.recorded_at ?? fully[0]?.client_confirmed_at ?? null,
    lastFingerprintPrefix: last?.portal_token_fingerprint
      ? last.portal_token_fingerprint.slice(0, 12)
      : null,
    uploadsFullyConfirmed: fully.length,
    uploadIdsFullyConfirmed: fullyIds,
    headline,
    detail,
  }
}

export async function fetchPortalLineEventsForClient(params: {
  clientId: string
  bookkeeperId: string
  uploadIds?: string[]
}): Promise<PortalLineEvent[]> {
  if (isDemoMode) {
    return readDemoEvents().filter(
      e =>
        e.client_id === params.clientId &&
        (!params.uploadIds?.length || params.uploadIds.includes(e.upload_id)),
    )
  }

  let q = supabase
    .from('portal_line_events')
    .select('*')
    .eq('client_id', params.clientId)
    .eq('bookkeeper_id', params.bookkeeperId)
    .in('event_type', ['accept', 'change'])
    .order('recorded_at', { ascending: false })
    .limit(100)

  if (params.uploadIds && params.uploadIds.length > 0) {
    q = q.in('upload_id', params.uploadIds)
  }

  const { data, error } = await q
  if (error) {
    console.warn('[fetchPortalLineEventsForClient]', error.message)
    return []
  }
  return (data ?? []) as PortalLineEvent[]
}
