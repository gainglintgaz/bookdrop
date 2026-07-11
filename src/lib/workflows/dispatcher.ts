// src/lib/workflows/dispatcher.ts
//
// Maps a workflow id to its executor. Only `live` workflows have an entry.
// The panel calls runWorkflow(id, ctx); if there's no executor (planned /
// preview), it returns a friendly "not wired yet" result instead of crashing.

import type { WorkflowContext, WorkflowResult } from './executor-types'
import { runClientMeetingQA } from './executors/client-meeting-qa'

type Executor = (ctx: WorkflowContext) => WorkflowResult

/** Registry of live executors. Add an entry here when a workflow goes live. */
const EXECUTORS: Record<string, Executor> = {
  'client-meeting-qa': runClientMeetingQA,
}

/** True if this workflow has a wired executor (i.e. is actually runnable). */
export function hasExecutor(workflowId: string): boolean {
  return workflowId in EXECUTORS
}

/** Run a workflow by id. Returns a friendly result if no executor exists. */
export function runWorkflow(workflowId: string, ctx: WorkflowContext): WorkflowResult {
  const exec = EXECUTORS[workflowId]
  if (!exec) {
    return {
      workflowId,
      ok: false,
      summary: 'This workflow is still being built — not yet runnable.',
      error: 'no-executor',
    }
  }
  return exec(ctx)
}
