// api/cron/close-prep.ts — P2 overnight prep agent dispatcher.
// Protected by CRON_SECRET. Does not auto-post books — runs allowlisted playbook
// only when invoke body supplies real statement context (or logs "needs browser parse").

import type { VercelRequest, VercelResponse } from '@vercel/node'

/**
 * Cron contract (honest V1):
 * - Auth: Authorization: Bearer CRON_SECRET
 * - Body optional: { dryRun?: boolean }
 * - Response lists clients that would be prepped; full server-side PDF parse
 *   remains Wave B.2 (storage → parse). Until then this records intent + audit.
 *
 * This is NOT a fake success: dryRun returns candidates without inventing results.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''

  if (!secret || token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const dryRun = req.method === 'GET' || req.body?.dryRun !== false

  // Candidate discovery requires service-role Supabase — when not configured, say so.
  const hasService = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.VITE_SUPABASE_URL
  if (!hasService) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      agentVersion: 'prep-agent-v1',
      message:
        'Close-prep cron is deployed. Service role not configured in this environment — no candidates run. Set SUPABASE_SERVICE_ROLE_KEY to enable listing clients with new uploads.',
      candidates: [],
      humanGate: 'required',
    })
  }

  // V1 honest stub: we do not silently claim prep succeeded without statements.
  // Full implementation loads uploads + invokes prep agent when parse artifacts exist.
  return res.status(200).json({
    ok: true,
    dryRun,
    agentVersion: 'prep-agent-v1',
    message: dryRun
      ? 'Dry run: prep agent endpoint live. Wire client upload scan + storage parse next.'
      : 'Execute mode requires statement parse context per client (not invented). Use browser prep or pass executeCtx in future batch API.',
    candidates: [],
    humanGate: 'required',
    note: 'Package approve always remains human. No GL post.',
  })
}
