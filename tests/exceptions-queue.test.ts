import { describe, it, expect } from 'vitest'
import { buildExceptionItems, countOpenExceptions } from '../src/lib/exceptions-queue'
import type { RequirementWithUploads, DocumentUpload } from '../src/types'

function upload(partial: Partial<DocumentUpload> & Pick<DocumentUpload, 'id'>): DocumentUpload {
  return {
    requirement_id: 'r1',
    client_id: 'c1',
    bookkeeper_id: 'bk',
    period_year: 2026,
    period_month: 7,
    filename_original: 'chase.pdf',
    storage_path: 'p/chase.pdf',
    file_size_bytes: 100_000,
    uploaded_at: '2026-07-02T00:00:00Z',
    ...partial,
  }
}

describe('buildExceptionItems', () => {
  it('returns empty when no low confidence', () => {
    const reqs: RequirementWithUploads[] = [{
      id: 'r1', client_id: 'c1', label: 'Bank', doc_type: 'bank', required: true, sort_order: 0,
      uploads: [upload({
        id: 'u1',
        categorization_summary: {
          totalCategorized: 10,
          highConfidence: 10,
          mediumConfidence: 0,
          lowConfidence: 0,
          byCategory: {},
          flagsCount: 0,
        },
      })],
    }]
    expect(buildExceptionItems(reqs)).toEqual([])
    expect(countOpenExceptions(reqs)).toBe(0)
  })

  it('expands lowConfidence into one row each', () => {
    const reqs: RequirementWithUploads[] = [{
      id: 'r1', client_id: 'c1', label: 'Chase', doc_type: 'bank', required: true, sort_order: 0,
      uploads: [upload({
        id: 'u1',
        parsed_summary: {
          bankName: 'Chase', accountLast4: '1234', openingBalance: null, closingBalance: null,
          totalCredits: 0, totalDebits: 0, transactionCount: 40,
        },
        categorization_summary: {
          totalCategorized: 40,
          highConfidence: 30,
          mediumConfidence: 7,
          lowConfidence: 3,
          byCategory: { Uncategorized: 3, Meals: 5 },
          flagsCount: 1,
        },
      })],
    }]
    const items = buildExceptionItems(reqs)
    expect(items).toHaveLength(3)
    expect(items[0].uploadId).toBe('u1')
    expect(items[0].originalCategory).toBe('Uncategorized')
    expect(items[0].description).toMatch(/Chase/)
    expect(items[0].hasLineEvidence).toBe(false)
  })
})
