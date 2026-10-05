import { describe, it, expect } from 'vitest'
import { runCompletenessChecks } from '../src/lib/completeness-check'
import type { RequirementWithUploads, DocumentUpload } from '../src/types'

function makeReq(overrides: Partial<RequirementWithUploads> = {}): RequirementWithUploads {
  return {
    id: 'req-1', client_id: 'c-1', label: 'Bank Statement',
    doc_type: 'bank', required: true, sort_order: 0, uploads: [],
    ...overrides,
  }
}

function makeUpload(overrides: Partial<DocumentUpload> = {}): DocumentUpload {
  return {
    id: 'up-1', requirement_id: 'req-1', client_id: 'c-1', bookkeeper_id: 'bk-1',
    period_year: 2026, period_month: 4, filename_original: 'statement.pdf',
    storage_path: 'path/statement.pdf', file_size_bytes: 245_760,
    uploaded_at: '2026-04-02T10:00:00Z',
    ...overrides,
  }
}

describe('runCompletenessChecks', () => {
  it('is ready for bookkeeper with all required docs uploaded', () => {
    const reqs = [
      makeReq({ uploads: [makeUpload()] }),
      makeReq({ id: 'req-2', doc_type: 'credit_card', label: 'CC Statement', uploads: [makeUpload({ id: 'up-2' })] }),
    ]
    const report = runCompletenessChecks(reqs)
    expect(report.readyForBookkeeper).toBe(true)
    expect(report.score).toBeGreaterThanOrEqual(75)
    expect(report.missingItems).toEqual([])
    expect(report.checks.filter(c => c.severity === 'fail').length).toBe(0)
  })

  it('reports missing required docs as fail', () => {
    const reqs = [
      makeReq({ uploads: [makeUpload()] }),
      makeReq({ id: 'req-2', label: 'Missing CC', doc_type: 'credit_card' }),
    ]
    const report = runCompletenessChecks(reqs)
    expect(report.readyForBookkeeper).toBe(false)
    expect(report.missingItems).toContain('Missing CC')
  })

  it('flags small bank statement files as warning', () => {
    const reqs = [
      makeReq({
        uploads: [makeUpload({ file_size_bytes: 500 })], // only 500 bytes
      }),
    ]
    const report = runCompletenessChecks(reqs)
    const fileSizeCheck = report.checks.find(c => c.id === 'file-size')
    expect(fileSizeCheck).toBeDefined()
    expect(fileSizeCheck!.severity).toBe('warning')
  })

  it('detects duplicate filenames', () => {
    const reqs = [
      makeReq({
        uploads: [makeUpload({ filename_original: 'chase.pdf' })],
      }),
      makeReq({
        id: 'req-2', doc_type: 'credit_card', label: 'CC',
        uploads: [makeUpload({ id: 'up-2', filename_original: 'chase.pdf' })],
      }),
    ]
    const report = runCompletenessChecks(reqs)
    const dupCheck = report.checks.find(c => c.id === 'duplicates')
    expect(dupCheck).toBeDefined()
    expect(dupCheck!.severity).toBe('warning')
  })

  it('handles empty requirements gracefully', () => {
    const report = runCompletenessChecks([])
    expect(report.readyForBookkeeper).toBe(true)
    expect(report.score).toBe(100)
    expect(report.checks.length).toBeGreaterThanOrEqual(1)
  })

  it('ignores optional docs in missing items', () => {
    const reqs = [
      makeReq({ required: false, doc_type: 'receipt', label: 'Receipts' }),
    ]
    const report = runCompletenessChecks(reqs)
    expect(report.missingItems).toEqual([])
    expect(report.readyForBookkeeper).toBe(true)
  })
})
