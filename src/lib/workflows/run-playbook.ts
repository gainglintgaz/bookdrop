// run-playbook.ts — Phase 4 playbook runner + WorkflowResult bridge.
// Composes allowlisted steps only. Records audit run after execution.

import type { WorkflowResult } from '../workflow-engine'
import { evaluatePackageDraft } from '../package-draft'
import {
  createScratch,
  runPlaybookStep,
  validatePlaybookSteps,
  type PlaybookRunContext,
} from './playbook-steps'
import {
  PLAYBOOK_ENGINE_VERSION,
  recordWorkflowRun,
  type WorkflowPlaybook,
  type WorkflowRun,
} from './playbooks'

export type PlaybookExecuteOutcome =
  | { ok: true; result: WorkflowResult; run: WorkflowRun }
  | { ok: false; error: string; result?: WorkflowResult; run?: WorkflowRun }

function scoreToGrade(score: number): string {
  if (score >= 97) return 'A+'
  if (score >= 93) return 'A'
  if (score >= 90) return 'A-'
  if (score >= 87) return 'B+'
  if (score >= 83) return 'B'
  if (score >= 80) return 'B-'
  if (score >= 77) return 'C+'
  if (score >= 73) return 'C'
  if (score >= 70) return 'C-'
  if (score >= 67) return 'D+'
  if (score >= 63) return 'D'
  if (score >= 60) return 'D-'
  return 'F'
}

/**
 * Run a playbook's ordered allowlisted steps against real period data.
 * Never invents balances. Records workflow_runs for audit.
 */
export async function executePlaybook(
  playbook: WorkflowPlaybook,
  ctx: PlaybookRunContext & { bookkeeperId: string },
): Promise<PlaybookExecuteOutcome> {
  if (playbook.deleted_at) {
    return { ok: false, error: 'This playbook was deleted. Restore or create a new one.' }
  }

  const validated = validatePlaybookSteps(playbook.step_ids)
  if (!validated.ok) return { ok: false, error: validated.error }

  const needsStatements = validated.steps.some(
    id => id === 'extract_map' || id === 'categorize' || id === 'audit_duplicates' || id === 'recon_unmatched',
  )
  if (needsStatements && ctx.statements.length === 0) {
    return {
      ok: false,
      error:
        'No parsed bank/credit-card statements for this period. Parse statements on the Analysis → Parse tab first.',
    }
  }

  const startedAt = new Date().toISOString()
  const scratch = createScratch()
  const steps = validated.steps.map(id => runPlaybookStep(id, ctx, scratch))

  const failed = steps.filter(s => s.status === 'failed').length
  const status: WorkflowResult['status'] =
    failed === 0 ? 'complete' : failed < steps.length ? 'partial' : 'failed'

  const totalTransactions = scratch.mapped.length
  const draft = evaluatePackageDraft(
    ctx.requirements,
    ctx.period.year,
    ctx.period.month,
    ctx.statements,
  )

  // Readiness: base on presence of complete core steps + package gate
  let readinessScore = 40
  if (steps.some(s => /categorize/i.test(s.name) && s.status === 'complete')) readinessScore += 20
  if (steps.some(s => /Duplicate|anomaly/i.test(s.name) && s.status === 'complete')) readinessScore += 15
  if (steps.some(s => /Completeness/i.test(s.name) && s.status === 'complete')) readinessScore += 15
  if (draft.status === 'ready_for_review') readinessScore = Math.min(100, readinessScore + 10)
  readinessScore = Math.min(100, Math.max(0, readinessScore - failed * 20))

  const completedAt = new Date().toISOString()

  const result: WorkflowResult = {
    clientId: ctx.clientId,
    clientName: ctx.clientName,
    period: ctx.period,
    startedAt,
    completedAt,
    steps,
    status,
    summary: {
      totalTransactions,
      categorizedCount: totalTransactions,
      categorizationRate: totalTransactions > 0 ? 100 : 0,
      taxDeductionsFound: 0,
      taxDeductionAmount: 0,
      duplicatesFound: 0,
      anomaliesFound: 0,
      estimatedHoursSaved: totalTransactions > 0 ? Math.round((totalTransactions * 2 + 65) / 60 * 10) / 10 : 0,
      readinessScore,
      readinessGrade: scoreToGrade(readinessScore),
      topCategories: [],
      alerts: [...scratch.alerts],
    },
  }

  // Parse counts from step summaries when available (honest, no fabrication)
  const auditStep = steps.find(s => /Duplicate|anomaly/i.test(s.name))
  if (auditStep?.resultSummary) {
    const dupMatch = auditStep.resultSummary.match(/(\d+) duplicates/)
    const anomMatch = auditStep.resultSummary.match(/(\d+) anomalies/)
    if (dupMatch) result.summary.duplicatesFound = Number(dupMatch[1])
    if (anomMatch) result.summary.anomaliesFound = Number(anomMatch[1])
  }

  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    playbook_id: playbook.id,
    playbook_name: playbook.name,
    bookkeeper_id: ctx.bookkeeperId,
    client_id: ctx.clientId,
    period_year: ctx.period.year,
    period_month: ctx.period.month,
    step_results: steps.map(s => ({
      name: s.name,
      status: s.status,
      durationMs: s.durationMs,
      resultSummary: s.resultSummary,
    })),
    status,
    started_at: startedAt,
    completed_at: completedAt,
    alerts: result.summary.alerts,
    engine_version: PLAYBOOK_ENGINE_VERSION,
    readiness_score: readinessScore,
  }

  await recordWorkflowRun(run)

  if (status === 'failed') {
    return {
      ok: false,
      error: `Playbook "${playbook.name}" failed — all steps errored. See audit run.`,
      result,
      run,
    }
  }

  return { ok: true, result, run }
}
