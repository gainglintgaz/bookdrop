// playbook-steps.ts — Phase 4 allowlisted playbook steps.
// Only proven engines may appear here. No Level-3 tax/advice actions.
// Free-typed step names are rejected; composition is allowlist-only.

import type { RequirementWithUploads } from '@/types'
import type { StatementSummary, ParsedTransaction } from '../parse-bank-statement'
import type { ReconciliationResult } from '../reconciliation'
import { reconcileFromParsedStatements } from '../reconciliation'
import { categorizeTransactions } from '../categorization-engine'
import { runAuditChecks } from '../duplicate-detector'
import { runCompletenessChecks } from '../completeness-check'
import { evaluatePackageDraft } from '../package-draft'
import type { WorkflowStep } from '../workflow-engine'

/** Stable allowlist IDs — never free-type beyond this set. */
export const PLAYBOOK_STEP_IDS = [
  'extract_map',
  'categorize',
  'audit_duplicates',
  'recon_unmatched',
  'completeness',
  'package_draft',
] as const

export type PlaybookStepId = (typeof PLAYBOOK_STEP_IDS)[number]

export function isPlaybookStepId(id: string): id is PlaybookStepId {
  return (PLAYBOOK_STEP_IDS as readonly string[]).includes(id)
}

export interface PlaybookStepDef {
  id: PlaybookStepId
  label: string
  description: string
  /** Needs parsed bank/CC statements in context. */
  requiresStatements: boolean
}

/** Human-readable catalog for the editor UI. */
export const PLAYBOOK_STEP_CATALOG: readonly PlaybookStepDef[] = [
  {
    id: 'extract_map',
    label: 'Extract & map transactions',
    description: 'Flatten parsed statements into a transaction list for downstream steps.',
    requiresStatements: true,
  },
  {
    id: 'categorize',
    label: 'Auto-categorize',
    description: 'Rule/heuristic categorization with confidence flags. No tax advice.',
    requiresStatements: true,
  },
  {
    id: 'audit_duplicates',
    label: 'Duplicate & anomaly detection',
    description: 'Flag likely duplicates and unusual amounts for human review.',
    requiresStatements: true,
  },
  {
    id: 'recon_unmatched',
    label: 'Reconciliation (unmatched only)',
    description: 'Match bank lines to receipts when both exist; surface unmatched only.',
    requiresStatements: true,
  },
  {
    id: 'completeness',
    label: 'Completeness check',
    description: 'Score required docs + package readiness for this period.',
    requiresStatements: false,
  },
  {
    id: 'package_draft',
    label: 'Package draft status',
    description: 'Gate: ready_for_review vs incomplete. Does not download or e-file.',
    requiresStatements: false,
  },
] as const

export function getPlaybookStepDef(id: PlaybookStepId): PlaybookStepDef {
  const def = PLAYBOOK_STEP_CATALOG.find(s => s.id === id)
  if (!def) throw new Error(`Unknown playbook step: ${id}`)
  return def
}

/** Default month-end service composition (matches live G5 workflow). */
export const DEFAULT_MONTH_END_STEP_IDS: readonly PlaybookStepId[] = [
  'extract_map',
  'categorize',
  'audit_duplicates',
  'recon_unmatched',
  'completeness',
  'package_draft',
]

export interface PlaybookRunContext {
  clientId: string
  clientName: string
  period: { year: number; month: number }
  statements: StatementSummary[]
  requirements: RequirementWithUploads[]
  reconResult?: ReconciliationResult | null
}

interface MappedTxn {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  category?: string
}

/** Shared scratch between sequential steps in one playbook run. */
export interface PlaybookScratch {
  mapped: MappedTxn[]
  alerts: string[]
  recon: ReconciliationResult | null
}

export function createScratch(): PlaybookScratch {
  return { mapped: [], alerts: [], recon: null }
}

function timed(name: string, fn: () => string): WorkflowStep {
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

function mapTransactions(statements: StatementSummary[]): MappedTxn[] {
  return statements.flatMap(s => s.transactions).map((t: ParsedTransaction) => ({
    date: t.date,
    description: t.description,
    amount: Math.abs(t.amount),
    type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
    category: t.category,
  }))
}

/**
 * Execute one allowlisted step. Mutates scratch for downstream steps.
 * Unknown IDs must be filtered before call (validatePlaybookSteps).
 */
export function runPlaybookStep(
  stepId: PlaybookStepId,
  ctx: PlaybookRunContext,
  scratch: PlaybookScratch,
): WorkflowStep {
  const def = getPlaybookStepDef(stepId)

  switch (stepId) {
    case 'extract_map':
      return timed(def.label, () => {
        if (ctx.statements.length === 0) {
          throw new Error('No parsed statements for this period')
        }
        scratch.mapped = mapTransactions(ctx.statements)
        if (scratch.mapped.length === 0) {
          throw new Error('Statements present but zero transactions extracted')
        }
        return `Extracted ${scratch.mapped.length} transactions from ${ctx.statements.length} statement(s)`
      })

    case 'categorize':
      return timed(def.label, () => {
        if (scratch.mapped.length === 0) {
          // Allow categorize-first if statements exist
          if (ctx.statements.length === 0) {
            throw new Error('No transactions to categorize — run Extract & map first or parse statements')
          }
          scratch.mapped = mapTransactions(ctx.statements)
        }
        const catInput = scratch.mapped.map(t => ({
          description: t.description,
          amount: t.type === 'debit' ? -t.amount : t.amount,
          date: t.date,
        }))
        const report = categorizeTransactions(catInput)
        const total = report.summary.totalCategorized
        const highMed = report.summary.highConfidence + report.summary.mediumConfidence
        const rate = total > 0 ? Math.round((highMed / total) * 100) : 0
        if (report.summary.lowConfidence > total * 0.3 && total > 0) {
          scratch.alerts.push(
            `${report.summary.lowConfidence} transactions have low categorization confidence — manual review recommended`,
          )
        }
        return `${total} categorized (${rate}% high/medium confidence), ${report.summary.flaggedCount} flagged`
      })

    case 'audit_duplicates':
      return timed(def.label, () => {
        if (scratch.mapped.length === 0) {
          if (ctx.statements.length === 0) {
            throw new Error('No transactions to audit')
          }
          scratch.mapped = mapTransactions(ctx.statements)
        }
        const audit = runAuditChecks(scratch.mapped)
        if (audit.duplicates.length > 0) {
          scratch.alerts.push(
            `${audit.duplicates.length} potential duplicate transaction(s) detected — review recommended`,
          )
        }
        if (audit.unusualTransactions.length > 0) {
          scratch.alerts.push(
            `${audit.unusualTransactions.length} unusual transaction(s) flagged for review`,
          )
        }
        if (audit.summary.criticalItems > 0) {
          scratch.alerts.push(
            `${audit.summary.criticalItems} critical audit item(s) require attention`,
          )
        }
        return `Grade ${audit.grade}: ${audit.duplicates.length} duplicates, ${audit.unusualTransactions.length} anomalies, ${audit.summary.potentialIssues} total issues`
      })

    case 'recon_unmatched':
      return timed(def.label, () => {
        const recon =
          ctx.reconResult ??
          reconcileFromParsedStatements(ctx.statements, ctx.requirements) ??
          null
        scratch.recon = recon
        if (!recon) {
          return 'No reconciliation result (no receipt matches available) — skipped match stats'
        }
        const unmatched = recon.unmatchedTransactions.length
        if (unmatched > 0) {
          scratch.alerts.push(`${unmatched} unmatched bank line(s) need judgment`)
        }
        return `Match rate ${recon.matchRate}% · ${recon.matched.length} matched · ${unmatched} unmatched txns`
      })

    case 'completeness':
      return timed(def.label, () => {
        const report = runCompletenessChecks(ctx.requirements, ctx.statements)
        if (!report.readyForBookkeeper) {
          scratch.alerts.push(
            report.missingItems.length > 0
              ? `Package blocked — missing: ${report.missingItems.join(', ')}`
              : 'Package incomplete — required documents still missing',
          )
        }
        return `Score ${report.score}/100 · ready=${report.readyForBookkeeper ? 'yes' : 'no'}`
      })

    case 'package_draft':
      return timed(def.label, () => {
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

    default: {
      const _exhaustive: never = stepId
      throw new Error(`Unhandled playbook step: ${_exhaustive}`)
    }
  }
}

/** Reject any non-allowlisted step ids. */
export function validatePlaybookSteps(stepIds: string[]): {
  ok: true
  steps: PlaybookStepId[]
} | {
  ok: false
  error: string
} {
  if (stepIds.length === 0) {
    return { ok: false, error: 'Playbook needs at least one step from the allowlist.' }
  }
  const steps: PlaybookStepId[] = []
  for (const id of stepIds) {
    if (!isPlaybookStepId(id)) {
      return {
        ok: false,
        error: `Step "${id}" is not on the allowlist. Only proven engines can be composed.`,
      }
    }
    steps.push(id)
  }
  return { ok: true, steps }
}
