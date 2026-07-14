// api/_lib/prep-scan.ts — server-side close-prep candidate scan + execute.
// Storage CSV parse → extract/categorize/audit when possible.
// Completeness always runs. Never invents PDF bank lines. Human package gate remains.

import { supabaseAdmin } from './supabase.js'
import {
  buildPrepCandidates,
  actionablePrepCandidates,
  type PrepUploadSignal,
  type PrepCandidate,
} from '../../src/lib/prep-candidates.js'
import {
  parseClientUploadsFromStorage,
  statementsFromStorageParses,
} from './storage-parse.js'
import { runServerExtractCategorizeAudit } from './server-playbook.js'

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

interface UploadRow {
  id: string
  client_id: string
  bookkeeper_id: string
  requirement_id: string
  uploaded_at: string
  storage_path: string
  filename_original: string
  categorization_summary: unknown
  parsed_summary: unknown
}

/**
 * Scan all active clients for current period prep candidates.
 */
export async function scanPrepCandidates(period = periodNow()): Promise<{
  signals: PrepUploadSignal[]
  candidates: PrepCandidate[]
  actionable: PrepCandidate[]
  period: { year: number; month: number }
  uploadsByClient: Map<string, UploadRow[]>
  reqMetaByClient: Map<string, Array<{ id: string; required: boolean; doc_type: string | null }>>
}> {
  const { data: clients, error: cErr } = await supabaseAdmin
    .from('clients')
    .select('id, business_name, bookkeeper_id')
    .eq('is_active', true)

  if (cErr) throw new Error(cErr.message)
  if (!clients?.length) {
    return {
      signals: [],
      candidates: [],
      actionable: [],
      period,
      uploadsByClient: new Map(),
      reqMetaByClient: new Map(),
    }
  }

  const clientIds = clients.map((c: { id: string }) => c.id)

  const { data: requirements, error: rErr } = await supabaseAdmin
    .from('document_requirements')
    .select('id, client_id, required, doc_type')
    .in('client_id', clientIds)

  if (rErr) throw new Error(rErr.message)

  const { data: uploads, error: uErr } = await supabaseAdmin
    .from('document_uploads')
    .select(
      'id, client_id, bookkeeper_id, requirement_id, uploaded_at, storage_path, filename_original, categorization_summary, parsed_summary',
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
    console.warn('[prep-scan] workflow_runs read failed:', runErr.message)
  }

  const lastPrepByClient = new Map<string, string>()
  for (const run of runs ?? []) {
    const row = run as { client_id: string; completed_at: string; playbook_name: string }
    if (!lastPrepByClient.has(row.client_id) && /prep/i.test(row.playbook_name ?? '')) {
      lastPrepByClient.set(row.client_id, row.completed_at)
    }
  }

  const uploadsByClient = new Map<string, UploadRow[]>()
  for (const u of (uploads ?? []) as UploadRow[]) {
    const list = uploadsByClient.get(u.client_id) ?? []
    list.push(u)
    uploadsByClient.set(u.client_id, list)
  }

  const reqMetaByClient = new Map<
    string,
    Array<{ id: string; required: boolean; doc_type: string | null }>
  >()
  for (const r of requirements ?? []) {
    const row = r as { id: string; client_id: string; required: boolean; doc_type: string | null }
    const list = reqMetaByClient.get(row.client_id) ?? []
    list.push({ id: row.id, required: row.required, doc_type: row.doc_type })
    reqMetaByClient.set(row.client_id, list)
  }

  const signals: PrepUploadSignal[] = []

  for (const client of clients as Array<{
    id: string
    business_name: string
    bookkeeper_id: string
  }>) {
    const reqs = reqMetaByClient.get(client.id) ?? []
    const ups = uploadsByClient.get(client.id) ?? []
    const required = reqs.filter(r => r.required)
    const uploadedRequired = new Set(
      ups.filter(u => required.some(r => r.id === u.requirement_id)).map(u => u.requirement_id),
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
    uploadsByClient,
    reqMetaByClient,
  }
}

function completenessSteps(candidate: PrepCandidate): Array<{
  name: string
  status: 'complete' | 'skipped' | 'failed'
  durationMs: number
  resultSummary: string
}> {
  const ready =
    candidate.requiredTotal > 0 && candidate.requiredWithUpload >= candidate.requiredTotal
  const score =
    candidate.requiredTotal === 0
      ? 0
      : Math.round((candidate.requiredWithUpload / candidate.requiredTotal) * 100)

  return [
    {
      name: 'Completeness check',
      status: 'complete',
      durationMs: 0,
      resultSummary: `Score ${score}/100 · ready=${ready ? 'yes' : 'no'} · ${candidate.requiredWithUpload}/${candidate.requiredTotal} required`,
    },
    {
      name: 'Package draft status',
      status: 'complete',
      durationMs: 0,
      resultSummary: ready
        ? 'Package ready for review — human must approve export/download'
        : `Package incomplete — missing ${candidate.requiredTotal - candidate.requiredWithUpload} required doc type(s)`,
    },
  ]
}

/**
 * Execute prep for one candidate:
 * 1) Try storage CSV parse for bank/CC files
 * 2) If transactions → extract/categorize/audit
 * 3) Always completeness + package
 * 4) Optionally enrich upload rows with parsed_summary when CSV parse succeeded
 */
export async function executePrepCandidate(
  candidate: PrepCandidate,
  uploads: UploadRow[],
  reqMeta: Array<{ id: string; required: boolean; doc_type: string | null }>,
): Promise<{
  status: 'complete' | 'partial' | 'failed'
  message: string
  runId?: string
  txnCount: number
  csvParsed: number
  pdfSkipped: number
}> {
  const started = new Date().toISOString()
  const alerts: string[] = []
  const steps: Array<{
    name: string
    status: 'complete' | 'skipped' | 'failed'
    durationMs: number
    resultSummary: string
  }> = []

  // Bank/CC uploads preferred for statement parse
  const bankish = uploads.filter(u => {
    const req = reqMeta.find(r => r.id === u.requirement_id)
    const dt = req?.doc_type ?? ''
    return dt === 'bank' || dt === 'credit_card' || !dt
  })

  const parseRows = bankish.map(u => {
    const req = reqMeta.find(r => r.id === u.requirement_id)
    return {
      id: u.id,
      storage_path: u.storage_path,
      filename_original: u.filename_original,
      doc_type: req?.doc_type ?? null,
    }
  })

  let txnCount = 0
  let csvParsed = 0
  let pdfSkipped = 0

  if (parseRows.length > 0) {
    const parses = await parseClientUploadsFromStorage(parseRows)
    csvParsed = parses.filter(p => p.parseKind === 'csv').length
    pdfSkipped = parses.filter(p => p.parseKind === 'skipped_pdf').length
    const failed = parses.filter(p => p.parseKind === 'failed')

    steps.push({
      name: 'Storage parse (CSV)',
      status: failed.length === parseRows.length ? 'failed' : 'complete',
      durationMs: 0,
      resultSummary: `CSV ok=${csvParsed} · PDF skipped=${pdfSkipped} · failed=${failed.length}`,
    })

    if (failed.length > 0) {
      alerts.push(`${failed.length} storage download/parse failure(s)`)
    }
    if (pdfSkipped > 0) {
      alerts.push(
        `${pdfSkipped} PDF(s) not parsed server-side — bookkeeper can parse on Period Desk → Power tools`,
      )
    }

    const statements = statementsFromStorageParses(parses)
    const txns = statements.flatMap(s =>
      s.transactions.map(t => ({
        date: t.date,
        description: t.description,
        amount: Math.abs(t.amount),
        type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
        category: t.category,
      })),
    )
    txnCount = txns.length

    if (txns.length > 0) {
      const pipeline = runServerExtractCategorizeAudit({ transactions: txns })
      steps.push(...pipeline.steps)
      alerts.push(...pipeline.alerts)

      // Persist parse artifacts on successfully parsed CSV uploads (real data only)
      for (const p of parses.filter(x => x.parseKind === 'csv' && x.summary.transactions.length > 0)) {
        const total = p.summary.transactions.length
        const parsed_summary = {
          bankName: p.summary.bankName,
          accountLast4: null,
          openingBalance: p.summary.openingBalance,
          closingBalance: p.summary.closingBalance,
          totalCredits: p.summary.totalCredits,
          totalDebits: p.summary.totalDebits,
          transactionCount: total,
        }
        const categorization_summary = {
          totalCategorized: total,
          highConfidence: 0,
          mediumConfidence: total,
          lowConfidence: 0,
          byCategory: {} as Record<string, number>,
          flagsCount: 0,
        }
        for (const t of p.summary.transactions) {
          const cat = t.category ?? 'Uncategorized'
          categorization_summary.byCategory[cat] =
            (categorization_summary.byCategory[cat] ?? 0) + 1
        }

        const { error: upErr } = await supabaseAdmin
          .from('document_uploads')
          .update({
            parsed_summary,
            categorization_summary,
            auto_categorized_at: new Date().toISOString(),
            auto_categorization_confidence: 'medium',
          })
          .eq('id', p.uploadId)

        if (upErr) {
          console.warn('[prep-scan] upload enrich failed:', upErr.message)
        }
      }
    } else {
      steps.push({
        name: 'Extract & map transactions',
        status: 'skipped',
        durationMs: 0,
        resultSummary: 'No CSV transactions extracted (PDF-only or empty files)',
      })
    }
  } else {
    steps.push({
      name: 'Storage parse (CSV)',
      status: 'skipped',
      durationMs: 0,
      resultSummary: 'No bank/credit-card uploads to parse',
    })
  }

  const comp = completenessSteps(candidate)
  steps.push(...comp)
  const ready =
    candidate.requiredTotal > 0 && candidate.requiredWithUpload >= candidate.requiredTotal
  if (!ready) {
    alerts.push(
      `Package blocked — ${candidate.requiredWithUpload} of ${candidate.requiredTotal} required docs uploaded`,
    )
  }

  const failed = steps.filter(s => s.status === 'failed').length
  const status: 'complete' | 'partial' | 'failed' =
    failed === 0 ? (ready && txnCount > 0 ? 'complete' : 'partial') : failed < steps.length ? 'partial' : 'failed'

  const score =
    candidate.requiredTotal === 0
      ? 0
      : Math.round((candidate.requiredWithUpload / candidate.requiredTotal) * 100)
  const readiness = Math.min(100, score + (txnCount > 0 ? 15 : 0))

  const completed = new Date().toISOString()
  const runId = crypto.randomUUID()

  const { error } = await supabaseAdmin.from('workflow_runs').insert({
    id: runId,
    playbook_id: null,
    playbook_name: 'Close prep agent (cron storage)',
    bookkeeper_id: candidate.bookkeeperId,
    client_id: candidate.clientId,
    period_year: candidate.period.year,
    period_month: candidate.period.month,
    step_results: steps,
    status,
    started_at: started,
    completed_at: completed,
    alerts,
    engine_version: 'prep-agent-v1.2-storage',
    readiness_score: readiness,
  })

  if (error) {
    console.error('[prep-scan] workflow_runs insert failed:', error.message)
    return {
      status: 'failed',
      message: `Audit write failed: ${error.message}`,
      txnCount,
      csvParsed,
      pdfSkipped,
    }
  }

  return {
    status,
    message:
      txnCount > 0
        ? `Prep complete with ${txnCount} transactions from storage CSV · human package approve still required`
        : ready
          ? 'Completeness OK · no server CSV transactions (PDF may need browser parse) · human approve still required'
          : 'Completeness incomplete · chase remaining docs',
    runId,
    txnCount,
    csvParsed,
    pdfSkipped,
  }
}

/** @deprecated use executePrepCandidate — kept name for close-prep handler compat */
export async function executeCompletenessPrep(candidate: PrepCandidate): Promise<{
  status: 'complete' | 'partial' | 'failed'
  message: string
  runId?: string
}> {
  return executePrepCandidate(candidate, [], [])
}
