import { describe, it, expect } from 'vitest'
import { urgencyScore, sortByUrgency } from '../src/lib/urgency-score'
import type { ClientWithStatus, RequirementWithUploads, DocumentUpload } from '../src/types'

function upload(): DocumentUpload {
  return {
    id: 'u', requirement_id: 'r', client_id: 'c', bookkeeper_id: 'bk',
    period_year: 2026, period_month: 4, filename_original: 'f.pdf',
    storage_path: 'p', file_size_bytes: 1, uploaded_at: '2026-04-01T00:00:00Z',
  }
}

function req(uploaded: boolean, required = true): RequirementWithUploads {
  return {
    id: `r-${Math.random()}`, client_id: 'c', label: 'Doc', doc_type: 'bank',
    required, sort_order: 0, uploads: uploaded ? [upload()] : [],
  }
}

function client(over: Partial<ClientWithStatus> = {}): ClientWithStatus {
  return {
    id: 'c-1', bookkeeper_id: 'bk', business_name: 'Acme', contact_name: null,
    contact_email: 'a@b.com', portal_token: 't', notes_private: null,
    notes_for_client: null, is_active: true, created_at: '2026-01-01T00:00:00Z',
    requirements: [], submissionStatus: 'not_started',
    lateRate: null, averageSubmissionDay: null, ...over,
  }
}

describe('urgencyScore', () => {
  it('complete client scores 0 / none', () => {
    const u = urgencyScore(client({ requirements: [req(true), req(true)], submissionStatus: 'complete' }))
    expect(u.score).toBe(0)
    expect(u.level).toBe('none')
  })

  it('not-started client with all docs missing scores high', () => {
    const u = urgencyScore(client({ requirements: [req(false), req(false)], submissionStatus: 'not_started' }))
    // status 40 + incomplete 30 = 70
    expect(u.score).toBe(70)
    expect(u.level).toBe('high')
  })

  it('partial client scores medium', () => {
    const u = urgencyScore(client({ requirements: [req(true), req(false)], submissionStatus: 'partial' }))
    // status 15 + incomplete (1/2 * 30 = 15) = 30
    expect(u.score).toBe(30)
    expect(u.level).toBe('medium')
  })

  it('late history adds to score ONLY when lateRate is present', () => {
    const withHistory = urgencyScore(client({
      requirements: [req(false)], submissionStatus: 'not_started', lateRate: 1.0,
    }))
    const noHistory = urgencyScore(client({
      requirements: [req(false)], submissionStatus: 'not_started', lateRate: null,
    }))
    // withHistory: 40 + 30 + 30 = 100; noHistory: 40 + 30 + 0 = 70
    expect(withHistory.score).toBe(100)
    expect(noHistory.score).toBe(70)
    expect(noHistory.factors.lateHistory).toBe(0)  // never fabricated
  })

  it('never exceeds 100', () => {
    const u = urgencyScore(client({
      requirements: [req(false), req(false), req(false)], submissionStatus: 'not_started', lateRate: 1.0,
    }))
    expect(u.score).toBeLessThanOrEqual(100)
  })

  it('reason reflects the dominant factor', () => {
    const notStarted = urgencyScore(client({ requirements: [req(false)], submissionStatus: 'not_started' }))
    expect(notStarted.reason).toMatch(/no documents received/i)
  })

  it('recomputes status from requirements (ignores stale field)', () => {
    // Field says complete, but a required doc is missing → not complete.
    const u = urgencyScore(client({
      requirements: [req(true), req(false)], submissionStatus: 'complete',
    }))
    expect(u.score).toBeGreaterThan(0)
  })
})

describe('sortByUrgency', () => {
  it('orders most-urgent first, stable on ties', () => {
    const complete = client({ id: 'done', business_name: 'Zed', requirements: [req(true)], submissionStatus: 'complete' })
    const urgent = client({ id: 'urgent', business_name: 'Acme', requirements: [req(false)], submissionStatus: 'not_started' })
    const partial = client({ id: 'partial', business_name: 'Beta', requirements: [req(true), req(false)], submissionStatus: 'partial' })

    const sorted = sortByUrgency([complete, urgent, partial])
    expect(sorted.map(c => c.id)).toEqual(['urgent', 'partial', 'done'])
  })

  it('does not mutate the input array', () => {
    const arr = [client({ id: 'a' }), client({ id: 'b' })]
    const copy = [...arr]
    sortByUrgency(arr)
    expect(arr).toEqual(copy)
  })

  it('ties broken alphabetically by business name', () => {
    const a = client({ id: '1', business_name: 'Zebra', requirements: [req(false)], submissionStatus: 'not_started' })
    const b = client({ id: '2', business_name: 'Apple', requirements: [req(false)], submissionStatus: 'not_started' })
    const sorted = sortByUrgency([a, b])
    expect(sorted[0].business_name).toBe('Apple')
  })
})
