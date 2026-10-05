import { describe, it, expect } from 'vitest'
import { executeWorkflowById, executeMonthEndCloseService } from '../src/lib/workflows/execute'
import { getWorkflow } from '../src/lib/workflows/registry'
import type { StatementSummary } from '../src/lib/parse-bank-statement'
import type { RequirementWithUploads } from '../src/types'

function makeStatement(): StatementSummary {
  return {
    bankName: 'Chase',
    statementType: 'bank',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    openingBalance: 1000,
    closingBalance: 1100,
    totalCredits: 500,
    totalDebits: 400,
    pageCount: 1,
    transactions: [
      {
        date: '2026-07-05',
        description: 'AWS SERVICES',
        amount: -50,
        balance: 950,
        category: 'Software',
        raw: 'AWS SERVICES -50.00',
      },
      {
        date: '2026-07-06',
        description: 'OFFICE DEPOT',
        amount: -30,
        balance: 920,
        category: 'Office',
        raw: 'OFFICE DEPOT -30.00',
      },
    ],
  }
}

function makeReqs(): RequirementWithUploads[] {
  return [{
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
      bookkeeper_id: 'bk',
      period_year: 2026,
      period_month: 7,
      filename_original: 'chase.pdf',
      storage_path: 'p/chase.pdf',
      file_size_bytes: 100_000,
      uploaded_at: '2026-07-02T00:00:00Z',
    }],
  }]
}

describe('executeMonthEndCloseService', () => {
  it('fails honestly with no statements', () => {
    const outcome = executeMonthEndCloseService({
      clientId: 'c1',
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toMatch(/No parsed/i)
  })

  it('runs pipeline and adds completeness + package steps', () => {
    const outcome = executeMonthEndCloseService({
      clientId: 'c1',
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [makeStatement()],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    const names = outcome.result.steps.map(s => s.name)
    expect(names.some(n => /Categorize/i.test(n))).toBe(true)
    expect(names).toContain('Completeness check')
    expect(names).toContain('Package draft status')
    expect(outcome.result.summary.totalTransactions).toBe(2)
  })
})

describe('executeWorkflowById', () => {
  it('marks month-end-close-service as live in registry', () => {
    expect(getWorkflow('month-end-close-service')?.status).toBe('live')
  })

  it('dispatches month-end-close-service', () => {
    const outcome = executeWorkflowById('month-end-close-service', {
      clientId: 'c1',
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [makeStatement()],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(true)
  })

  it('rejects planned workflows', () => {
    const outcome = executeWorkflowById('month-end-close-retail', {
      clientId: 'c1',
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [makeStatement()],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(false)
  })
})
