// src/pages/ClientTearsheetPage.tsx
//
// V1.1 — pattern-transferred from Perplexity Computer's "company tearsheet"
// (May 2026), adapted for CPA work per V1_FEATURE_BACKLOG.md.
//
// One-page client snapshot. Becomes the default landing surface when a
// bookkeeper opens a client (in V1.2 — for V1.1 this is reachable at
// /clients/:clientId/tearsheet via direct nav from the Detail page).
//
// Honest data only. Every number traces to a source:
//   • Current-period stats: counted live from document_uploads / requirements
//   • 12-month sparkline: LOCKED until close_cycle_outcomes has 12+ rows for
//     this client (per ai-first-principles.md §3 Trust Ladder Loop 12+)
//   • Open items: pulled from real DB queries, not estimated
//
// No fabricated metrics. No "industry benchmark" claims (would require k=N
// cross-firm aggregation which we don't have yet — see data-flywheel.md §G).

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, FileText, CheckCircle, AlertTriangle, Clock,
  TrendingUp, Building, Mail, Calendar, Lock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/mode'
import {
  getDemoClient,
  getDemoRequirementsWithUploads,
  getDemoReminderLogs,
} from '@/lib/demo-data'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { StatusBadge } from '@/components/practitioner/StatusBadge'
import { Provenance } from '@/components/shared/Provenance'
import { computeSubmissionStatus, getMissingDocuments } from '@/types'
import type { Client, RequirementWithUploads, ReminderLog } from '@/types'
import { formatPeriod, getCurrentPeriod } from '@/lib/utils'
import type { ProvenanceData } from '@/types/provenance'

/** Per Trust Ladder: trends need Loop 12+ before "honest aggregate" copy. */
const TREND_UNLOCK_THRESHOLD = 12

interface CloseCycleOutcome {
  period_year: number
  period_month: number
  hours_saved_minutes: number | null
  accuracy_pct: number | null
  reconciliation_match_pct: number | null
  total_categorized: number | null
  total_corrected: number | null
}

export function ClientTearsheetPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const [client, setClient] = useState<Client | null>(null)
  const [requirements, setRequirements] = useState<RequirementWithUploads[]>([])
  const [recentReminders, setRecentReminders] = useState<ReminderLog[]>([])
  const [outcomes, setOutcomes] = useState<CloseCycleOutcome[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const period = getCurrentPeriod()

  useEffect(() => {
    if (!clientId) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)

        if (isDemoMode) {
          const c = getDemoClient(clientId!)
          if (!c) throw new Error('Client not found')
          if (cancelled) return
          setClient(c)
          setRequirements(getDemoRequirementsWithUploads(clientId!))
          setRecentReminders(getDemoReminderLogs(clientId!).slice(0, 5))
          // Demo mode has no close_cycle_outcomes yet — leave empty, sparkline stays LOCKED
          setOutcomes([])
        } else {
          // Cloud mode — parallel fetches
          const [clientRes, reqsRes, remindersRes, outcomesRes] = await Promise.all([
            supabase.from('clients').select('*').eq('id', clientId!).maybeSingle(),
            supabase
              .from('document_requirements')
              .select('*, uploads:document_uploads(*)')
              .eq('client_id', clientId!),
            supabase
              .from('reminder_log')
              .select('*')
              .eq('client_id', clientId!)
              .order('sent_at', { ascending: false })
              .limit(5),
            supabase
              .from('close_cycle_outcomes')
              .select('period_year,period_month,hours_saved_minutes,accuracy_pct,reconciliation_match_pct,total_categorized,total_corrected')
              .eq('client_id', clientId!)
              .order('period_year', { ascending: false })
              .order('period_month', { ascending: false })
              .limit(24),
          ])

          if (clientRes.error) throw new Error(clientRes.error.message)
          if (!clientRes.data) throw new Error('Client not found')
          if (cancelled) return

          setClient(clientRes.data as Client)
          setRequirements((reqsRes.data ?? []) as RequirementWithUploads[])
          setRecentReminders((remindersRes.data ?? []) as ReminderLog[])
          setOutcomes((outcomesRes.data ?? []) as CloseCycleOutcome[])
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tearsheet')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [clientId])

  if (loading) return <div className="flex h-64 items-center justify-center"><LoadingSpinner size="lg" /></div>
  if (error || !client) return <ErrorState message={error ?? 'Client not found'} />

  // ── Derived state ──────────────────────────────────────────────────────────
  const status = computeSubmissionStatus(requirements)
  const missing = getMissingDocuments(requirements)
  const totalDocs = requirements.length
  const submittedDocs = requirements.filter(r => r.uploads.length > 0).length
  const percentComplete = totalDocs > 0 ? Math.round((submittedDocs / totalDocs) * 100) : 0

  const cyclesCompleted = outcomes.length
  const sparklineUnlocked = cyclesCompleted >= TREND_UNLOCK_THRESHOLD

  // Aggregate from close_cycle_outcomes (no fabrication — if no data, render LOCKED)
  const lifetimeHoursSaved = outcomes.reduce((s, o) => s + (o.hours_saved_minutes ?? 0), 0) / 60
  const avgAccuracy = outcomes.length > 0
    ? outcomes.reduce((s, o) => s + (o.accuracy_pct ?? 0), 0) / outcomes.length
    : null

  // ── Provenance metadata for the tearsheet stats ────────────────────────────
  const submissionProvenance: ProvenanceData = {
    type: 'computed',
    summary: `${submittedDocs} of ${totalDocs} required documents received`,
    detail: missing.length > 0
      ? `Missing: ${missing.join(', ')}`
      : 'All required documents present.',
    citations: [{ label: `Live count from document_uploads + document_requirements for client ${client.id}` }],
  }

  const trendProvenance: ProvenanceData = sparklineUnlocked
    ? {
        type: 'aggregate',
        summary: `Average across ${cyclesCompleted} close cycles`,
        detail: 'Computed from close_cycle_outcomes rows for this client.',
        sampleSize: { observed: cyclesCompleted, threshold: TREND_UNLOCK_THRESHOLD },
        citations: [{ label: `${cyclesCompleted} cycles in close_cycle_outcomes` }],
      }
    : {
        type: 'aggregate',
        summary: 'Per-client trend data',
        detail: `Locked until 12 close cycles for this client. Currently: ${cyclesCompleted}.`,
        sampleSize: { observed: cyclesCompleted, threshold: TREND_UNLOCK_THRESHOLD },
      }

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      {/* Back nav */}
      <Link
        to={`/clients/${client.id}`}
        className="mb-4 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to client detail
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{client.business_name}</h1>
            <StatusBadge status={status} />
          </div>
          <p className="mt-1 text-sm text-gray-600">
            {client.contact_name && <span>{client.contact_name} · </span>}
            <a href={`mailto:${client.contact_email}`} className="hover:underline">{client.contact_email}</a>
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Tearsheet for {formatPeriod(period.year, period.month)}
          </p>
        </div>
      </div>

      {/* ── Current period status ──────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Calendar className="h-4 w-4 text-gray-500" />
          Current period · {formatPeriod(period.year, period.month)}
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold text-gray-900">
                {submittedDocs} / {totalDocs}
              </p>
              <span className="text-xs text-gray-500">documents submitted</span>
              <Provenance data={submissionProvenance} variant="icon-only" />
            </div>
            <p className="text-2xl font-bold text-primary">{percentComplete}%</p>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${percentComplete}%` }}
              role="progressbar"
              aria-valuenow={percentComplete}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {missing.length > 0 && (
            <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline-block h-3 w-3" />
              Missing: <strong>{missing.join(', ')}</strong>
            </div>
          )}
        </div>
      </section>

      {/* ── 12-month trend (LOCKED unless 12+ cycles) ─────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <TrendingUp className="h-4 w-4 text-gray-500" />
          12-month trend
          <Provenance data={trendProvenance} variant="icon-only" />
        </h2>
        {sparklineUnlocked ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Total hours saved"
              value={`${lifetimeHoursSaved.toFixed(1)} h`}
              hint={`across ${cyclesCompleted} cycles`}
            />
            <StatCard
              label="Avg AI accuracy"
              value={avgAccuracy !== null ? `${avgAccuracy.toFixed(1)}%` : '—'}
              hint="per close_cycle_outcomes"
            />
            <StatCard
              label="Cycles completed"
              value={`${cyclesCompleted}`}
              hint="closed periods"
            />
            <StatCard
              label="Reminders this year"
              value={`${recentReminders.length}`}
              hint="from reminder_log"
            />
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center">
            <Lock className="mx-auto mb-2 h-6 w-6 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">
              12-month trend unlocks after 12 closed cycles
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Completed so far for this client: <strong>{cyclesCompleted}</strong> of {TREND_UNLOCK_THRESHOLD}.
              We never extrapolate from partial data — trends ship when there's enough signal to be honest.
            </p>
          </div>
        )}
      </section>

      {/* ── Documents grid ────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <FileText className="h-4 w-4 text-gray-500" />
          Document requirements
        </h2>
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Document</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 text-center font-medium">Required</th>
                <th className="px-4 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {requirements.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-gray-400">No requirements configured.</td></tr>
              ) : requirements.map(req => (
                <tr key={req.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5">{req.label}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{req.doc_type}</td>
                  <td className="px-4 py-2.5 text-center text-xs">
                    {req.required ? <CheckCircle className="mx-auto h-3.5 w-3.5 text-emerald-600" /> : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {req.uploads.length > 0 ? (
                      <span className="text-xs font-medium text-emerald-700">
                        <CheckCircle className="mr-1 inline-block h-3 w-3" />
                        Received
                      </span>
                    ) : (
                      <span className="text-xs text-amber-600">
                        <Clock className="mr-1 inline-block h-3 w-3" />
                        Pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Mail className="h-4 w-4 text-gray-500" />
          Recent reminders
        </h2>
        {recentReminders.length === 0 ? (
          <p className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
            No reminders sent yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentReminders.map(r => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span>
                  Reminder #{r.reminder_number} for {formatPeriod(r.period_year, r.period_month)}
                </span>
                <span className="text-gray-500">{new Date(r.sent_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Contact + meta ────────────────────────────────────────────────── */}
      <section className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <p><Building className="mr-1 inline-block h-3 w-3" /> Added {new Date(client.created_at).toLocaleDateString()}</p>
        <p className="mt-1">Portal token: <code className="text-[10px]">{client.portal_token}</code></p>
      </section>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-900">{value}</p>
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  )
}
