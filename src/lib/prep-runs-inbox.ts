// prep-runs-inbox.ts — pure helpers for Period Desk prep-run inbox display.
// Filters workflow_runs to overnight/manual prep agent runs only.

import type { WorkflowRun } from './workflows/playbooks'

export interface PrepRunInboxItem {
  id: string
  playbookName: string
  status: WorkflowRun['status']
  startedAt: string
  completedAt: string | null
  readinessScore: number | null
  alertCount: number
  alerts: string[]
  stepCount: number
  periodYear: number
  periodMonth: number
  engineVersion: string
  summary: string
}

const PREP_NAME = /prep|close prep|storage/i

export function isPrepAgentRun(run: Pick<WorkflowRun, 'playbook_name' | 'engine_version'>): boolean {
  if (PREP_NAME.test(run.playbook_name ?? '')) return true
  if (/prep-agent/i.test(run.engine_version ?? '')) return true
  return false
}

export function toPrepRunInboxItem(run: WorkflowRun): PrepRunInboxItem {
  const alerts = run.alerts ?? []
  const steps = run.step_results ?? []
  const completeSteps = steps.filter(s => s.status === 'complete').length
  const summary =
    run.status === 'complete'
      ? `${completeSteps}/${steps.length} steps · ready for human package review`
      : run.status === 'partial'
        ? `${completeSteps}/${steps.length} steps · partial — see alerts`
        : run.status === 'failed'
          ? `Failed — ${alerts[0] ?? 'see audit'}`
          : `${steps.length} steps · ${run.status}`

  return {
    id: run.id,
    playbookName: run.playbook_name,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    readinessScore: run.readiness_score,
    alertCount: alerts.length,
    alerts,
    stepCount: steps.length,
    periodYear: run.period_year,
    periodMonth: run.period_month,
    engineVersion: run.engine_version,
    summary,
  }
}

/** Prep runs for a client period, newest first. */
export function buildPrepRunsInbox(
  runs: WorkflowRun[],
  period?: { year: number; month: number },
): PrepRunInboxItem[] {
  return runs
    .filter(isPrepAgentRun)
    .filter(r =>
      period
        ? r.period_year === period.year && r.period_month === period.month
        : true,
    )
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
    .map(toPrepRunInboxItem)
}

export function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
