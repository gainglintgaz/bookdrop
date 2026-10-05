import { describe, it, expect, beforeEach } from 'vitest'
import {
  PLAYBOOK_STEP_IDS,
  validatePlaybookSteps,
  runPlaybookStep,
  createScratch,
  DEFAULT_MONTH_END_STEP_IDS,
  isPlaybookStepId,
} from '../src/lib/workflows/playbook-steps'
import {
  __resetPlaybookDemoStore,
  createPlaybook,
  ensureDefaultPlaybook,
  listPlaybooks,
  listRecentRuns,
  softDeletePlaybook,
  updatePlaybook,
} from '../src/lib/workflows/playbooks'
import { executePlaybook } from '../src/lib/workflows/run-playbook'
import type { StatementSummary } from '../src/lib/parse-bank-statement'
import type { RequirementWithUploads } from '../src/types'

// Force demo-like localStorage path via demo bookkeeper id
const BK = 'demo-bk-playbook-test'
const CLIENT = 'client-playbook-test'

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
    client_id: CLIENT,
    label: 'Bank',
    doc_type: 'bank',
    required: true,
    sort_order: 0,
    uploads: [{
      id: 'u1',
      requirement_id: 'r1',
      client_id: CLIENT,
      bookkeeper_id: BK,
      period_year: 2026,
      period_month: 7,
      filename_original: 'chase.pdf',
      storage_path: 'p/chase.pdf',
      file_size_bytes: 100_000,
      uploaded_at: '2026-07-02T00:00:00Z',
    }],
  }]
}

beforeEach(() => {
  __resetPlaybookDemoStore()
})

describe('playbook allowlist', () => {
  it('exports only proven step ids', () => {
    expect(PLAYBOOK_STEP_IDS).toContain('extract_map')
    expect(PLAYBOOK_STEP_IDS).toContain('package_draft')
    expect(PLAYBOOK_STEP_IDS).not.toContain('file_941')
    expect(PLAYBOOK_STEP_IDS).not.toContain('deduct_this')
  })

  it('rejects free-typed illegal steps', () => {
    const bad = validatePlaybookSteps(['extract_map', 'file_form_941'])
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toMatch(/allowlist/i)
  })

  it('accepts default month-end composition', () => {
    const ok = validatePlaybookSteps([...DEFAULT_MONTH_END_STEP_IDS])
    expect(ok.ok).toBe(true)
  })

  it('isPlaybookStepId guards', () => {
    expect(isPlaybookStepId('categorize')).toBe(true)
    expect(isPlaybookStepId('you_should_deduct')).toBe(false)
  })
})

describe('playbook CRUD (demo store)', () => {
  it('seeds default playbook', async () => {
    const list = await listPlaybooks(BK)
    expect(list.length).toBeGreaterThanOrEqual(1)
    expect(list.some(p => p.is_default)).toBe(true)
    expect(list[0].step_ids.length).toBeGreaterThan(0)
  })

  it('creates playbook from allowlist only', async () => {
    ensureDefaultPlaybook(BK)
    const res = await createPlaybook({
      bookkeeperId: BK,
      name: 'Light close',
      stepIds: ['completeness', 'package_draft'],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.playbook.step_ids).toEqual(['completeness', 'package_draft'])
  })

  it('refuses illegal step ids on create', async () => {
    const res = await createPlaybook({
      bookkeeperId: BK,
      name: 'Bad',
      stepIds: ['file_941'],
    })
    expect(res.ok).toBe(false)
  })

  it('reorders steps via update', async () => {
    ensureDefaultPlaybook(BK)
    const created = await createPlaybook({
      bookkeeperId: BK,
      name: 'Reorder me',
      stepIds: ['extract_map', 'categorize', 'completeness'],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const updated = await updatePlaybook({
      bookkeeperId: BK,
      playbookId: created.playbook.id,
      stepIds: ['completeness', 'categorize', 'extract_map'],
    })
    expect(updated.ok).toBe(true)
    if (!updated.ok) return
    expect(updated.playbook.step_ids[0]).toBe('completeness')
  })

  it('soft-deletes and blocks deleting last playbook', async () => {
    __resetPlaybookDemoStore()
    const seed = ensureDefaultPlaybook(BK)
    const alone = await softDeletePlaybook({ bookkeeperId: BK, playbookId: seed.id })
    expect(alone.ok).toBe(false)

    const second = await createPlaybook({
      bookkeeperId: BK,
      name: 'Second',
      stepIds: ['completeness'],
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const del = await softDeletePlaybook({ bookkeeperId: BK, playbookId: seed.id })
    expect(del.ok).toBe(true)
    const list = await listPlaybooks(BK)
    expect(list.every(p => p.id !== seed.id)).toBe(true)
  })
})

describe('executePlaybook', () => {
  it('fails honestly without statements when steps need them', async () => {
    const pb = ensureDefaultPlaybook(BK)
    const outcome = await executePlaybook(pb, {
      bookkeeperId: BK,
      clientId: CLIENT,
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error).toMatch(/No parsed/i)
  })

  it('runs default composition and records audit run', async () => {
    const pb = ensureDefaultPlaybook(BK)
    const outcome = await executePlaybook(pb, {
      bookkeeperId: BK,
      clientId: CLIENT,
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [makeStatement()],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.steps.length).toBe(DEFAULT_MONTH_END_STEP_IDS.length)
    expect(outcome.result.summary.totalTransactions).toBe(2)
    expect(outcome.run.engine_version).toBe('playbook-v1')
    expect(outcome.run.step_results.length).toBe(DEFAULT_MONTH_END_STEP_IDS.length)

    const runs = await listRecentRuns({ bookkeeperId: BK, clientId: CLIENT })
    expect(runs.length).toBeGreaterThanOrEqual(1)
    expect(runs[0].playbook_id).toBe(pb.id)
  })

  it('runs a light playbook with docs-only steps without statements', async () => {
    const created = await createPlaybook({
      bookkeeperId: BK,
      name: 'Docs only',
      stepIds: ['completeness', 'package_draft'],
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const outcome = await executePlaybook(created.playbook, {
      bookkeeperId: BK,
      clientId: CLIENT,
      clientName: 'Acme',
      period: { year: 2026, month: 7 },
      statements: [],
      requirements: makeReqs(),
    })
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.result.steps.map(s => s.name)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Completeness/i),
        expect.stringMatching(/Package/i),
      ]),
    )
  })
})

describe('runPlaybookStep', () => {
  it('extract_map populates scratch', () => {
    const scratch = createScratch()
    const step = runPlaybookStep(
      'extract_map',
      {
        clientId: CLIENT,
        clientName: 'Acme',
        period: { year: 2026, month: 7 },
        statements: [makeStatement()],
        requirements: makeReqs(),
      },
      scratch,
    )
    expect(step.status).toBe('complete')
    expect(scratch.mapped.length).toBe(2)
  })
})
