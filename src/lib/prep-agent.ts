// prep-agent.ts — P2 close-prep agent (deterministic + allowlisted playbook).
// Runs server-side or browser: compose playbook steps against real period data.
// Always leaves package at ready_for_review — never auto-posts books.

import {
  DEFAULT_MONTH_END_STEP_IDS,
  type PlaybookStepId,
} from './workflows/playbook-steps'
import {
  executePlaybook,
  type PlaybookExecuteOutcome,
} from './workflows/run-playbook'
import type { WorkflowPlaybook } from './workflows/playbooks'
import type { WorkflowExecuteContext } from './workflows/execute'
import { PLAYBOOK_ENGINE_VERSION } from './workflows/playbooks'

export const PREP_AGENT_VERSION = 'prep-agent-v1'

export interface PrepAgentJob {
  bookkeeperId: string
  clientId: string
  clientName: string
  period: { year: number; month: number }
  /** Allowlisted step ids; defaults to month-end service composition. */
  stepIds?: PlaybookStepId[]
  playbookName?: string
  executeCtx: WorkflowExecuteContext
}

export interface PrepAgentResult {
  ok: boolean
  agentVersion: string
  playbookEngine: string
  outcome: PlaybookExecuteOutcome
  humanGate: 'required'
  message: string
}

/**
 * Run the prep agent for one client×period.
 * Human gate is always required for package approve (not auto-sent).
 */
export async function runPrepAgent(job: PrepAgentJob): Promise<PrepAgentResult> {
  const now = new Date().toISOString()
  const playbook: WorkflowPlaybook = {
    id: `prep-agent-${job.clientId}`,
    bookkeeper_id: job.bookkeeperId,
    name: job.playbookName ?? 'Close prep agent (default)',
    description: 'Automated prep from allowlisted steps only.',
    step_ids: job.stepIds?.length ? job.stepIds : [...DEFAULT_MONTH_END_STEP_IDS],
    is_default: false,
    is_system: true,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  }

  const outcome = await executePlaybook(playbook, {
    ...job.executeCtx,
    bookkeeperId: job.bookkeeperId,
    clientId: job.clientId,
    clientName: job.clientName,
    period: job.period,
  })

  return {
    ok: outcome.ok,
    agentVersion: PREP_AGENT_VERSION,
    playbookEngine: PLAYBOOK_ENGINE_VERSION,
    outcome,
    humanGate: 'required',
    message: outcome.ok
      ? 'Prep complete — review exceptions and approve package (human gate).'
      : outcome.error,
  }
}

/** Which clients need prep tonight? Pure filter — caller supplies upload signals. */
export function selectClientsNeedingPrep(clients: Array<{
  clientId: string
  hasNewUploads: boolean
  packageReady: boolean
  lastPrepAt: string | null
  uploadCount: number
}>): string[] {
  return clients
    .filter(c => c.uploadCount > 0 && c.hasNewUploads && !c.packageReady)
    .map(c => c.clientId)
}
