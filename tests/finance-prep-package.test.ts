import { describe, it, expect } from 'vitest'
import { buildBookkeeperPackageHtml } from '../src/lib/finance-prep'
import type { RequirementWithUploads, DocumentUpload } from '../src/types'
import type { CompletenessReport } from '../src/lib/completeness-check'

function makeReq(uploads: DocumentUpload[] = []): RequirementWithUploads {
  return {
    id: 'req-1',
    client_id: 'c-1',
    label: 'Bank Statement',
    doc_type: 'bank',
    required: true,
    sort_order: 0,
    uploads,
  }
}

const complete: CompletenessReport = {
  checks: [{ id: 'required-docs', label: 'Required documents', severity: 'pass', detail: 'All good' }],
  score: 100,
  readyForBookkeeper: true,
  missingItems: [],
  warnings: [],
}

describe('buildBookkeeperPackageHtml', () => {
  it('includes Package ready for review when completeness passes', () => {
    const upload: DocumentUpload = {
      id: 'up-1',
      requirement_id: 'req-1',
      client_id: 'c-1',
      bookkeeper_id: 'bk-1',
      period_year: 2026,
      period_month: 7,
      filename_original: 'bank.pdf',
      storage_path: 'p/bank.pdf',
      file_size_bytes: 100_000,
      uploaded_at: '2026-07-01T00:00:00Z',
    }
    const { html, filename } = buildBookkeeperPackageHtml({
      businessName: 'Acme Co',
      contactName: 'Pat',
      year: 2026,
      month: 7,
      requirements: [makeReq([upload])],
      completeness: complete,
    })
    expect(html).toContain('Package ready for review')
    expect(html).toContain('Acme Co')
    expect(filename).toMatch(/Acme_Co_2026_07_package\.html/)
  })

  it('marks incomplete when not ready for bookkeeper', () => {
    const incomplete: CompletenessReport = {
      ...complete,
      readyForBookkeeper: false,
      score: 40,
      missingItems: ['Payroll'],
    }
    const { html } = buildBookkeeperPackageHtml({
      businessName: 'Acme Co',
      contactName: '',
      year: 2026,
      month: 7,
      requirements: [makeReq([])],
      completeness: incomplete,
    })
    expect(html).toContain('Incomplete')
    expect(html).not.toMatch(/badge-pass">Package ready for review/)
  })
})
