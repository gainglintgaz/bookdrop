import { describe, it, expect } from 'vitest'
import { evaluatePackageDraft } from '../src/lib/package-draft'
import type { RequirementWithUploads, DocumentUpload } from '../src/types'

function makeReq(overrides: Partial<RequirementWithUploads> = {}): RequirementWithUploads {
  return {
    id: 'req-1',
    client_id: 'c-1',
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
    client_id: 'c-1',
    bookkeeper_id: 'bk-1',
    period_year: 2026,
    period_month: 7,
    filename_original: 'statement.pdf',
    storage_path: 'path/statement.pdf',
    file_size_bytes: 245_760,
    uploaded_at: '2026-07-02T10:00:00Z',
    ...overrides,
  }
}

describe('evaluatePackageDraft', () => {
  it('is not_started with zero uploads', () => {
    const draft = evaluatePackageDraft([makeReq()], 2026, 7)
    expect(draft.status).toBe('not_started')
    expect(draft.canDownloadPackage).toBe(false)
    expect(draft.draftedAt).toBeNull()
  })

  it('is incomplete when required docs missing', () => {
    const draft = evaluatePackageDraft(
      [
        makeReq({ uploads: [makeUpload()] }),
        makeReq({ id: 'req-2', label: 'CC', doc_type: 'credit_card', uploads: [] }),
      ],
      2026,
      7,
    )
    expect(draft.status).toBe('incomplete')
    expect(draft.canDownloadPackage).toBe(false)
    expect(draft.canDownloadZip).toBe(true)
    expect(draft.missingItems).toContain('CC')
    expect(draft.label).toMatch(/missing/i)
  })

  it('auto-drafts ready_for_review when completeness passes', () => {
    const draft = evaluatePackageDraft(
      [
        makeReq({ uploads: [makeUpload()] }),
        makeReq({
          id: 'req-2',
          label: 'CC',
          doc_type: 'credit_card',
          uploads: [makeUpload({ id: 'up-2', requirement_id: 'req-2' })],
        }),
      ],
      2026,
      7,
    )
    expect(draft.status).toBe('ready_for_review')
    expect(draft.label).toBe('Package ready for review')
    expect(draft.canDownloadPackage).toBe(true)
    expect(draft.canDownloadZip).toBe(true)
    expect(draft.draftedAt).toBeTruthy()
    expect(draft.completeness.readyForBookkeeper).toBe(true)
  })

  it('allows ready when only warnings (small file) and no fails', () => {
    const draft = evaluatePackageDraft(
      [
        makeReq({
          uploads: [makeUpload({ file_size_bytes: 500 })],
        }),
      ],
      2026,
      7,
    )
    // small bank file is warning, not fail → still ready
    expect(draft.completeness.readyForBookkeeper).toBe(true)
    expect(draft.status).toBe('ready_for_review')
  })
})
