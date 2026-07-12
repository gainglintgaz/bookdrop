import { describe, it, expect } from 'vitest'
import {
  filterClientsByWorkQueue,
  countByFilter,
  docsTabHasWork,
  type DashboardFilterId,
} from '../src/lib/work-queue'
import type { ClientWithStatus, RequirementWithUploads } from '../src/types'

function client(
  id: string,
  status: ClientWithStatus['submissionStatus'],
  extras?: Partial<ClientWithStatus>,
): ClientWithStatus {
  const reqs: RequirementWithUploads[] = [
    {
      id: `r-${id}`,
      client_id: id,
      label: 'Bank',
      doc_type: 'bank',
      required: true,
      sort_order: 0,
      uploads:
        status === 'not_started' || status === 'missing'
          ? []
          : [
              {
                id: `u-${id}`,
                requirement_id: `r-${id}`,
                client_id: id,
                bookkeeper_id: 'bk',
                period_year: 2026,
                period_month: 7,
                filename_original: 'b.pdf',
                storage_path: 'p/b.pdf',
                file_size_bytes: 100_000,
                uploaded_at: '2026-07-02T00:00:00Z',
                categorization_summary:
                  status === 'complete'
                    ? {
                        totalCategorized: 10,
                        highConfidence: 10,
                        mediumConfidence: 0,
                        lowConfidence: 0,
                        byCategory: {},
                        flagsCount: 0,
                      }
                    : {
                        totalCategorized: 10,
                        highConfidence: 5,
                        mediumConfidence: 2,
                        lowConfidence: 3,
                        byCategory: {},
                        flagsCount: 1,
                      },
                client_confirmed_at: id === 'confirmed' ? '2026-07-03T00:00:00Z' : null,
              },
            ],
    },
  ]
  if (status === 'partial') {
    reqs.push({
      id: `r2-${id}`,
      client_id: id,
      label: 'CC',
      doc_type: 'credit_card',
      required: true,
      sort_order: 1,
      uploads: [],
    })
  }
  return {
    id,
    bookkeeper_id: 'bk',
    business_name: id,
    contact_name: null,
    contact_email: `${id}@ex.com`,
    portal_token: 'tokentoken12',
    notes_private: null,
    notes_for_client: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    requirements: reqs,
    submissionStatus: status,
    lateRate: null,
    averageSubmissionDay: null,
    ...extras,
  }
}

describe('filterClientsByWorkQueue', () => {
  const period = { year: 2026, month: 7 }
  const list = [
    client('missing', 'not_started'),
    client('partial', 'partial'),
    client('complete', 'complete'),
    client('confirmed', 'complete'),
  ]

  it('filters needs_docs', () => {
    expect(filterClientsByWorkQueue(list, 'needs_docs', period).map(c => c.id)).toEqual(['missing'])
  })

  it('filters partial', () => {
    expect(filterClientsByWorkQueue(list, 'partial', period).map(c => c.id)).toEqual(['partial'])
  })

  it('filters has_low_conf', () => {
    const ids = filterClientsByWorkQueue(list, 'has_low_conf', period).map(c => c.id)
    expect(ids).toContain('partial')
    expect(ids).not.toContain('complete')
  })

  it('filters client_confirmed', () => {
    expect(filterClientsByWorkQueue(list, 'client_confirmed', period).map(c => c.id)).toEqual([
      'confirmed',
    ])
  })

  it('countByFilter all equals list length', () => {
    const c = countByFilter(list, period)
    expect(c.all).toBe(4)
  })
})

describe('docsTabHasWork', () => {
  const period = { year: 2026, month: 7 }
  const reqs = client('partial', 'partial').requirements

  it('docs always true', () => {
    expect(docsTabHasWork('docs', reqs, period)).toBe(true)
  })

  it('exceptions when low conf', () => {
    expect(docsTabHasWork('exceptions', reqs, period)).toBe(true)
  })
})
