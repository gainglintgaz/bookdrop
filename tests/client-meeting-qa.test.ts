import { describe, it, expect } from 'vitest'
import { runClientMeetingQA } from '../src/lib/workflows/executors/client-meeting-qa'
import { runWorkflow, hasExecutor } from '../src/lib/workflows/dispatcher'
import type { WorkflowContext } from '../src/lib/workflows/executor-types'
import type { Client, RequirementWithUploads, DocumentUpload } from '../src/types'

function makeClient(over: Partial<Client> = {}): Client {
  return {
    id: 'c-1', bookkeeper_id: 'bk-1', business_name: 'Acme LLC',
    contact_name: 'Pat Doe', contact_email: 'pat@acme.com',
    portal_token: 'tok123456789', notes_private: null, notes_for_client: null,
    is_active: true, created_at: '2026-01-01T00:00:00Z', ...over,
  }
}

function makeReq(over: Partial<RequirementWithUploads> = {}): RequirementWithUploads {
  return {
    id: 'r-1', client_id: 'c-1', label: 'Bank Statement', doc_type: 'bank',
    required: true, sort_order: 0, uploads: [], ...over,
  }
}

function makeUpload(): DocumentUpload {
  return {
    id: 'u-1', requirement_id: 'r-1', client_id: 'c-1', bookkeeper_id: 'bk-1',
    period_year: 2026, period_month: 4, filename_original: 's.pdf',
    storage_path: 'p/s.pdf', file_size_bytes: 1000, uploaded_at: '2026-04-01T00:00:00Z',
  }
}

const baseCtx = (over: Partial<WorkflowContext> = {}): WorkflowContext => ({
  client: makeClient(),
  requirements: [makeReq()],
  period: { year: 2026, month: 4 },
  recentReminders: [],
  ...over,
})

describe('runClientMeetingQA', () => {
  it('returns ok with an HTML artifact when requirements exist', () => {
    const r = runClientMeetingQA(baseCtx())
    expect(r.ok).toBe(true)
    expect(r.artifact).toBeDefined()
    expect(r.artifact!.mimeType).toContain('text/html')
    expect(r.artifact!.filename).toMatch(/meeting-qa-Acme-LLC-2026-04\.html/)
    expect(r.artifact!.content).toContain('<html')
  })

  it('fails gracefully with no requirements', () => {
    const r = runClientMeetingQA(baseCtx({ requirements: [] }))
    expect(r.ok).toBe(false)
    expect(r.error).toBe('empty-requirements')
    expect(r.artifact).toBeUndefined()
  })

  it('surfaces missing documents as a high-priority topic', () => {
    const r = runClientMeetingQA(baseCtx({
      requirements: [makeReq({ label: 'Chase Statement', uploads: [] })],
    }))
    expect(r.artifact!.content).toContain('Chase Statement')
    expect(r.artifact!.content).toContain('outstanding document')
  })

  it('raises reminder cadence when 2+ reminders this period', () => {
    const ctx = baseCtx({
      recentReminders: [
        { id: 'rl1', client_id: 'c-1', bookkeeper_id: 'bk-1', period_year: 2026, period_month: 4, reminder_number: 1, sent_at: '2026-04-05T00:00:00Z', triggered_by: 'auto', resend_email_id: null },
        { id: 'rl2', client_id: 'c-1', bookkeeper_id: 'bk-1', period_year: 2026, period_month: 4, reminder_number: 2, sent_at: '2026-04-10T00:00:00Z', triggered_by: 'auto', resend_email_id: null },
      ],
    })
    const r = runClientMeetingQA(ctx)
    expect(r.artifact!.content).toContain('2 reminders')
  })

  it('escapes HTML in client-provided fields (no injection)', () => {
    const r = runClientMeetingQA(baseCtx({
      client: makeClient({ business_name: '<script>x</script>Co', notes_for_client: '<b>note</b>' }),
    }))
    expect(r.artifact!.content).not.toContain('<script>x</script>')
    expect(r.artifact!.content).toContain('&lt;script&gt;')
  })

  it('NEVER emits advice phrases (LEGAL_GUARDRAILS compliance)', () => {
    const r = runClientMeetingQA(baseCtx({
      requirements: [makeReq({ uploads: [makeUpload()] })],  // complete
    }))
    const forbidden = /you should|we recommend|file form|deduct this|invest in/i
    expect(forbidden.test(r.artifact!.content)).toBe(false)
  })
})

describe('workflow dispatcher', () => {
  it('client-meeting-qa is wired (live executor)', () => {
    expect(hasExecutor('client-meeting-qa')).toBe(true)
  })

  it('unknown / planned workflows return a friendly not-wired result', () => {
    const r = runWorkflow('audit-prep-packet', baseCtx())
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no-executor')
    expect(r.summary).toMatch(/still being built/i)
  })

  it('runWorkflow routes client-meeting-qa to its executor', () => {
    const r = runWorkflow('client-meeting-qa', baseCtx())
    expect(r.ok).toBe(true)
    expect(r.workflowId).toBe('client-meeting-qa')
  })
})
