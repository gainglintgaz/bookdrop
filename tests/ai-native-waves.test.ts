import { describe, it, expect, beforeEach } from 'vitest'
import {
  runPrepAgent,
  selectClientsNeedingPrep,
  PREP_AGENT_VERSION,
} from '../src/lib/prep-agent'
import { receiptToLineDrafts, receiptsToLineDrafts } from '../src/lib/receipt-to-lines'
import type { ScannedDocument } from '../src/lib/receipt-scanner'
import {
  buildFirmCategorySuggestions,
  suggestFirmCategory,
  firmAggregateEmptyCopy,
} from '../src/lib/firm-aggregates'
import { approveAndExport } from '../src/lib/export-approve'
import type { PackageDraft } from '../src/lib/package-draft'
import type { StatementSummary } from '../src/lib/parse-bank-statement'
import {
  __resetCategoryMemoryStore,
  recordCorrection,
} from '../src/lib/category-memory'

beforeEach(() => {
  __resetCategoryMemoryStore()
})

function makeStatement(): StatementSummary {
  return {
    bankName: 'Chase',
    statementType: 'bank',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    openingBalance: 1000,
    closingBalance: 900,
    totalCredits: 0,
    totalDebits: 100,
    pageCount: 1,
    transactions: [
      {
        date: '2026-07-05',
        description: 'AWS SERVICES',
        amount: -50,
        balance: 950,
        category: 'Software',
        raw: 'AWS',
      },
    ],
  }
}

function readyDraft(): PackageDraft {
  return {
    status: 'ready_for_review',
    label: 'ready',
    completeness: {
      checks: [],
      score: 100,
      readyForBookkeeper: true,
      missingItems: [],
      warnings: [],
    },
    period: { year: 2026, month: 7 },
    uploadCount: 1,
    requiredCount: 1,
    requiredUploadedCount: 1,
    canDownloadPackage: true,
    canDownloadZip: true,
    draftedAt: '2026-07-05T00:00:00Z',
    missingItems: [],
  }
}

describe('P2 prep agent', () => {
  it('selects only clients with new uploads not package-ready', () => {
    const ids = selectClientsNeedingPrep([
      { clientId: 'a', hasNewUploads: true, packageReady: false, lastPrepAt: null, uploadCount: 2 },
      { clientId: 'b', hasNewUploads: true, packageReady: true, lastPrepAt: null, uploadCount: 2 },
      { clientId: 'c', hasNewUploads: false, packageReady: false, lastPrepAt: null, uploadCount: 1 },
    ])
    expect(ids).toEqual(['a'])
  })

  it('runs allowlisted playbook and requires human gate', async () => {
    const result = await runPrepAgent({
      bookkeeperId: 'demo-bk',
      clientId: 'c1',
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      executeCtx: {
        clientId: 'c1',
        clientName: 'Acme',
        period: { year: 2026, month: 7 },
        statements: [makeStatement()],
        requirements: [{
          id: 'r1',
          client_id: 'c1',
          label: 'Bank',
          doc_type: 'bank',
          required: true,
          sort_order: 0,
          uploads: [{
            id: 'u1',
            requirement_id: 'r1',
            client_id: 'c1',
            bookkeeper_id: 'demo-bk',
            period_year: 2026,
            period_month: 7,
            filename_original: 'a.pdf',
            storage_path: 'p',
            file_size_bytes: 1,
            uploaded_at: '2026-07-01T00:00:00Z',
          }],
        }],
      },
    })
    expect(result.agentVersion).toBe(PREP_AGENT_VERSION)
    expect(result.humanGate).toBe('required')
    expect(result.ok).toBe(true)
  })
})

describe('P3 receipt to lines', () => {
  it('maps amount + vendor to line draft cents', () => {
    const doc: ScannedDocument = {
      id: 's1',
      filename: 'receipt.jpg',
      imageDataUrl: '',
      thumbnailDataUrl: '',
      originalSize: { width: 1, height: 1 },
      processedSize: { width: 1, height: 1 },
      fileSize: 100,
      capturedAt: '2026-07-01T00:00:00Z',
      source: 'file-upload',
      ocrText: 'OFFICE DEPOT 12.00',
      extractedData: {
        possibleAmount: 12.5,
        possibleDate: '2026-07-01',
        possibleVendor: 'Office Depot',
        possibleCategory: 'Office Supplies',
      },
      notes: '',
      tags: [],
    }
    const lines = receiptToLineDrafts(doc)
    expect(lines).toHaveLength(1)
    expect(lines[0].amount_cents).toBe(1250)
    expect(lines[0].suggested_category).toBe('Office Supplies')
    expect(lines[0].engine_version).toBe('receipt-capture-v1')
  })

  it('returns empty without amount (no fabrication)', () => {
    const doc: ScannedDocument = {
      id: 's2',
      filename: 'blank.jpg',
      imageDataUrl: '',
      thumbnailDataUrl: '',
      originalSize: { width: 1, height: 1 },
      processedSize: { width: 1, height: 1 },
      fileSize: 1,
      capturedAt: '2026-07-01T00:00:00Z',
      source: 'camera',
      ocrText: null,
      extractedData: {
        possibleAmount: null,
        possibleDate: null,
        possibleVendor: null,
        possibleCategory: null,
      },
      notes: '',
      tags: [],
    }
    expect(receiptToLineDrafts(doc)).toEqual([])
  })

  it('applies per-client memory on receipt', () => {
    recordCorrection('c1', 'Starbucks', 'Meals', 'Meals & Entertainment')
    const doc: ScannedDocument = {
      id: 's3',
      filename: 'sbux.jpg',
      imageDataUrl: '',
      thumbnailDataUrl: '',
      originalSize: { width: 1, height: 1 },
      processedSize: { width: 1, height: 1 },
      fileSize: 1,
      capturedAt: '2026-07-01T00:00:00Z',
      source: 'camera',
      ocrText: 'STARBUCKS',
      extractedData: {
        possibleAmount: 5,
        possibleDate: '2026-07-02',
        possibleVendor: 'Starbucks',
        possibleCategory: 'Uncategorized',
      },
      notes: '',
      tags: [],
    }
    const lines = receiptsToLineDrafts([doc], { clientId: 'c1' })
    expect(lines[0].suggested_category).toBe('Meals & Entertainment')
    expect(lines[0].source_rule).toBe('client_memory')
  })
})

describe('P4 firm aggregates', () => {
  it('suppresses below k=5 firms', () => {
    const obs = Array.from({ length: 4 }, (_, i) => ({
      vendorPattern: 'costco',
      category: 'COGS',
      contributorId: `firm-${i}`,
    }))
    expect(buildFirmCategorySuggestions(obs)).toHaveLength(0)
    expect(firmAggregateEmptyCopy(4)).toMatch(/5\+/)
  })

  it('emits suggestion at k≥5', () => {
    const obs = Array.from({ length: 5 }, (_, i) => ({
      vendorPattern: 'COSTCO #12',
      category: i < 4 ? 'COGS' : 'Office',
      contributorId: `firm-${i}`,
    }))
    const s = suggestFirmCategory(obs, 'POS COSTCO')
    expect(s).not.toBeNull()
    expect(s!.topCategory).toBe('COGS')
    expect(s!.contributorCount).toBe(5)
    expect(s!.dataBasis).toMatch(/Observation only/)
  })
})

describe('P5 export approve gate', () => {
  it('blocks without human approval', () => {
    const r = approveAndExport({
      packageDraft: readyDraft(),
      approvedByBookkeeper: false,
      format: 'qbo_csv',
      businessName: 'Acme',
      statements: [makeStatement()],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/reviewed this package|approve/i)
  })

  it('blocks when package not ready', () => {
    const draft = readyDraft()
    draft.status = 'incomplete'
    const r = approveAndExport({
      packageDraft: draft,
      approvedByBookkeeper: true,
      format: 'xero_csv',
      businessName: 'Acme',
      statements: [makeStatement()],
    })
    expect(r.ok).toBe(false)
  })

  it('blocks without parsed transactions', () => {
    const r = approveAndExport({
      packageDraft: readyDraft(),
      approvedByBookkeeper: true,
      format: 'qbo_csv',
      businessName: 'Acme',
      statements: [],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no parsed/i)
  })
})
