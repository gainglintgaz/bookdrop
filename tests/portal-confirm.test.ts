import { describe, it, expect } from 'vitest'
import { filterLinesForConfirmPolicy, formatConfirmProof } from '../src/lib/portal-confirm'
import type { DocumentLineItem } from '../src/types'

function line(partial: Partial<DocumentLineItem> & Pick<DocumentLineItem, 'id' | 'confidence'>): DocumentLineItem {
  return {
    upload_id: 'u1',
    client_id: 'c1',
    bookkeeper_id: 'bk',
    line_index: 0,
    txn_date: '2026-07-01',
    description_raw: 'AWS',
    description_display: 'AWS',
    amount_cents: 5000,
    amount_sign: 'debit',
    suggested_category: 'Software & Subscriptions',
    suggested_subcategory: null,
    matched_vendor: 'AWS',
    final_category: null,
    final_subcategory: null,
    confirmed_by: null,
    confirmed_at: null,
    source_kind: 'pdf_parse',
    source_rule: 'vendor:AWS',
    content_hash: null,
    engine_version: 'categorize-v1',
    created_at: '2026-07-01T00:00:00Z',
    ...partial,
  }
}

describe('filterLinesForConfirmPolicy', () => {
  const lines = [
    line({ id: '1', confidence: 'high', line_index: 0 }),
    line({ id: '2', confidence: 'low', line_index: 1 }),
    line({ id: '3', confidence: 'low', line_index: 2, confirmed_at: '2026-07-02T00:00:00Z' }),
  ]

  it('off returns empty', () => {
    expect(filterLinesForConfirmPolicy(lines, 'off')).toEqual([])
  })

  it('low_confidence only unconfirmed low', () => {
    const out = filterLinesForConfirmPolicy(lines, 'low_confidence')
    expect(out.map(l => l.id)).toEqual(['2'])
  })

  it('all_lines skips already confirmed', () => {
    const out = filterLinesForConfirmPolicy(lines, 'all_lines')
    expect(out.map(l => l.id)).toEqual(['1', '2'])
  })
})

describe('formatConfirmProof', () => {
  it('returns null when incomplete', () => {
    expect(formatConfirmProof({ ok: true })).toBeNull()
  })

  it('includes time and fingerprint prefix', () => {
    const s = formatConfirmProof({
      ok: true,
      confirmedAt: '2026-07-11T15:00:00.000Z',
      tokenFingerprintPrefix: 'abcdef123456',
    })
    expect(s).toMatch(/Recorded/)
    expect(s).toMatch(/abcdef123456/)
  })
})
