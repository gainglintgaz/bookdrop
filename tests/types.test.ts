import { describe, it, expect } from 'vitest'
import { computeSubmissionStatus, getMissingDocuments } from '../src/types'
import type { RequirementWithUploads, DocumentUpload } from '../src/types'

function makeReq(overrides: Partial<RequirementWithUploads> = {}): RequirementWithUploads {
  return {
    id: 'req-1',
    client_id: 'client-1',
    label: 'Bank Statement',
    doc_type: 'bank',
    required: true,
    sort_order: 0,
    uploads: [],
    ...overrides,
  }
}

function makeUpload(overrides: Partial<DocumentUpload> = {}): DocumentUpload {
  return {
    id: 'up-1',
    requirement_id: 'req-1',
    client_id: 'client-1',
    bookkeeper_id: 'bk-1',
    period_year: 2026,
    period_month: 4,
    filename_original: 'statement.pdf',
    storage_path: 'bk-1/client-1/2026/4/req-1/statement.pdf',
    file_size_bytes: 102400,
    uploaded_at: '2026-04-02T10:00:00Z',
    ...overrides,
  }
}

describe('computeSubmissionStatus', () => {
  it('returns "complete" when no required documents', () => {
    const reqs = [makeReq({ required: false })]
    expect(computeSubmissionStatus(reqs)).toBe('complete')
  })

  it('returns "not_started" when nothing uploaded', () => {
    const reqs = [makeReq(), makeReq({ id: 'req-2', label: 'CC Statement' })]
    expect(computeSubmissionStatus(reqs)).toBe('not_started')
  })

  it('returns "partial" when some required docs uploaded', () => {
    const reqs = [
      makeReq({ uploads: [makeUpload()] }),
      makeReq({ id: 'req-2', label: 'CC Statement' }),
    ]
    expect(computeSubmissionStatus(reqs)).toBe('partial')
  })

  it('returns "complete" when all required docs uploaded', () => {
    const reqs = [
      makeReq({ uploads: [makeUpload()] }),
      makeReq({ id: 'req-2', uploads: [makeUpload({ id: 'up-2' })] }),
    ]
    expect(computeSubmissionStatus(reqs)).toBe('complete')
  })

  it('ignores optional docs when computing status', () => {
    const reqs = [
      makeReq({ uploads: [makeUpload()] }),
      makeReq({ id: 'req-2', required: false }), // optional, no upload — should still be "complete"
    ]
    expect(computeSubmissionStatus(reqs)).toBe('complete')
  })

  it('returns "complete" for empty requirements array', () => {
    expect(computeSubmissionStatus([])).toBe('complete')
  })
})

describe('getMissingDocuments', () => {
  it('returns labels of missing required documents', () => {
    const reqs = [
      makeReq({ label: 'Bank Statement', uploads: [makeUpload()] }),
      makeReq({ id: 'req-2', label: 'CC Statement' }),
      makeReq({ id: 'req-3', label: 'Receipts', required: false }),
    ]
    expect(getMissingDocuments(reqs)).toEqual(['CC Statement'])
  })

  it('returns empty array when all required docs uploaded', () => {
    const reqs = [
      makeReq({ uploads: [makeUpload()] }),
    ]
    expect(getMissingDocuments(reqs)).toEqual([])
  })

  it('excludes optional docs from missing list', () => {
    const reqs = [
      makeReq({ required: false }),
    ]
    expect(getMissingDocuments(reqs)).toEqual([])
  })
})
