// api/cron/close-prep.ts — P2.2 storage-aware prep.
// GET / dryRun: list candidates
// POST dryRun:false : download CSVs, categorize, completeness, write workflow_runs
// Auth: Bearer CRON_SECRET. Never posts to GL.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { executePrepCandidate, scanPrepCandidates } from '../_lib/prep-scan.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization ?? ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const body = typeof req.body === 'object' && req.body ? req.body : {}
  const dryRun = req.method === 'GET' || body.dryRun !== false

  const hasService =
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL))

  if (!hasService) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      agentVersion: 'prep-agent-v1.2',
      message:
        'Service role not configured — cannot scan. Set SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL.',
      candidates: [],
      actionable: [],
      executed: [],
      humanGate: 'required',
    })
  }

  try {
    const scan = await scanPrepCandidates()
    const actionable = scan.actionable

    const executed: Array<{
      clientId: string
      clientName: string
      status: string
      message: string
      runId?: string
      txnCount?: number
      csvParsed?: number
      pdfSkipped?: number
    }> = []

    if (!dryRun) {
      const batch = actionable.slice(0, 15)
      for (const c of batch) {
        const uploads = scan.uploadsByClient.get(c.clientId) ?? []
        const reqMeta = scan.reqMetaByClient.get(c.clientId) ?? []
        const result = await executePrepCandidate(c, uploads, reqMeta)
        executed.push({
          clientId: c.clientId,
          clientName: c.clientName,
          status: result.status,
          message: result.message,
          runId: result.runId,
          txnCount: result.txnCount,
          csvParsed: result.csvParsed,
          pdfSkipped: result.pdfSkipped,
        })
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      agentVersion: 'prep-agent-v1.2',
      period: scan.period,
      signalCount: scan.signals.length,
      candidateCount: scan.candidates.length,
      actionableCount: actionable.length,
      candidates: scan.candidates.map(c => ({
        clientId: c.clientId,
        clientName: c.clientName,
        kind: c.kind,
        reason: c.reason,
        uploadCount: c.uploadCount,
        required: `${c.requiredWithUpload}/${c.requiredTotal}`,
        hasParseArtifact: c.hasParseArtifact,
        needsStatementPayload: c.needsStatementPayload,
      })),
      executed,
      humanGate: 'required',
      note:
        'CSV bank/CC files are parsed from Storage. PDFs skipped (browser Power tools). Package approve remains human. No GL post.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Close-prep scan failed'
    console.error('[close-prep]', message)
    return res.status(500).json({ ok: false, error: message })
  }
}
