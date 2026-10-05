// prep-candidates.ts — P2 deepen: pure candidate selection for close-prep cron.
// No network. No fabricated parse results.

export interface PrepUploadSignal {
  clientId: string
  bookkeeperId: string
  clientName: string
  periodYear: number
  periodMonth: number
  /** Distinct required requirement ids that have ≥1 upload */
  requiredWithUpload: number
  requiredTotal: number
  uploadCount: number
  /** True if any upload has categorization_summary or parsed_summary (real parse ran). */
  hasParseArtifact: boolean
  /** Latest upload timestamp ISO */
  latestUploadAt: string | null
  /** Latest prep agent run completed_at for this period, if any */
  lastPrepAt: string | null
}

export type PrepCandidateKind =
  | 'completeness_only' // can run completeness + package without bank parse
  | 'full_playbook' // has parse artifacts — full allowlist ok if statements available later
  | 'skip_complete' // all required docs present AND already prepped after last upload
  | 'skip_empty'

export interface PrepCandidate {
  clientId: string
  bookkeeperId: string
  clientName: string
  period: { year: number; month: number }
  kind: PrepCandidateKind
  uploadCount: number
  requiredWithUpload: number
  requiredTotal: number
  hasParseArtifact: boolean
  reason: string
  /** Allowlisted step ids safe to run without StatementSummary[] */
  stepsWithoutStatements: Array<'completeness' | 'package_draft'>
  /** Full steps only when parse artifacts exist (still need statement payload for extract/categorize) */
  needsStatementPayload: boolean
}

function packageComplete(s: PrepUploadSignal): boolean {
  return s.requiredTotal > 0 && s.requiredWithUpload >= s.requiredTotal
}

function prepIsStale(s: PrepUploadSignal): boolean {
  if (!s.lastPrepAt) return true
  if (!s.latestUploadAt) return false
  return Date.parse(s.latestUploadAt) > Date.parse(s.lastPrepAt)
}

/**
 * Build prep candidates from upload/requirement signals for one period.
 * Completeness-only steps never invent transaction data.
 */
export function buildPrepCandidates(signals: PrepUploadSignal[]): PrepCandidate[] {
  const out: PrepCandidate[] = []
  for (const s of signals) {
    if (s.uploadCount === 0) {
      out.push({
        clientId: s.clientId,
        bookkeeperId: s.bookkeeperId,
        clientName: s.clientName,
        period: { year: s.periodYear, month: s.periodMonth },
        kind: 'skip_empty',
        uploadCount: 0,
        requiredWithUpload: s.requiredWithUpload,
        requiredTotal: s.requiredTotal,
        hasParseArtifact: false,
        reason: 'No uploads this period',
        stepsWithoutStatements: [],
        needsStatementPayload: false,
      })
      continue
    }

    if (packageComplete(s) && !prepIsStale(s)) {
      out.push({
        clientId: s.clientId,
        bookkeeperId: s.bookkeeperId,
        clientName: s.clientName,
        period: { year: s.periodYear, month: s.periodMonth },
        kind: 'skip_complete',
        uploadCount: s.uploadCount,
        requiredWithUpload: s.requiredWithUpload,
        requiredTotal: s.requiredTotal,
        hasParseArtifact: s.hasParseArtifact,
        reason: 'Required docs complete and prep already ran after last upload',
        stepsWithoutStatements: [],
        needsStatementPayload: false,
      })
      continue
    }

    if (s.hasParseArtifact) {
      out.push({
        clientId: s.clientId,
        bookkeeperId: s.bookkeeperId,
        clientName: s.clientName,
        period: { year: s.periodYear, month: s.periodMonth },
        kind: 'full_playbook',
        uploadCount: s.uploadCount,
        requiredWithUpload: s.requiredWithUpload,
        requiredTotal: s.requiredTotal,
        hasParseArtifact: true,
        reason:
          'Uploads have parse/categorize artifacts — full playbook when statement payload supplied; otherwise completeness-only',
        stepsWithoutStatements: ['completeness', 'package_draft'],
        needsStatementPayload: true,
      })
      continue
    }

    out.push({
      clientId: s.clientId,
      bookkeeperId: s.bookkeeperId,
      clientName: s.clientName,
      period: { year: s.periodYear, month: s.periodMonth },
      kind: 'completeness_only',
      uploadCount: s.uploadCount,
      requiredWithUpload: s.requiredWithUpload,
      requiredTotal: s.requiredTotal,
      hasParseArtifact: false,
      reason: 'Uploads present without parse artifacts — run completeness + package status only',
      stepsWithoutStatements: ['completeness', 'package_draft'],
      needsStatementPayload: false,
    })
  }
  return out
}

export function actionablePrepCandidates(candidates: PrepCandidate[]): PrepCandidate[] {
  return candidates.filter(
    c => c.kind === 'completeness_only' || c.kind === 'full_playbook',
  )
}
