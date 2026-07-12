// api/_lib/prep-scan.ts — server-side close-prep candidate scan + audit write.
// Uses service-role Supabase. Never invents bank statement parses.

import { supabaseAdmin } from './supabase.js'
import {
  buildPrepCandidates,
  actionablePrepCandidates,
  type PrepUploadSignal,
  type PrepCandidate,
} from '../../src/lib/prep-candidates'

export interface PrepScanResult {
  period: { year: number; month: number }
  signals: number
  candidates: PrepCandidate[]
  actionable: PrepCandidate[]
  executed: Array<{
    clientId: string
    status: 'complete' | 'partial' | 'failed' | 'skipped'
    message: string
    runId?: string
  }>
}

function periodNow(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/**
 * Scan all active clients for current period prep candidates.
 */
export async function scanPrepCandidates(period = periodNow()): Promise<{
  signals: PrepUploadSignal[]
  candidates: PrepCandidate[]
  actionable: PrepCandidate[]
  period: { year: number; month: number }
}> {
  const { data: clients, error: cErr } = await supabaseAdmin
    .from('clients')
    .select('id, business_name, bookkeeper_id')
    .eq('is_active', true)

  if (cErr) throw new Error(cErr.message)
  if (!clients?.length) {
    return { signals: [], candidates: [], actionable: [], period }
  }

  const clientIds = clients.map((c: { id: string }) => c.id)

  const { data: requirements, error: rErr } = await supabaseAdmin
    .from('document_requirements')
    .select('id, client_id, required')
    .in('client_id', clientIds)

  if (rErr) throw new Error(rErr.message)

  const { data: uploads, error: uErr } = await supabaseAdmin
    .from('document_uploads')
    .select(
      'client_id, bookkeeper_id, requirement_id, uploaded_at, categorization_summary, parsed_summary',
    )
    .in('client_id', clientIds)
    .eq('period_year', period.year)
    .eq('period_month', period.month)

  if (uErr) throw new Error(uErr.message)

  const { data: runs, error: runErr } = await supabaseAdmin
    .from('workflow_runs')
    .select('client_id, completed_at, playbook_name')
    .in('client_id', clientIds)
    .eq('period_year', period.year)
    .eq('period_month', period.month)
    .order('completed_at', { ascending: false })

  if (runErr) {
    // Table may not exist on older envs — continue without lastPrepAt
    console.warn('[prep-scan] workflow_runs read failed:', runErr.message)
  }

  const lastPrepByClient = new Map<string, string>()
  for (const run of runs ?? []) {
    const row = run as { client_id: string; completed_at: string; playbook_name: string }
    if (!lastPrepByClient.has(row.client_id) && /prep/i.test(row.playbook_name ?? '')) {
      lastPrepByClient.set(row.client_id, row.completed_at)
    }
  }

  const signals: PrepUploadSignal[] = []

  for (const client of clients as Array<{
    id: string
    business_name: string
    bookkeeper_id: string
  }>) {
    const reqs = (requirements ?? []).filter(
      (r: { client_id: string }) => r.client_id === client.id,
    ) as Array<{ id: string; required: boolean }>
    const ups = (uploads ?? []).filter(
      (u: { client_id: string }) => u.client_id === client.id,
    ) as Array<{
      requirement_id: string
      uploaded_at: string
      categorization_summary: unknown
      parsed_summary: unknown
    }>

    const required = reqs.filter(r => r.required)
    const uploadedRequired = new Set(
      ups
        .filter(u => required.some(r => r.id === u.requirement_id))
        .map(u => u.requirement_id),
    )

    let latestUploadAt: string | null = null
    let hasParseArtifact = false
    for (const u of ups) {
      if (!latestUploadAt || u.uploaded_at > latestUploadAt) latestUploadAt = u.uploaded_at
      if (u.categorization_summary != null || u.parsed_summary != null) {
        hasParseArtifact = true
      }
    }

    signals.push({
      clientId: client.id,
      bookkeeperId: client.bookkeeper_id,
      clientName: client.business_name,
      periodYear: period.year,
      periodMonth: period.month,
      requiredWithUpload: uploadedRequired.size,
      requiredTotal: required.length,
      uploadCount: ups.length,
      hasParseArtifact,
      latestUploadAt,
      lastPrepAt: lastPrepByClient.get(client.id) ?? null,
    })
  }

  const candidates = buildPrepCandidates(signals)
  return {
    signals,
    candidates,
    actionable: actionablePrepCandidates(candidates),
    period,
  }
}

/**
 * Execute completeness-only prep for one candidate and write workflow_runs audit.
 * Does NOT claim bank categorize/recon without statement payload.
 */
export async function executeCompletenessPrep(candidate: PrepCandidate): Promise<{
  status: 'complete' | 'partial' | 'failed'
  message: string
  runId?: string
}> {
  const ready =
    candidate.requiredTotal > 0 &&
    candidate.requiredWithUpload >= candidate.requiredTotal
  const score =
    candidate.requiredTotal === 0
      ? 0
      : Math.round((candidate.requiredWithUpload / candidate.requiredTotal) * 100)

  const started = new Date().toISOString()
  const steps = [
    {
      name: 'Completeness check',
      status: 'complete' as const,
      durationMs: 0,
      resultSummary: `Score ${score}/100 · ready=${ready ? 'yes' : 'no'} · ${candidate.requiredWithUpload}/${candidate.requiredTotal} required`,
    },
    {
      name: 'Package draft status',
      status: 'complete' as const,
      durationMs: 0,
      resultSummary: ready
        ? 'Package ready for review — human must approve export/download'
        : `Package incomplete — missing ${candidate.requiredTotal - candidate.requiredWithUpload} required doc type(s)`,
    },
  ]

  const alerts: string[] = []
  if (!ready) {
    alerts.push(
      `Package blocked — ${candidate.requiredWithUpload} of ${candidate.requiredTotal} required docs uploaded`,
    )
  }

  const completed = new Date().toISOString()
  const runId = crypto.randomUUID()

  const { error } = await supabaseAdmin.from('workflow_runs').insert({
    id: runId,
    playbook_id: null,
    playbook_name: 'Close prep agent (cron completeness)',
    bookkeeper_id: candidate.bookkeeperId,
    client_id: candidate.clientId,
    period_year: candidate.period.year,
    period_month: candidate.period.month,
    step_results: steps,
    status: ready ? 'complete' : 'partial',
    started_at: started,
    completed_at: completed,
    alerts,
    engine_version: 'prep-agent-v1.1-cron',
    readiness_score: score,
  })

  if (error) {
    console.error('[prep-scan] workflow_runs insert failed:', error.message)
    return {
      status: 'failed',
      message: `Audit write failed: ${error.message}`,
    }
  }

  return {
    status: ready ? 'complete' : 'partial',
    message: ready
      ? 'Completeness gate passed — human package approve still required'
      : 'Completeness recorded as incomplete — chase remaining docs',
    runId,
  }
}
