import { describe, it, expect } from 'vitest'
import { summarizeConfirmProof } from '../src/lib/confirm-proof'
import type { DocumentUpload, PortalLineEvent } from '../src/types'

function upload(partial: Partial<DocumentUpload> & Pick<DocumentUpload, 'id'>): DocumentUpload {
  return {
    requirement_id: 'r1',
    client_id: 'c1',
    bookkeeper_id: 'bk',
    period_year: 2026,
    period_month: 7,
    filename_original: 'a.pdf',
    storage_path: 'p/a.pdf',
    file_size_bytes: 1000,
    uploaded_at: '2026-07-01T00:00:00Z',
    ...partial,
  }
}

function event(partial: Partial<PortalLineEvent> & Pick<PortalLineEvent, 'id' | 'event_type'>): PortalLineEvent {
  return {
    line_id: 'l1',
    upload_id: 'u1',
    client_id: 'c1',
    bookkeeper_id: 'bk',
    before_category: 'A',
    after_category: 'B',
    portal_token_fingerprint: 'abcdef1234567890',
    recorded_at: '2026-07-11T12:00:00.000Z',
    meta: {},
    ...partial,
  }
}

describe('summarizeConfirmProof', () => {
  it('quiet when no activity', () => {
    const s = summarizeConfirmProof([], [upload({ id: 'u1' })])
    expect(s.hasClientActivity).toBe(false)
    expect(s.headline).toMatch(/No client portal confirms/)
  })

  it('counts accept/change and fingerprint prefix', () => {
    const s = summarizeConfirmProof(
      [
        event({ id: 'e1', event_type: 'accept', recorded_at: '2026-07-11T10:00:00Z' }),
        event({ id: 'e2', event_type: 'change', recorded_at: '2026-07-11T11:00:00Z' }),
      ],
      [upload({ id: 'u1' })],
    )
    expect(s.hasClientActivity).toBe(true)
    expect(s.acceptCount).toBe(1)
    expect(s.changeCount).toBe(1)
    expect(s.lastFingerprintPrefix).toBe('abcdef123456')
    expect(s.detail).toMatch(/link proof/)
  })

  it('prefers fully confirmed uploads in headline', () => {
    const s = summarizeConfirmProof(
      [event({ id: 'e1', event_type: 'accept' })],
      [upload({ id: 'u1', client_confirmed_at: '2026-07-11T12:00:00Z' })],
    )
    expect(s.uploadsFullyConfirmed).toBe(1)
    expect(s.headline).toMatch(/finished confirm/)
  })
})
