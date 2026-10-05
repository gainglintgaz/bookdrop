// src/lib/workflows/execute.ts
// G5 — real executors for Workflow Library entries (one live: month-end-close-service).
// Reuses existing engines; never fabricates transaction data.

import type { RequirementWithUploads } from '@/types'
import type { StatementSummary } from '../parse-bank-statement'
import type { ReconciliationResult } from '../reconciliation'
import { reconcileFromParsedStatements } from '../reconciliation'
import { runFullWorkflow, type WorkflowResult, type WorkflowStep } from '../workflow-engine'
import { runCompletenessChecks } from '../completeness-check'
import { evaluatePackageDraft } from '../package-draft'
import { getWorkflow } from './registry'

export interface WorkflowExecuteContext {
  clientId: string
  clientName: string
  period: { year: number; month: number }
  statements: StatementSummary[]
  requirements: RequirementWithUploads[]
  /** Optional precomputed recon; otherwise derived from statements when possible. */
  reconResult?: ReconciliationResult | null
}

export type WorkflowExecuteOutcome =
  | { ok: true; result: WorkflowResult }
  | { ok: false; error: string; result?: WorkflowResult }

function timedStep(name: string, fn: () => string): WorkflowStep {
  const start = performance.now()
  try {
    const resultSummary = fn()
    return {
      name,
      status: 'complete',
      durationMs: Math.round(performance.now() - start),
      resultSummary,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      name,
      status: 'failed',
      durationMs: Math.round(performance.now() - start),
      resultSummary: `Failed: ${message}`,
    }
  }
}

/**
 * Month-end close for service businesses:
 * parse→categorize→audit (via runFullWorkflow) + reconcile + completeness + package gate.
 */
export function executeMonthEndCloseService(ctx: WorkflowExecuteContext): WorkflowExecuteOutcome {
  if (ctx.statements.length === 0) {
    return {
      ok: false,
      error:
        'No parsed bank/credit-card statements for this period. Parse statements on the Analysis → Parse tab (or wait for portal auto-categorize data to be re-opened).',
    }
  }

  const pipeline = runFullWorkflow(
    ctx.statements,
    ctx.clientId,
    ctx.clientName,
    ctx.period,
  )

  const steps: WorkflowStep[] = [...pipeline.steps]
  const alerts = [...pipeline.summary.alerts]

  // Reconciliation (only when statements exist)
  const reconStep = timedStep('Reconciliation (unmatched only)', () => {
    const recon =
      ctx.reconResult ??
      reconcileFromParsedStatements(ctx.statements, ctx.requirements) ??
      null
    if (!recon) {
      return 'No reconciliation result (no receipt matches available) — skipped match stats'
    }
    const unmatched = recon.unmatchedTransactions.length
    if (unmatched > 0) {
      alerts.push(`${unmatched} unmatched bank line(s) need judgment`)
    }
    return `Match rate ${recon.matchRate}% · ${recon.matched.length} matched · ${unmatched} unmatched txns`
  })
  steps.push(reconStep)

  // Completeness gate
  const completenessStep = timedStep('Completeness check', () => {
    const report = runCompletenessChecks(ctx.requirements, ctx.statements)
    if (!report.readyForBookkeeper) {
      alerts.push(
        report.missingItems.length > 0
          ? `Package blocked — missing: ${report.missingItems.join(', ')}`
          : 'Package incomplete — required documents still missing',
      )
    }
    return `Score ${report.score}/100 · ready=${report.readyForBookkeeper ? 'yes' : 'no'}`
  })
  steps.push(completenessStep)

  // Package draft status (no download — human reviews)
  const packageStep = timedStep('Package draft status', () => {
    const draft = evaluatePackageDraft(
      ctx.requirements,
      ctx.period.year,
      ctx.period.month,
      ctx.statements,
    )
    if (draft.status === 'ready_for_review') {
      return 'Package ready for review — download from Documents or Export tab'
    }
    return draft.label
  })
  steps.push(packageStep)

  const failed = steps.filter(s => s.status === 'failed').length
  const status: WorkflowResult['status'] =
    failed === 0 ? 'complete' : failed < steps.length ? 'partial' : 'failed'

  // Mild readiness bump when package is ready
  const draft = evaluatePackageDraft(
    ctx.requirements,
    ctx.period.year,
    ctx.period.month,
    ctx.statements,
  )
  let readinessScore = pipeline.summary.readinessScore
  if (draft.status === 'ready_for_review') {
    readinessScore = Math.min(100, readinessScore + 8)
  }

  const result: WorkflowResult = {
    ...pipeline,
    steps,
    completedAt: new Date().toISOString(),
    status,
    summary: {
      ...pipeline.summary,
      readinessScore,
      alerts,
    },
  }

  return { ok: true, result }
}

/** Dispatch by workflow id. Only live workflows run engines. */
export function executeWorkflowById(
  workflowId: string,
  ctx: WorkflowExecuteContext,
): WorkflowExecuteOutcome {
  const def = getWorkflow(workflowId)
  if (!def) {
    return { ok: false, error: `Unknown workflow: ${workflowId}` }
  }
  if (def.status === 'planned') {
    return { ok: false, error: `"${def.label}" is planned, not runnable yet.` }
  }
  if (def.status === 'stub') {
    return {
      ok: false,
      error: `"${def.label}" is still a preview stub — not a live executor.`,
    }
  }

  switch (workflowId) {
    case 'month-end-close-service':
      return executeMonthEndCloseService(ctx)
    default:
      return {
        ok: false,
        error: `No executor registered for live workflow "${workflowId}".`,
      }
  }
}
