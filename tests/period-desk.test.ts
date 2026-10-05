import { describe, it, expect } from 'vitest'
import {
  computeStageStatuses,
  suggestDefaultStage,
  deskPath,
  isPeriodDeskStage,
} from '../src/lib/period-desk'
import type { RequirementWithUploads } from '../src/types'
import type { PackageDraft } from '../src/lib/package-draft'

function reqs(partial: boolean): RequirementWithUploads[] {
  return [
    {
      id: 'r1',
      client_id: 'c1',
      label: 'Bank',
      doc_type: 'bank',
      required: true,
      sort_order: 0,
      uploads: partial
        ? [{
            id: 'u1',
            requirement_id: 'r1',
            client_id: 'c1',
            bookkeeper_id: 'b1',
            period_year: 2026,
            period_month: 7,
            filename_original: 'a.pdf',
            storage_path: 'p',
            file_size_bytes: 1,
            uploaded_at: '2026-07-01T00:00:00Z',
          }]
        : [],
    },
    {
      id: 'r2',
      client_id: 'c1',
      label: 'CC',
      doc_type: 'credit_card',
      required: true,
      sort_order: 1,
      uploads: [],
    },
  ]
}

function draft(status: PackageDraft['status']): PackageDraft {
  return {
    status,
    label: status,
    completeness: {
      checks: [],
      score: status === 'ready_for_review' ? 100 : 40,
      readyForBookkeeper: status === 'ready_for_review',
      missingItems: status === 'ready_for_review' ? [] : ['CC'],
      warnings: [],
    },
    period: { year: 2026, month: 7 },
    uploadCount: 1,
    requiredCount: 2,
    requiredUploadedCount: 1,
    canDownloadPackage: status === 'ready_for_review',
    canDownloadZip: status === 'ready_for_review',
    draftedAt: null,
    missingItems: status === 'ready_for_review' ? [] : ['CC'],
  }
}

describe('period desk', () => {
  it('flags collect needs_work when partial uploads', () => {
    const st = computeStageStatuses({
      requirements: reqs(true),
      packageDraft: draft('incomplete'),
      openExceptionCount: 0,
      openConfirmCount: 0,
      reconResult: null,
      hasParsedStatements: false,
    })
    expect(st.collect).toBe('needs_work')
    expect(st.package).toBe('needs_work')
    expect(suggestDefaultStage(st)).toBe('collect')
  })

  it('suggests exceptions when open exceptions dominate', () => {
    const completeReqs = reqs(true)
    completeReqs[1].uploads = [{
      id: 'u2',
      requirement_id: 'r2',
      client_id: 'c1',
      bookkeeper_id: 'b1',
      period_year: 2026,
      period_month: 7,
      filename_original: 'b.pdf',
      storage_path: 'p',
      file_size_bytes: 1,
      uploaded_at: '2026-07-02T00:00:00Z',
    }]
    const st = computeStageStatuses({
      requirements: completeReqs,
      packageDraft: draft('ready_for_review'),
      openExceptionCount: 4,
      openConfirmCount: 0,
      reconResult: null,
      hasParsedStatements: false,
    })
    expect(st.collect).toBe('done')
    expect(st.exceptions).toBe('needs_work')
    expect(suggestDefaultStage(st)).toBe('exceptions')
  })

  it('deskPath encodes stage and period', () => {
    expect(deskPath('c1', 'package', { year: 2026, month: 7 })).toBe(
      '/clients/c1?desk=package&year=2026&month=7',
    )
    expect(isPeriodDeskStage('exceptions')).toBe(true)
    expect(isPeriodDeskStage('nope')).toBe(false)
  })
})
