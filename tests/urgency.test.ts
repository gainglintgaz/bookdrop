import { describe, it, expect } from 'vitest'
import { computeClientUrgency, sortClientsByUrgency } from '../src/lib/urgency'
import type { ClientWithStatus, DocumentUpload, RequirementWithUploads } from '../src/types'

function makeClient(overrides: Partial<ClientWithStatus> & { id: string; business_name: string }): ClientWithStatus {
  return {
    bookkeeper_id: 'bk-1',
    contact_name: 'Contact',
    contact_email: 'c@example.com',
    portal_token: 'tokentoken12',
    notes_private: null,
    notes_for_client: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    requirements: [],
    submissionStatus: 'not_started',
    lateRate: null,
    averageSubmissionDay: null,
    ...overrides,
  }
}

function makeReq(
  id: string,
  required: boolean,
  uploads: DocumentUpload[] = [],
): RequirementWithUploads {
  return {
    id,
    client_id: 'c',
    label: id,
    doc_type: 'bank',
    required,
    sort_order: 0,
    uploads,
  }
}

function makeUpload(id: string, uploadedAt: string): DocumentUpload {
  return {
    id,
    requirement_id: 'r1',
    client_id: 'c',
    bookkeeper_id: 'bk',
    period_year: 2026,
    period_month: 7,
    filename_original: `${id}.pdf`,
    storage_path: `p/${id}.pdf`,
    file_size_bytes: 100_000,
    uploaded_at: uploadedAt,
  }
}

const fixedNow = new Date('2026-07-12T12:00:00Z') // day 12 → follow-up pressure

describe('computeClientUrgency', () => {
  it('scores not_started higher than complete', () => {
    const missing = makeClient({
      id: 'c1',
      business_name: 'Missing Co',
      submissionStatus: 'not_started',
      requirements: [makeReq('r1', true), makeReq('r2', true)],
    })
    const done = makeClient({
      id: 'c2',
      business_name: 'Done Co',
      submissionStatus: 'complete',
      requirements: [
        makeReq('r1', true, [makeUpload('u1', '2026-07-02T10:00:00Z')]),
        makeReq('r2', true, [makeUpload('u2', '2026-07-02T11:00:00Z')]),
      ],
    })
    const uMissing = computeClientUrgency(missing, fixedNow)
    const uDone = computeClientUrgency(done, fixedNow)
    expect(uMissing.score).toBeGreaterThan(uDone.score)
    expect(uMissing.band).not.toBe('low')
  })

  it('boosts low historical on-time (lateRate as on-time fraction)', () => {
    const reliable = makeClient({
      id: 'c1',
      business_name: 'Reliable',
      submissionStatus: 'partial',
      lateRate: 0.92,
      requirements: [
        makeReq('r1', true, [makeUpload('u1', '2026-07-10T10:00:00Z')]),
        makeReq('r2', true),
      ],
    })
    const flaky = makeClient({
      id: 'c2',
      business_name: 'Flaky',
      submissionStatus: 'partial',
      lateRate: 0.33,
      requirements: [
        makeReq('r1', true, [makeUpload('u1', '2026-07-10T10:00:00Z')]),
        makeReq('r2', true),
      ],
    })
    expect(computeClientUrgency(flaky, fixedNow).score).toBeGreaterThan(
      computeClientUrgency(reliable, fixedNow).score,
    )
  })

  it('adds low-confidence review pressure on complete packages', () => {
    const base = makeClient({
      id: 'c1',
      business_name: 'Acme',
      submissionStatus: 'complete',
      requirements: [
        makeReq('r1', true, [
          {
            ...makeUpload('u1', '2026-07-02T10:00:00Z'),
            categorization_summary: {
              totalCategorized: 40,
              highConfidence: 30,
              mediumConfidence: 5,
              lowConfidence: 5,
              byCategory: {},
              flagsCount: 1,
            },
          },
        ]),
      ],
    })
    const plain = makeClient({
      id: 'c2',
      business_name: 'Plain',
      submissionStatus: 'complete',
      requirements: [makeReq('r1', true, [makeUpload('u2', '2026-07-02T10:00:00Z')])],
    })
    expect(computeClientUrgency(base, fixedNow).score).toBeGreaterThan(
      computeClientUrgency(plain, fixedNow).score,
    )
    expect(computeClientUrgency(base, fixedNow).reasons.some(r => /low-confidence/i.test(r))).toBe(true)
  })
})

describe('sortClientsByUrgency', () => {
  it('orders highest score first', () => {
    const clients = [
      makeClient({
        id: 'done',
        business_name: 'Zebra Complete',
        submissionStatus: 'complete',
        requirements: [makeReq('r1', true, [makeUpload('u1', '2026-07-01T00:00:00Z')])],
      }),
      makeClient({
        id: 'late',
        business_name: 'Alpha Missing',
        submissionStatus: 'not_started',
        lateRate: 0.2,
        requirements: [makeReq('r1', true), makeReq('r2', true)],
      }),
    ]
    const sorted = sortClientsByUrgency(clients, fixedNow)
    expect(sorted[0].id).toBe('late')
    expect(sorted[0].urgency.score).toBeGreaterThan(sorted[1].urgency.score)
  })
})
