import { describe, it, expect } from 'vitest'
import {
  buildPrepRunsInbox,
  isPrepAgentRun,
  toPrepRunInboxItem,
} from '../src/lib/prep-runs-inbox'
import type { WorkflowRun } from '../src/lib/workflows/playbooks'

function run(partial: Partial<WorkflowRun> & Pick<WorkflowRun, 'id' | 'playbook_name'>): WorkflowRun {
  return {
    playbook_id: null,
    bookkeeper_id: 'bk-1',
    client_id: 'c-1',
    period_year: 2026,
    period_month: 7,
    step_results: [{ name: 'Storage parse', status: 'complete', durationMs: 0, resultSummary: 'ok' }],
    status: 'partial',
    started_at: '2026-07-14T12:00:00Z',
    completed_at: '2026-07-14T12:01:00Z',
    alerts: ['PDF empty'],
    engine_version: 'prep-agent-v1.3-storage-pdf',
    readiness_score: 70,
    ...partial,
  }
}

describe('prep-runs-inbox', () => {
  it('recognizes close prep agent runs', () => {
    expect(isPrepAgentRun({ playbook_name: 'Close prep agent (cron storage)', engine_version: 'x' })).toBe(true)
    expect(isPrepAgentRun({ playbook_name: 'Month-end close service', engine_version: 'prep-agent-v1' })).toBe(true)
    expect(isPrepAgentRun({ playbook_name: 'Client meeting Q&A', engine_version: 'wf-1' })).toBe(false)
  })

  it('filters to period and maps summary', () => {
    const runs = [
      run({ id: '1', playbook_name: 'Close prep agent (cron storage)', period_month: 7 }),
      run({ id: '2', playbook_name: 'Close prep agent (cron storage)', period_month: 6, started_at: '2026-06-01T00:00:00Z' }),
      run({ id: '3', playbook_name: 'Other playbook', engine_version: 'other' }),
    ]
    const inbox = buildPrepRunsInbox(runs, { year: 2026, month: 7 })
    expect(inbox).toHaveLength(1)
    expect(inbox[0].id).toBe('1')
    expect(inbox[0].alertCount).toBe(1)
    expect(inbox[0].summary).toMatch(/partial|steps/i)
  })

  it('toPrepRunInboxItem marks complete runs clearly', () => {
    const item = toPrepRunInboxItem(
      run({
        id: 'ok',
        playbook_name: 'Close prep',
        status: 'complete',
        alerts: [],
      }),
    )
    expect(item.summary).toMatch(/human package review/i)
  })
})
