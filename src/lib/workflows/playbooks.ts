// playbooks.ts — Phase 4 playbook CRUD.
// Demo: localStorage. Cloud: workflow_playbooks table (migration 011).
// Soft-delete only — runs stay for audit.

import { supabase } from '../supabase'
import { isDemoMode } from '../mode'
import {
  DEFAULT_MONTH_END_STEP_IDS,
  validatePlaybookSteps,
  type PlaybookStepId,
} from './playbook-steps'

const DEMO_PLAYBOOKS_KEY = 'bookdrop:demo:workflow_playbooks'
const DEMO_RUNS_KEY = 'bookdrop:demo:workflow_runs'
export const PLAYBOOK_ENGINE_VERSION = 'playbook-v1'

/** In-memory fallback when localStorage is unavailable (Vitest / SSR). */
let memoryPlaybooks: WorkflowPlaybook[] = []
let memoryRuns: WorkflowRun[] = []

export interface WorkflowPlaybook {
  id: string
  bookkeeper_id: string
  name: string
  description: string
  step_ids: PlaybookStepId[]
  is_default: boolean
  /** System seed — soft-delete allowed but UI discourages hard wipe of last default. */
  is_system: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface WorkflowRun {
  id: string
  playbook_id: string
  playbook_name: string
  bookkeeper_id: string
  client_id: string
  period_year: number
  period_month: number
  step_results: Array<{
    name: string
    status: 'complete' | 'skipped' | 'failed'
    durationMs: number
    resultSummary: string
  }>
  status: 'complete' | 'partial' | 'failed'
  started_at: string
  completed_at: string
  alerts: string[]
  engine_version: string
  readiness_score: number | null
}

function nowIso(): string {
  return new Date().toISOString()
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null
  } catch {
    return false
  }
}

function readDemoPlaybooks(): WorkflowPlaybook[] {
  if (!hasLocalStorage()) return [...memoryPlaybooks]
  try {
    const raw = localStorage.getItem(DEMO_PLAYBOOKS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowPlaybook[]
  } catch {
    return [...memoryPlaybooks]
  }
}

function writeDemoPlaybooks(rows: WorkflowPlaybook[]): void {
  memoryPlaybooks = rows
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(DEMO_PLAYBOOKS_KEY, JSON.stringify(rows))
  } catch {
    /* ignore quota / private mode */
  }
}

function readDemoRuns(): WorkflowRun[] {
  if (!hasLocalStorage()) return [...memoryRuns]
  try {
    const raw = localStorage.getItem(DEMO_RUNS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as WorkflowRun[]
  } catch {
    return [...memoryRuns]
  }
}

function writeDemoRuns(rows: WorkflowRun[]): void {
  memoryRuns = rows
  if (!hasLocalStorage()) return
  try {
    localStorage.setItem(DEMO_RUNS_KEY, JSON.stringify(rows))
  } catch {
    /* ignore */
  }
}

/** Seed default system playbook if none exist for this bookkeeper. */
export function ensureDefaultPlaybook(bookkeeperId: string): WorkflowPlaybook {
  const existing = listPlaybooksSync(bookkeeperId)
  const active = existing.filter(p => !p.deleted_at)
  if (active.length > 0) {
    const def = active.find(p => p.is_default) ?? active[0]
    return def
  }

  const ts = nowIso()
  const seed: WorkflowPlaybook = {
    id: crypto.randomUUID(),
    bookkeeper_id: bookkeeperId,
    name: 'Month-end close — service',
    description:
      'Default composition: extract → categorize → audit → recon → completeness → package. Same engines as the live library workflow.',
    step_ids: [...DEFAULT_MONTH_END_STEP_IDS],
    is_default: true,
    is_system: true,
    deleted_at: null,
    created_at: ts,
    updated_at: ts,
  }

  if (isDemoMode || bookkeeperId.startsWith('demo-')) {
    writeDemoPlaybooks([...readDemoPlaybooks(), seed])
  }
  // Cloud: listPlaybooks inserts this seed via Supabase; return object only.
  return seed
}

/** Sync list for demo / tests. Cloud consumers should use listPlaybooks. */
export function listPlaybooksSync(bookkeeperId: string): WorkflowPlaybook[] {
  return readDemoPlaybooks()
    .filter(p => p.bookkeeper_id === bookkeeperId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function listPlaybooks(bookkeeperId: string): Promise<WorkflowPlaybook[]> {
  if (isDemoMode || bookkeeperId.startsWith('demo-')) {
    ensureDefaultPlaybook(bookkeeperId)
    return listPlaybooksSync(bookkeeperId).filter(p => !p.deleted_at)
  }

  const { data, error } = await supabase
    .from('workflow_playbooks')
    .select('*')
    .eq('bookkeeper_id', bookkeeperId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[playbooks] list failed:', error)
    // Fallback to local seed so UI is not empty when table missing
    ensureDefaultPlaybook(bookkeeperId)
    return listPlaybooksSync(bookkeeperId).filter(p => !p.deleted_at)
  }

  const rows = (data ?? []) as WorkflowPlaybook[]
  if (rows.length === 0) {
    const seed = ensureDefaultPlaybook(bookkeeperId)
    const { error: insertErr } = await supabase.from('workflow_playbooks').insert({
      id: seed.id,
      bookkeeper_id: seed.bookkeeper_id,
      name: seed.name,
      description: seed.description,
      step_ids: seed.step_ids,
      is_default: seed.is_default,
      is_system: seed.is_system,
      deleted_at: null,
      created_at: seed.created_at,
      updated_at: seed.updated_at,
    })
    if (insertErr) {
      console.error('[playbooks] seed insert failed:', insertErr)
      return [seed]
    }
    return [seed]
  }

  return rows.map(normalizePlaybookRow)
}

function normalizePlaybookRow(row: WorkflowPlaybook): WorkflowPlaybook {
  const validated = validatePlaybookSteps(row.step_ids as string[])
  return {
    ...row,
    step_ids: validated.ok ? validated.steps : [...DEFAULT_MONTH_END_STEP_IDS],
  }
}

export async function createPlaybook(params: {
  bookkeeperId: string
  name: string
  description?: string
  stepIds: string[]
  isDefault?: boolean
}): Promise<{ ok: true; playbook: WorkflowPlaybook } | { ok: false; error: string }> {
  const validated = validatePlaybookSteps(params.stepIds)
  if (!validated.ok) return validated

  const name = params.name.trim()
  if (!name) return { ok: false, error: 'Playbook name is required.' }
  if (name.length > 80) return { ok: false, error: 'Playbook name must be 80 characters or fewer.' }

  const ts = nowIso()
  const playbook: WorkflowPlaybook = {
    id: crypto.randomUUID(),
    bookkeeper_id: params.bookkeeperId,
    name,
    description: (params.description ?? '').trim().slice(0, 400),
    step_ids: validated.steps,
    is_default: params.isDefault === true,
    is_system: false,
    deleted_at: null,
    created_at: ts,
    updated_at: ts,
  }

  if (isDemoMode || params.bookkeeperId.startsWith('demo-')) {
    let all = readDemoPlaybooks()
    if (playbook.is_default) {
      all = all.map(p =>
        p.bookkeeper_id === params.bookkeeperId ? { ...p, is_default: false } : p,
      )
    }
    writeDemoPlaybooks([...all, playbook])
    return { ok: true, playbook }
  }

  if (playbook.is_default) {
    await supabase
      .from('workflow_playbooks')
      .update({ is_default: false, updated_at: ts })
      .eq('bookkeeper_id', params.bookkeeperId)
      .is('deleted_at', null)
  }

  const { error } = await supabase.from('workflow_playbooks').insert({
    id: playbook.id,
    bookkeeper_id: playbook.bookkeeper_id,
    name: playbook.name,
    description: playbook.description,
    step_ids: playbook.step_ids,
    is_default: playbook.is_default,
    is_system: false,
    deleted_at: null,
    created_at: playbook.created_at,
    updated_at: playbook.updated_at,
  })

  if (error) {
    console.error('[playbooks] create failed:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true, playbook }
}

export async function updatePlaybook(params: {
  bookkeeperId: string
  playbookId: string
  name?: string
  description?: string
  stepIds?: string[]
  isDefault?: boolean
}): Promise<{ ok: true; playbook: WorkflowPlaybook } | { ok: false; error: string }> {
  let stepIds: PlaybookStepId[] | undefined
  if (params.stepIds) {
    const validated = validatePlaybookSteps(params.stepIds)
    if (!validated.ok) return validated
    stepIds = validated.steps
  }

  const ts = nowIso()

  if (isDemoMode || params.bookkeeperId.startsWith('demo-')) {
    const all = readDemoPlaybooks()
    const idx = all.findIndex(
      p => p.id === params.playbookId && p.bookkeeper_id === params.bookkeeperId && !p.deleted_at,
    )
    if (idx < 0) return { ok: false, error: 'Playbook not found.' }

    let next = [...all]
    if (params.isDefault === true) {
      next = next.map(p =>
        p.bookkeeper_id === params.bookkeeperId ? { ...p, is_default: false } : p,
      )
    }
    const cur = next[idx]
    const updated: WorkflowPlaybook = {
      ...cur,
      name: params.name?.trim() ? params.name.trim().slice(0, 80) : cur.name,
      description:
        params.description !== undefined
          ? params.description.trim().slice(0, 400)
          : cur.description,
      step_ids: stepIds ?? cur.step_ids,
      is_default: params.isDefault === true ? true : params.isDefault === false ? false : cur.is_default,
      updated_at: ts,
    }
    next[idx] = updated
    writeDemoPlaybooks(next)
    return { ok: true, playbook: updated }
  }

  const patch: Record<string, unknown> = { updated_at: ts }
  if (params.name?.trim()) patch.name = params.name.trim().slice(0, 80)
  if (params.description !== undefined) patch.description = params.description.trim().slice(0, 400)
  if (stepIds) patch.step_ids = stepIds
  if (params.isDefault === true) {
    await supabase
      .from('workflow_playbooks')
      .update({ is_default: false, updated_at: ts })
      .eq('bookkeeper_id', params.bookkeeperId)
      .is('deleted_at', null)
    patch.is_default = true
  } else if (params.isDefault === false) {
    patch.is_default = false
  }

  const { data, error } = await supabase
    .from('workflow_playbooks')
    .update(patch)
    .eq('id', params.playbookId)
    .eq('bookkeeper_id', params.bookkeeperId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[playbooks] update failed:', error)
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'Playbook not found.' }
  return { ok: true, playbook: normalizePlaybookRow(data as WorkflowPlaybook) }
}

/** Soft-delete. Runs retained. */
export async function softDeletePlaybook(params: {
  bookkeeperId: string
  playbookId: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ts = nowIso()

  if (isDemoMode || params.bookkeeperId.startsWith('demo-')) {
    const all = readDemoPlaybooks()
    const idx = all.findIndex(
      p => p.id === params.playbookId && p.bookkeeper_id === params.bookkeeperId && !p.deleted_at,
    )
    if (idx < 0) return { ok: false, error: 'Playbook not found.' }
    const active = all.filter(
      p => p.bookkeeper_id === params.bookkeeperId && !p.deleted_at && p.id !== params.playbookId,
    )
    if (active.length === 0) {
      return { ok: false, error: 'Cannot delete the last playbook. Create another first.' }
    }
    const next = [...all]
    next[idx] = { ...next[idx], deleted_at: ts, is_default: false, updated_at: ts }
    if (all[idx].is_default && active[0]) {
      const promoteIdx = next.findIndex(p => p.id === active[0].id)
      if (promoteIdx >= 0) {
        next[promoteIdx] = { ...next[promoteIdx], is_default: true, updated_at: ts }
      }
    }
    writeDemoPlaybooks(next)
    return { ok: true }
  }

  const { data: remaining } = await supabase
    .from('workflow_playbooks')
    .select('id')
    .eq('bookkeeper_id', params.bookkeeperId)
    .is('deleted_at', null)
    .neq('id', params.playbookId)

  if (!remaining || remaining.length === 0) {
    return { ok: false, error: 'Cannot delete the last playbook. Create another first.' }
  }

  const { error } = await supabase
    .from('workflow_playbooks')
    .update({ deleted_at: ts, is_default: false, updated_at: ts })
    .eq('id', params.playbookId)
    .eq('bookkeeper_id', params.bookkeeperId)

  if (error) {
    console.error('[playbooks] soft-delete failed:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function recordWorkflowRun(run: WorkflowRun): Promise<void> {
  if (isDemoMode || run.bookkeeper_id.startsWith('demo-')) {
    const existing = readDemoRuns()
    // Cap demo history
    writeDemoRuns([run, ...existing].slice(0, 100))
    return
  }

  const { error } = await supabase.from('workflow_runs').insert({
    id: run.id,
    playbook_id: run.playbook_id,
    playbook_name: run.playbook_name,
    bookkeeper_id: run.bookkeeper_id,
    client_id: run.client_id,
    period_year: run.period_year,
    period_month: run.period_month,
    step_results: run.step_results,
    status: run.status,
    started_at: run.started_at,
    completed_at: run.completed_at,
    alerts: run.alerts,
    engine_version: run.engine_version,
    readiness_score: run.readiness_score,
  })

  if (error) {
    console.error('[playbooks] record run failed:', error)
  }
}

export async function listRecentRuns(params: {
  bookkeeperId: string
  clientId?: string
  limit?: number
}): Promise<WorkflowRun[]> {
  const limit = params.limit ?? 10

  if (isDemoMode || params.bookkeeperId.startsWith('demo-')) {
    return readDemoRuns()
      .filter(r => r.bookkeeper_id === params.bookkeeperId)
      .filter(r => !params.clientId || r.client_id === params.clientId)
      .slice(0, limit)
  }

  let q = supabase
    .from('workflow_runs')
    .select('*')
    .eq('bookkeeper_id', params.bookkeeperId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (params.clientId) q = q.eq('client_id', params.clientId)

  const { data, error } = await q
  if (error) {
    console.error('[playbooks] list runs failed:', error)
    return []
  }
  return (data ?? []) as WorkflowRun[]
}

/** Test helper — clear demo stores. */
export function __resetPlaybookDemoStore(): void {
  memoryPlaybooks = []
  memoryRuns = []
  if (!hasLocalStorage()) return
  try {
    localStorage.removeItem(DEMO_PLAYBOOKS_KEY)
    localStorage.removeItem(DEMO_RUNS_KEY)
  } catch {
    /* ignore */
  }
}
