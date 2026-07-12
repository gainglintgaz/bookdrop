// api/cron/close-prep.ts — P2 deepen: real candidate scan + optional execute.
// Auth: Bearer CRON_SECRET
// GET or POST { dryRun: true }  → list candidates only
// POST { dryRun: false }        → run completeness-only prep + write workflow_runs
// Never invents bank parses or posts to GL. humanGate always required.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { executeCompletenessPrep, scanPrepCandidates } from '../_lib/prep-scan.js'

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
  // GET always dry-run; POST defaults dryRun true unless explicitly false
  const dryRun = req.method === 'GET' || body.dryRun !== false

  const hasService =
    !!(process.env.SUPABASE_SERVICE_ROLE_KEY &&
      (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL))

  if (!hasService) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      agentVersion: 'prep-agent-v1.1',
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
    }> = []

    if (!dryRun) {
      // Cap batch size to avoid timeout
      const batch = actionable.slice(0, 25)
      for (const c of batch) {
        // Always run completeness-only on server (honest without PDF parse).
        // full_playbook still needs browser/statement payload for extract/categorize.
        const result = await executeCompletenessPrep(c)
        executed.push({
          clientId: c.clientId,
          clientName: c.clientName,
          status: result.status,
          message:
            c.kind === 'full_playbook'
              ? `${result.message} (parse artifacts present — full playbook still needs statement payload in browser or future storage-parse job)`
              : result.message,
          runId: result.runId,
        })
      }
    }

    return res.status(200).json({
      ok: true,
      dryRun,
      agentVersion: 'prep-agent-v1.1',
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
        'Package approve remains human. Completeness-only steps never invent transactions. Full categorize/recon requires statement payload.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Close-prep scan failed'
    console.error('[close-prep]', message)
    return res.status(500).json({ ok: false, error: message })
  }
}
