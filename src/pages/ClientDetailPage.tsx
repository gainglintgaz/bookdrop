import { useEffect, useState, useCallback, lazy, Suspense } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { isDemoMode } from '@/lib/mode'
import { getDemoClient, getDemoRequirementsWithUploads, getDemoReminderLogs } from '@/lib/demo-data'
import { fetchRequirementsWithUploads } from '@/lib/db'
import { cn, formatPeriod, formatFileSize, getCurrentPeriod, formatDocType } from '@/lib/utils'
import { computeSubmissionStatus, getMissingDocuments } from '@/types'
import type { Client, RequirementWithUploads, ReminderLog } from '@/types'
import { StatusBadge } from '@/components/practitioner/StatusBadge'
import { MonthSelector } from '@/components/practitioner/MonthSelector'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { downloadUploadsAsZip } from '@/lib/download-zip'
import { sendManualReminder } from '@/lib/send-reminder'
import { useAuthStore } from '@/stores/auth.store'
import { tenantConfig } from '@/lib/tenant.config'
import { generateUploadDeadlineICS, getNextDeadline } from '@/lib/calendar'
import { exportMonthCSV, copyTeamsSummary } from '@/lib/export-csv'
import { runCompletenessChecks } from '@/lib/completeness-check'
import { evaluatePackageDraft } from '@/lib/package-draft'
import { DOCS_WORK_TABS, docsTabHasWork, type DocsWorkTab } from '@/lib/work-queue'
import {
  buildPeriodSnapshots,
  summarizeClientCycles,
  type ClientPeriodSnapshot,
} from '@/lib/client-cycles'
import { getLearningStats } from '@/lib/category-memory'
import { fetchClientUploadHistory, fetchRequirements } from '@/lib/db'
import {
  computeStageStatuses,
  isPeriodDeskStage,
  suggestDefaultStage,
  type PeriodDeskStage,
} from '@/lib/period-desk'
import { PeriodDeskNav } from '@/components/practitioner/PeriodDeskNav'
import type { ReconciliationResult } from '@/lib/reconciliation'
import { useAccountType } from '@/hooks/useAccountType'
import type { WorkflowResult } from '@/lib/workflow-engine'
import type { MonthlyInsights } from '@/lib/insights'
import type { CategorizationReport } from '@/lib/categorization-engine'
import type { CashFlowForecast } from '@/lib/cash-flow-forecast'
import type { AuditReport } from '@/lib/duplicate-detector'
import type { TrendReport } from '@/lib/trend-analysis'
import type { PolicyReport } from '@/lib/expense-policy'

// Lazy-loaded panel components — split into separate chunks
const StatementParserPanel = lazy(() => import('@/components/practitioner/StatementParserPanel').then(m => ({ default: m.StatementParserPanel })))
const InsightsPanel = lazy(() => import('@/components/practitioner/InsightsPanel').then(m => ({ default: m.InsightsPanel })))
const CashFlowForecastPanel = lazy(() => import('@/components/practitioner/CashFlowForecastPanel').then(m => ({ default: m.CashFlowForecastPanel })))
const AuditReportPanel = lazy(() => import('@/components/practitioner/AuditReportPanel').then(m => ({ default: m.AuditReportPanel })))
const WorkflowResultPanel = lazy(() => import('@/components/practitioner/WorkflowResultPanel').then(m => ({ default: m.WorkflowResultPanel })))
const CategorizationPanel = lazy(() => import('@/components/practitioner/CategorizationPanel').then(m => ({ default: m.CategorizationPanel })))
const TrendAnalysisPanel = lazy(() => import('@/components/practitioner/TrendAnalysisPanel').then(m => ({ default: m.TrendAnalysisPanel })))
const ExpensePolicyPanel = lazy(() => import('@/components/practitioner/ExpensePolicyPanel').then(m => ({ default: m.ExpensePolicyPanel })))
const ReceiptScannerPanel = lazy(() => import('@/components/practitioner/ReceiptScannerPanel').then(m => ({ default: m.ReceiptScannerPanel })))
const ActivityTimeline = lazy(() => import('@/components/practitioner/ActivityTimeline').then(m => ({ default: m.ActivityTimeline })))
const MessagePanel = lazy(() => import('@/components/shared/MessagePanel').then(m => ({ default: m.MessagePanel })))
const WorkflowLibraryPanel = lazy(() => import('@/components/practitioner/WorkflowLibraryPanel').then(m => ({ default: m.WorkflowLibraryPanel })))
const PlaybookEditorPanel = lazy(() => import('@/components/practitioner/PlaybookEditorPanel').then(m => ({ default: m.PlaybookEditorPanel })))
const ExceptionsQueue = lazy(() => import('@/components/practitioner/ExceptionsQueue').then(m => ({ default: m.ExceptionsQueue })))
const ClientConfirmProofStrip = lazy(() => import('@/components/practitioner/ClientConfirmProofStrip').then(m => ({ default: m.ClientConfirmProofStrip })))
import { checkAndFireTrigger, TRIGGER_FIRST_ZIP, TRIGGER_FIRST_REMINDER } from '@/lib/engagement-triggers'
import { fetchEngagementLetters, uploadEngagementLetter } from '@/lib/db'
import type { EngagementLetterWithSignature } from '@/types'
import type { StatementSummary } from '@/lib/parse-bank-statement'
import {
  ArrowLeft, FileText, Download, Copy, CheckCircle, Clock, Send, Archive,
  Pencil, Loader2, Calendar, Table, MessageSquare, ShieldCheck, AlertTriangle,
  XCircle, Zap, Package, BarChart3, History, FolderDown, FileBarChart,
  Brain, TrendingUp, Search, BookOpen, GitCompare, ClipboardCheck,
  CalendarDays, Camera, FileSignature,
} from 'lucide-react'

const PORTAL_BASE = `${window.location.origin}/upload/`

function deskFromSearchParams(params: URLSearchParams): PeriodDeskStage {
  const desk = params.get('desk')
  if (isPeriodDeskStage(desk)) return desk
  // Legacy tab= deep links
  const tab = params.get('tab')
  if (tab === 'analysis') return 'power'
  if (tab === 'export') return 'package'
  if (tab === 'activity') return 'history'
  return 'collect'
}

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [client, setClient] = useState<Client | null>(null)
  const [requirements, setRequirements] = useState<RequirementWithUploads[]>([])
  const [reminderLog, setReminderLog] = useState<ReminderLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(() => {
    const y = Number(searchParams.get('year'))
    const m = Number(searchParams.get('month'))
    if (y >= 2000 && m >= 1 && m <= 12) return { year: y, month: m }
    return getCurrentPeriod()
  })
  const [copied, setCopied] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [reminderSent, setReminderSent] = useState(false)
  const [teamsCopied, setTeamsCopied] = useState(false)
  const [reconResult, setReconResult] = useState<ReconciliationResult | null>(null)
  const [parsedStatements, setParsedStatements] = useState<StatementSummary[]>([])
  const [insights, setInsights] = useState<MonthlyInsights | null>(null)
  const [categorizationReport, setCategorizationReport] = useState<CategorizationReport | null>(null)
  const [cashForecast, setCashForecast] = useState<CashFlowForecast | null>(null)
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null)
  const [trendReport, setTrendReport] = useState<TrendReport | null>(null)
  const [policyReport, setPolicyReport] = useState<PolicyReport | null>(null)
  const [deskStage, setDeskStage] = useState<PeriodDeskStage>(() => deskFromSearchParams(searchParams))
  const [openExceptionCount, setOpenExceptionCount] = useState(0)
  const [openConfirmCount, setOpenConfirmCount] = useState(0)
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null)
  const [showMessages, setShowMessages] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [engagementLetters, setEngagementLetters] = useState<EngagementLetterWithSignature[]>([])
  const [uploadingLetter, setUploadingLetter] = useState(false)
  const [letterLabel, setLetterLabel] = useState('')
  /** Phase 5.1 multi-period cycle snapshots (null = not loaded / failed). */
  const [cycleSnapshots, setCycleSnapshots] = useState<ClientPeriodSnapshot[] | null>(null)
  const [cycleHistoryError, setCycleHistoryError] = useState<string | null>(null)
  const user = useAuthStore(state => state.user)
  const bookkeeperId = useAuthStore(state => state.bookkeeper?.id ?? null)
  const plan = useAuthStore(state => state.bookkeeper?.plan ?? 'free')

  const fetchData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)
    setCycleHistoryError(null)

    try {
      if (isDemoMode) {
        const demoClient = getDemoClient(clientId)
        if (!demoClient) throw new Error('Client not found')
        setClient(demoClient)
        const reqs = getDemoRequirementsWithUploads(clientId)
        setRequirements(reqs)
        setReminderLog(getDemoReminderLogs(clientId))
        // Multi-period history for earned intelligence
        try {
          const history = await fetchClientUploadHistory(clientId)
          const snaps = buildPeriodSnapshots({
            requirements: reqs.map(r => ({ id: r.id, required: r.required })),
            uploads: history,
            endYear: period.year,
            endMonth: period.month,
          })
          setCycleSnapshots(snaps)
        } catch (histErr) {
          console.warn('[ClientDetail] cycle history failed (demo):', histErr)
          setCycleSnapshots(null)
          setCycleHistoryError('History unavailable — showing this month only')
        }
      } else {
        const { data: clientData, error: clientErr } = await supabase
          .from('clients')
          .select('*')
          .eq('id', clientId)
          .maybeSingle()

        if (clientErr) throw new Error(clientErr.message)
        if (!clientData) throw new Error('Client not found')

        setClient(clientData)

        const reqs = await fetchRequirementsWithUploads(clientId, period.year, period.month)
        setRequirements(reqs)

        const { data: reminders, error: remErr } = await supabase
          .from('reminder_log')
          .select('*')
          .eq('client_id', clientId)
          .eq('period_year', period.year)
          .eq('period_month', period.month)
          .order('sent_at', { ascending: false })

        if (remErr) throw new Error(remErr.message)
        setReminderLog(reminders ?? [])

        const letters = await fetchEngagementLetters(clientId)
        setEngagementLetters(letters)

        try {
          const [history, allReqs] = await Promise.all([
            fetchClientUploadHistory(clientId),
            fetchRequirements(clientId),
          ])
          const snaps = buildPeriodSnapshots({
            requirements: allReqs.map(r => ({ id: r.id, required: r.required })),
            uploads: history,
            endYear: period.year,
            endMonth: period.month,
          })
          setCycleSnapshots(snaps)
        } catch (histErr) {
          console.warn('[ClientDetail] cycle history failed:', histErr)
          setCycleSnapshots(null)
          setCycleHistoryError('History unavailable — showing this month only')
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load client'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [clientId, period.year, period.month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const copyPortalLink = () => {
    if (!client) return
    navigator.clipboard.writeText(`${PORTAL_BASE}${client.portal_token}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = async (storagePath: string, filename: string) => {
    const { data, error: dlErr } = await supabase.storage
      .from('documents')
      .createSignedUrl(storagePath, 3600)

    if (dlErr || !data?.signedUrl) {
      alert('Failed to generate download link')
      return
    }

    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = filename
    a.click()
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !client) {
    return (
      <div className="p-8">
        <ErrorState message={error ?? 'Client not found'} onRetry={fetchData} />
      </div>
    )
  }

  const status = computeSubmissionStatus(requirements)
  const missingDocs = getMissingDocuments(requirements)
  const requiredCount = requirements.filter(r => r.required).length
  const uploadedCount = requirements.filter(r => r.required && r.uploads.length > 0).length
  const allUploads = requirements.flatMap(r => r.uploads)
  // P3 auto-draft: when completeness passes, package is ready without visiting Analysis.
  const packageDraft = evaluatePackageDraft(
    requirements,
    period.year,
    period.month,
    parsedStatements.length > 0 ? parsedStatements : undefined,
  )

  // Phase 5.1 — multi-period cycles when history loaded; else this month only (honest fallback).
  const thisPeriodComplete =
    requiredCount > 0 && uploadedCount >= requiredCount
  const fallbackSnapshots: ClientPeriodSnapshot[] = [
    {
      year: period.year,
      month: period.month,
      requiredDocs: requiredCount,
      uploadedRequiredDocs: uploadedCount,
      complete: thisPeriodComplete,
      completionDay: null,
    },
  ]
  const cycleSummary = summarizeClientCycles(cycleSnapshots ?? fallbackSnapshots)

  const packageDraftForDesk = packageDraft
  const deskStatuses = computeStageStatuses({
    requirements,
    packageDraft: packageDraftForDesk,
    openExceptionCount,
    openConfirmCount,
    reconResult,
    hasParsedStatements: parsedStatements.length > 0,
  })

  function selectDeskStage(stage: PeriodDeskStage) {
    setDeskStage(stage)
    const next = new URLSearchParams(searchParams)
    next.set('desk', stage)
    next.set('year', String(period.year))
    next.set('month', String(period.month))
    setSearchParams(next, { replace: true })
  }

  const handleZipDownload = async () => {
    setZipping(true)
    const zipName = `${client.business_name.replace(/\s+/g, '_')}_${period.year}_${String(period.month).padStart(2, '0')}.zip`
    await downloadUploadsAsZip(allUploads, zipName)
    setZipping(false)
    checkAndFireTrigger(TRIGGER_FIRST_ZIP, () =>
      setNudge('How did that go? Was everything you needed in the ZIP?'),
    )
  }

  const handleDownloadPackage = async () => {
    const m = await import('@/lib/finance-prep')
    m.generateBookkeeperPackage({
      businessName: client.business_name,
      contactName: client.contact_name ?? '',
      year: period.year,
      month: period.month,
      requirements,
      completeness: packageDraft.completeness,
      reconciliation: reconResult ?? undefined,
      bookkeeperName: user?.email ?? undefined,
    })
  }

  const handleSendReminder = async () => {
    if (!user || sendingReminder) return
    setSendingReminder(true)
    const { success } = await sendManualReminder(client, user.id)
    setSendingReminder(false)
    if (success) {
      setReminderSent(true)
      setTimeout(() => setReminderSent(false), 3000)
      checkAndFireTrigger(TRIGGER_FIRST_REMINDER, () =>
        setNudge('Reminder sent. We\'ll log it so you can track response time.'),
      )
      fetchData()
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Back + header */}
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{client.business_name}</h2>
          <p className="text-sm text-gray-500">
            {client.contact_name && `${client.contact_name} · `}{client.contact_email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSelector year={period.year} month={period.month} onChange={setPeriod} />
        </div>
      </div>

      {/* Phase 5.1 — earned intelligence (multi-period cycles when available) */}
      {(() => {
        const learn = getLearningStats(client.id)
        const remGate = cycleSummary.reminderGate
        const pref = cycleSummary.preferredDay
        return (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-800">Earned intelligence (this client)</p>
            {cycleHistoryError && (
              <p className="mt-1 text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                {cycleHistoryError}
              </p>
            )}
            <ul className="mt-1.5 space-y-1">
              <li>
                Complete months (last 12):{' '}
                <span className="font-medium text-gray-800">{cycleSummary.loopCount}</span>
                {cycleSummary.completePeriods.length > 0 && (
                  <span className="text-gray-500">
                    {' '}
                    ·{' '}
                    {cycleSummary.completePeriods
                      .slice(0, 4)
                      .map(p => `${p.year}-${String(p.month).padStart(2, '0')}`)
                      .join(', ')}
                    {cycleSummary.completePeriods.length > 4 ? '…' : ''}
                  </span>
                )}
              </li>
              <li>
                Category memory:{' '}
                {learn.totalCorrections > 0
                  ? `${learn.totalCorrections} correction${learn.totalCorrections === 1 ? '' : 's'} for this client — applied on next portal upload`
                  : 'No corrections yet. Fix a line in Exceptions to teach the next upload.'}
              </li>
              <li>
                Reminder personalization:{' '}
                {remGate.unlocked
                  ? pref
                    ? `Unlocked. Median completion day ~${pref.day}. ${pref.dataBasis}`
                    : `Unlocked (${remGate.loopCount} complete months). Preferred day needs ≥2 completion dates with timestamps.`
                  : remGate.lockedCopy}
              </li>
              <li className="text-gray-500">
                Cross-firm benchmarks stay suppressed until 5+ firms contribute (privacy floor).
              </li>
            </ul>
          </div>
        )
      })()}

      {/* Summary bar */}
      <div className={cn(
        'mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4',
        status === 'complete' ? 'border-success/30 bg-success/5' : 'border-gray-200 bg-white',
      )}>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <span className="text-sm text-gray-600">
            {formatPeriod(period.year, period.month)} — {uploadedCount}/{requiredCount} required docs
          </span>
          {missingDocs.length > 0 && (
            <span className="hidden text-xs text-gray-400 sm:inline">
              Missing: {missingDocs.join(', ')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyPortalLink}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium',
              copied
                ? 'border-success/30 bg-success/5 text-success'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy portal link'}
          </button>
          <Link
            to={`/clients/${client.id}/tearsheet`}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            title="One-page client snapshot"
          >
            <FileBarChart className="h-3.5 w-3.5" />
            Tearsheet
          </Link>
          <Link
            to={`/clients/${client.id}/edit`}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
          {tenantConfig.features.zipDownload && (plan === 'starter' || plan === 'pro') && allUploads.length > 0 && (
            <button
              onClick={handleZipDownload}
              disabled={zipping}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
              {zipping ? 'Zipping...' : 'Download ZIP'}
            </button>
          )}
          {status !== 'complete' && (
            <button
              onClick={handleSendReminder}
              disabled={sendingReminder}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium',
                reminderSent
                  ? 'border-success/30 bg-success/5 text-success'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50',
              )}
            >
              {sendingReminder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : reminderSent ? <CheckCircle className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {reminderSent ? 'Sent!' : 'Send Reminder'}
            </button>
          )}
          <button
            onClick={() => setShowMessages(true)}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Message
          </button>
        </div>
      </div>

      {nudge && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {nudge}
        </div>
      )}

      {/* P3 — Package auto-draft when completeness gate passes */}
      {packageDraft.status === 'ready_for_review' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-start gap-2">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold text-emerald-900">Package ready for review</p>
              <p className="mt-0.5 text-xs text-emerald-800">
                Completeness score {packageDraft.completeness.score}/100 · {packageDraft.uploadCount} file
                {packageDraft.uploadCount === 1 ? '' : 's'} for {formatPeriod(period.year, period.month)}.
                Download the HTML package and/or ZIP of source documents — nothing is auto-posted to your books.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPackage}
              className="flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
            >
              <Package className="h-3.5 w-3.5" />
              Download package
            </button>
            {tenantConfig.features.zipDownload && (plan === 'starter' || plan === 'pro') && packageDraft.canDownloadZip && (
              <button
                type="button"
                onClick={handleZipDownload}
                disabled={zipping}
                className="flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
              >
                {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                {zipping ? 'Zipping...' : 'Download ZIP'}
              </button>
            )}
            <button
              type="button"
              onClick={() => selectDeskStage('package')}
              className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline"
            >
              Open package stage
            </button>
          </div>
        </div>
      )}
      {packageDraft.status === 'incomplete' && packageDraft.uploadCount > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Package not ready yet</p>
          <p className="mt-0.5 text-xs text-amber-800">{packageDraft.label}</p>
        </div>
      )}

      {/* ─── PERIOD DESK (P1) — single close-prep home ─────────────────────────── */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
        <PeriodDeskNav
          active={deskStage}
          statuses={deskStatuses}
          onSelect={selectDeskStage}
        />
      </div>

      {/* Stage content */}
      {(deskStage === 'collect' || deskStage === 'confirm' || deskStage === 'exceptions') && (
        <DocumentsTab
          requirements={requirements}
          client={client}
          onDownload={handleDownload}
          engagementLetters={engagementLetters}
          uploadingLetter={uploadingLetter}
          letterLabel={letterLabel}
          setLetterLabel={setLetterLabel}
          user={user}
          bookkeeperId={bookkeeperId ?? user?.id ?? null}
          onLetterUploaded={async () => {
            if (!clientId) return
            const updated = await fetchEngagementLetters(clientId)
            setEngagementLetters(updated)
          }}
          setUploadingLetter={setUploadingLetter}
          period={period}
          packageDraft={packageDraft}
          onDownloadPackage={handleDownloadPackage}
          forcedWorkTab={
            deskStage === 'confirm'
              ? 'confirms'
              : deskStage === 'exceptions'
                ? 'exceptions'
                : 'docs'
          }
          onExceptionCount={setOpenExceptionCount}
          onConfirmCount={setOpenConfirmCount}
        />
      )}

      {deskStage === 'recon' && (
        <Suspense fallback={<div className="py-12 text-center"><LoadingSpinner size="lg" /></div>}>
          <AnalysisTab
            requirements={requirements}
            client={client}
            bookkeeperId={bookkeeperId ?? client.bookkeeper_id ?? 'bk-demo-001'}
            period={period}
            parsedStatements={parsedStatements}
            reconResult={reconResult}
            onSetReconResult={setReconResult}
            onStatementsParsed={async (stmts) => {
              setParsedStatements(stmts)
              if (stmts.length > 0) {
                const allTxns = stmts.flatMap(s => s.transactions).map(t => ({
                  date: t.date,
                  description: t.description,
                  amount: Math.abs(t.amount),
                  type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
                  category: t.category,
                }))
                const [insightsMod, catMod, cfMod, auditMod, trendMod, policyMod] = await Promise.all([
                  import('@/lib/insights'),
                  import('@/lib/categorization-engine'),
                  import('@/lib/cash-flow-forecast'),
                  import('@/lib/duplicate-detector'),
                  import('@/lib/trend-analysis'),
                  import('@/lib/expense-policy'),
                ])
                setInsights(insightsMod.generateInsights(stmts, period.year, period.month))
                setCategorizationReport(catMod.categorizeTransactions(allTxns))
                setCashForecast(cfMod.generateCashFlowForecast(stmts, period.year, period.month))
                setAuditReport(auditMod.runAuditChecks(allTxns))
                setTrendReport(trendMod.analyzeTrends(stmts))
                setPolicyReport(policyMod.checkExpensePolicy(allTxns))
              }
            }}
            onRunReconciliation={async () => {
              const reconMod = await import('@/lib/reconciliation')
              if (parsedStatements.length > 0) {
                const result = reconMod.reconcileFromParsedStatements(parsedStatements, requirements)
                setReconResult(result ?? reconMod.getDemoReconciliation())
              } else {
                setReconResult(reconMod.getDemoReconciliation())
              }
            }}
            insights={insights}
            categorizationReport={categorizationReport}
            cashForecast={cashForecast}
            auditReport={auditReport}
            trendReport={trendReport}
            policyReport={policyReport}
            workflowResult={workflowResult}
            onSetWorkflowResult={setWorkflowResult}
            focusSection="reconcile"
          />
        </Suspense>
      )}

      {deskStage === 'package' && (
        <ExportTab
          client={client}
          requirements={requirements}
          period={period}
          reconResult={reconResult}
          parsedStatements={parsedStatements}
          insights={insights}
          bookkeeperName={user?.email ?? 'Bookkeeper'}
          packageDraft={packageDraft}
          onDownloadPackage={handleDownloadPackage}
          onDownloadZip={handleZipDownload}
          zipping={zipping}
          plan={plan}
          teamsCopied={teamsCopied}
          onTeamsCopy={() => {
            copyTeamsSummary(client.business_name, requirements, period.year, period.month)
            setTeamsCopied(true)
            setTimeout(() => setTeamsCopied(false), 2000)
          }}
        />
      )}

      {deskStage === 'history' && (
        <Suspense fallback={<div className="py-12 text-center"><LoadingSpinner size="lg" /></div>}>
          <ActivityTimeline
            requirements={requirements}
            reminderLog={reminderLog}
            clientName={client.business_name}
          />
        </Suspense>
      )}

      {deskStage === 'power' && (
        <Suspense fallback={<div className="py-12 text-center"><LoadingSpinner size="lg" /></div>}>
          <AnalysisTab
            requirements={requirements}
            client={client}
            bookkeeperId={bookkeeperId ?? client.bookkeeper_id ?? 'bk-demo-001'}
            period={period}
            parsedStatements={parsedStatements}
            reconResult={reconResult}
            onSetReconResult={setReconResult}
            onStatementsParsed={async (stmts) => {
              setParsedStatements(stmts)
              if (stmts.length > 0) {
                const allTxns = stmts.flatMap(s => s.transactions).map(t => ({
                  date: t.date,
                  description: t.description,
                  amount: Math.abs(t.amount),
                  type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
                  category: t.category,
                }))
                const [insightsMod, catMod, cfMod, auditMod, trendMod, policyMod] = await Promise.all([
                  import('@/lib/insights'),
                  import('@/lib/categorization-engine'),
                  import('@/lib/cash-flow-forecast'),
                  import('@/lib/duplicate-detector'),
                  import('@/lib/trend-analysis'),
                  import('@/lib/expense-policy'),
                ])
                setInsights(insightsMod.generateInsights(stmts, period.year, period.month))
                setCategorizationReport(catMod.categorizeTransactions(allTxns))
                setCashForecast(cfMod.generateCashFlowForecast(stmts, period.year, period.month))
                setAuditReport(auditMod.runAuditChecks(allTxns))
                setTrendReport(trendMod.analyzeTrends(stmts))
                setPolicyReport(policyMod.checkExpensePolicy(allTxns))
              }
            }}
            onRunReconciliation={async () => {
              const reconMod = await import('@/lib/reconciliation')
              if (parsedStatements.length > 0) {
                const result = reconMod.reconcileFromParsedStatements(parsedStatements, requirements)
                setReconResult(result ?? reconMod.getDemoReconciliation())
              } else {
                setReconResult(reconMod.getDemoReconciliation())
              }
            }}
            insights={insights}
            categorizationReport={categorizationReport}
            cashForecast={cashForecast}
            auditReport={auditReport}
            trendReport={trendReport}
            policyReport={policyReport}
            workflowResult={workflowResult}
            onSetWorkflowResult={setWorkflowResult}
          />
        </Suspense>
      )}

      {/* Footer info */}
      <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
        <FileText className="h-3.5 w-3.5" />
        <span>Added {new Date(client.created_at).toLocaleDateString()}</span>
        <span>·</span>
        <span>Token: {client.portal_token}</span>
      </div>

      {/* Message Panel Overlay */}
      {showMessages && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={() => setShowMessages(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 z-50 w-96 shadow-xl">
            <Suspense fallback={<div className="flex h-full items-center justify-center"><LoadingSpinner size="lg" /></div>}>
            <MessagePanel
              clientId={clientId ?? ''}
              clientName={client.business_name}
              senderType="bookkeeper"
              onClose={() => setShowMessages(false)}
            />
            </Suspense>
          </div>
        </>
      )}
    </div>
  )
}

// ─── DOCUMENTS TAB ──────────────────────────────────────────────────────────

function DocumentsTab({
  requirements,
  client,
  onDownload,
  engagementLetters,
  uploadingLetter,
  letterLabel,
  setLetterLabel,
  user,
  bookkeeperId,
  onLetterUploaded,
  setUploadingLetter,
  period,
  packageDraft,
  onDownloadPackage,
  forcedWorkTab,
  onExceptionCount,
  onConfirmCount,
}: {
  requirements: RequirementWithUploads[]
  client: Client
  onDownload: (path: string, name: string) => void
  engagementLetters: EngagementLetterWithSignature[]
  uploadingLetter: boolean
  letterLabel: string
  setLetterLabel: (v: string) => void
  user: { id: string } | null
  bookkeeperId: string | null
  onLetterUploaded: () => Promise<void>
  setUploadingLetter: (v: boolean) => void
  period: { year: number; month: number }
  packageDraft: ReturnType<typeof evaluatePackageDraft>
  onDownloadPackage: () => void
  forcedWorkTab?: DocsWorkTab
  onExceptionCount?: (n: number) => void
  onConfirmCount?: (n: number) => void
}) {
  const [workTab, setWorkTab] = useState<DocsWorkTab>(forcedWorkTab ?? 'docs')

  useEffect(() => {
    if (forcedWorkTab) setWorkTab(forcedWorkTab)
  }, [forcedWorkTab])

  if (requirements.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">No document requirements configured.</p>
  }

  // Default-path exceptions (AI-first D.1) — surface without Analysis tab.
  const categorizedUploads = requirements.flatMap(r =>
    r.uploads
      .filter(u => u.categorization_summary && u.parsed_summary)
      .map(u => ({ req: r, upload: u })),
  )
  const lowConfidenceTotal = categorizedUploads.reduce(
    (sum, { upload }) => sum + (upload.categorization_summary?.lowConfidence ?? 0),
    0,
  )
  const flagsTotal = categorizedUploads.reduce(
    (sum, { upload }) => sum + (upload.categorization_summary?.flagsCount ?? 0),
    0,
  )

  useEffect(() => {
    onExceptionCount?.(lowConfidenceTotal + flagsTotal)
  }, [lowConfidenceTotal, flagsTotal, onExceptionCount])

  useEffect(() => {
    // Confirm open count: treat any low-confidence summary lines as needing confirm progress signal
    onConfirmCount?.(lowConfidenceTotal > 0 ? lowConfidenceTotal : 0)
  }, [lowConfidenceTotal, onConfirmCount])

  const allPeriodUploads = requirements.flatMap(r => r.uploads)

  return (
    <div className="space-y-3">
      {/* Phase 3 — work sections (user switches freely) */}
      <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-3">
        {DOCS_WORK_TABS.map(t => {
          const hasWork = docsTabHasWork(t.id, requirements, period)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setWorkTab(t.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                workTab === t.id
                  ? 'border-primary bg-primary text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-primary/40',
                !hasWork && workTab !== t.id && 'opacity-60',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {(workTab === 'docs' || workTab === 'confirms' || workTab === 'exceptions') && (
      <Suspense fallback={null}>
        <ClientConfirmProofStrip
          clientId={client.id}
          bookkeeperId={bookkeeperId}
          uploads={allPeriodUploads}
        />
      </Suspense>
      )}

      {workTab === 'package' && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            packageDraft.status === 'ready_for_review'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : packageDraft.status === 'incomplete'
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-gray-200 bg-white text-gray-700',
          )}
        >
          <p className="font-semibold">
            {packageDraft.status === 'ready_for_review'
              ? 'Package ready for review'
              : packageDraft.status === 'incomplete'
                ? 'Package not ready'
                : 'No package yet'}
          </p>
          <p className="mt-0.5 text-xs opacity-90">{packageDraft.label}</p>
          <p className="mt-1 text-xs opacity-80">
            Completeness {packageDraft.completeness.score}/100 · {packageDraft.uploadCount} file
            {packageDraft.uploadCount === 1 ? '' : 's'}
          </p>
          {packageDraft.canDownloadPackage && (
            <button
              type="button"
              onClick={onDownloadPackage}
              className="mt-3 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800"
            >
              Download package HTML
            </button>
          )}
        </div>
      )}

      {(workTab === 'docs' || workTab === 'exceptions') && categorizedUploads.length > 0 && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3 text-sm',
            lowConfidenceTotal > 0 || flagsTotal > 0
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900',
          )}
        >
          <div className="flex items-start gap-2">
            {lowConfidenceTotal > 0 || flagsTotal > 0 ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <div>
              <p className="font-medium">
                {lowConfidenceTotal > 0 || flagsTotal > 0
                  ? 'Exceptions from auto-categorization'
                  : 'Uploads categorized on receipt'}
              </p>
              <p className="mt-0.5 text-xs opacity-90">
                {categorizedUploads.length} statement upload{categorizedUploads.length === 1 ? '' : 's'} processed on the default path
                {lowConfidenceTotal > 0 && ` · ${lowConfidenceTotal} low-confidence line${lowConfidenceTotal === 1 ? '' : 's'}`}
                {flagsTotal > 0 && ` · ${flagsTotal} flag${flagsTotal === 1 ? '' : 's'}`}
                . Correct lines below when needed — Analysis is optional for full detail.
              </p>
            </div>
          </div>
        </div>
      )}
      {(workTab === 'exceptions' || (workTab === 'docs' && lowConfidenceTotal > 0)) && lowConfidenceTotal > 0 && (
        <Suspense fallback={null}>
          <ExceptionsQueue
            requirements={requirements}
            clientId={client.id}
            bookkeeperId={bookkeeperId}
          />
        </Suspense>
      )}
      {workTab === 'exceptions' && lowConfidenceTotal === 0 && (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No open low-confidence exceptions for this period. Upload bank/CC statements to generate line evidence.
        </p>
      )}
      {workTab === 'docs' && requirements.map(req => {
        const hasUpload = req.uploads.length > 0
        const latest = req.uploads[req.uploads.length - 1]
        const lowConf = latest?.categorization_summary?.lowConfidence ?? 0
        return (
          <div
            key={req.id}
            className={cn(
              'flex items-center justify-between rounded-lg border bg-white p-4',
              hasUpload ? 'border-success/20' : 'border-gray-200',
            )}
          >
            <div className="flex items-center gap-3">
              {hasUpload ? (
                <CheckCircle className="h-5 w-5 text-success" />
              ) : (
                <Clock className="h-5 w-5 text-gray-300" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">{req.label}</p>
                <p className="text-xs text-gray-500">
                  {req.required ? 'Required' : 'Optional'}
                  {req.doc_type !== 'other' && ` · ${formatDocType(req.doc_type)}`}
                  {latest?.auto_categorized_at && (
                    <>
                      {' · '}
                      <span className={lowConf > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                        {lowConf > 0
                          ? `${lowConf} need review`
                          : `categorized (${latest.auto_categorization_confidence ?? 'ok'})`}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            {hasUpload && (
              <div className="flex items-center gap-2">
                {req.uploads.map(upload => (
                  <button
                    key={upload.id}
                    onClick={() => onDownload(upload.storage_path, upload.filename_original)}
                    className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="max-w-[120px] truncate">{upload.filename_original}</span>
                    <span className="text-gray-400">{formatFileSize(upload.file_size_bytes)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Private notes — docs tab only */}
      {workTab === 'docs' && client.notes_private && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Private Notes</h3>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            {client.notes_private}
          </div>
        </div>
      )}

      {/* Engagement Letters / E-Signatures — docs tab */}
      {workTab === 'docs' && (
      <div className="mt-6 border-t border-gray-200 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FileSignature className="h-4 w-4 text-gray-400" />
            Engagement Letters
          </h3>
        </div>

        {engagementLetters.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
            <p className="text-sm text-gray-500">No engagement letters uploaded yet.</p>
            <p className="mt-0.5 text-xs text-gray-400">
              Upload a PDF and your client can sign it from their portal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {engagementLetters.map(letter => (
              <EngagementLetterCard
                key={letter.id}
                letter={letter}
                bookkeeperId={user?.id ?? ''}
              />
            ))}
          </div>
        )}

        {/* Upload new engagement letter */}
        <div className="mt-3 rounded-lg border border-dashed border-gray-200 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">
            Upload a new engagement letter (PDF)
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              aria-label="Engagement letter label"
              placeholder="Label (e.g. 2026 Engagement Letter)"
              value={letterLabel}
              onChange={e => setLetterLabel(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
            <label className={cn(
              'cursor-pointer rounded-md border border-primary px-3 py-1.5',
              'text-xs font-medium text-primary hover:bg-primary/5',
              (uploadingLetter || !letterLabel.trim()) && 'cursor-not-allowed opacity-50',
            )}>
              {uploadingLetter ? 'Uploading...' : 'Choose PDF'}
              <input
                type="file"
                accept=".pdf"
                className="sr-only"
                disabled={uploadingLetter || !letterLabel.trim()}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file || !client || !user || !letterLabel.trim()) return
                  setUploadingLetter(true)
                  try {
                    await uploadEngagementLetter(
                      file, client.id, user.id, letterLabel.trim()
                    )
                    setLetterLabel('')
                    await onLetterUploaded()
                  } catch (err) {
                    console.error('Failed to upload engagement letter:', err)
                  } finally {
                    setUploadingLetter(false)
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}

// ─── ANALYSIS TAB ───────────────────────────────────────────────────────────

type AnalysisSection = 'parse' | 'scan' | 'categorize' | 'insights' | 'forecast' | 'audit' | 'trends' | 'policy' | 'reconcile' | 'readiness' | 'meeting'

const ANALYSIS_SECTIONS: { id: AnalysisSection; label: string; icon: typeof FileText; requiresParsed?: boolean }[] = [
  { id: 'parse', label: 'Parse', icon: FileText },
  { id: 'scan', label: 'Scan', icon: Camera },
  { id: 'categorize', label: 'Categorize', icon: Brain, requiresParsed: true },
  { id: 'insights', label: 'Insights', icon: BarChart3, requiresParsed: true },
  { id: 'forecast', label: 'Forecast', icon: TrendingUp, requiresParsed: true },
  { id: 'trends', label: 'Trends', icon: GitCompare, requiresParsed: true },
  { id: 'audit', label: 'Audit', icon: Search, requiresParsed: true },
  { id: 'policy', label: 'Policy', icon: ClipboardCheck, requiresParsed: true },
  { id: 'reconcile', label: 'Reconcile', icon: Zap },
  { id: 'readiness', label: 'Readiness', icon: ShieldCheck },
  { id: 'meeting', label: 'Meeting', icon: CalendarDays, requiresParsed: true },
]

function AnalysisTab({
  requirements,
  client,
  bookkeeperId,
  period,
  parsedStatements,
  onStatementsParsed,
  reconResult,
  onSetReconResult,
  onRunReconciliation,
  insights,
  categorizationReport,
  cashForecast,
  auditReport,
  trendReport,
  policyReport,
  workflowResult,
  onSetWorkflowResult,
  focusSection,
}: {
  requirements: RequirementWithUploads[]
  client: Client
  bookkeeperId: string
  period: { year: number; month: number }
  parsedStatements: StatementSummary[]
  onStatementsParsed: (s: StatementSummary[]) => void
  reconResult: ReconciliationResult | null
  onSetReconResult: (r: ReconciliationResult | null) => void
  onRunReconciliation: () => void
  insights: MonthlyInsights | null
  categorizationReport: CategorizationReport | null
  cashForecast: CashFlowForecast | null
  auditReport: AuditReport | null
  trendReport: TrendReport | null
  policyReport: PolicyReport | null
  workflowResult: WorkflowResult | null
  onSetWorkflowResult: (r: WorkflowResult | null) => void
  focusSection?: AnalysisSection
}) {
  const [section, setSection] = useState<AnalysisSection>(focusSection ?? 'parse')
  useEffect(() => {
    if (focusSection) setSection(focusSection)
  }, [focusSection])
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [workflowRunning, setWorkflowRunning] = useState(false)
  const hasParsed = parsedStatements.length > 0

  async function runMonthEndClose() {
    setWorkflowRunning(true)
    setWorkflowError(null)
    try {
      const { executeWorkflowById } = await import('@/lib/workflows/execute')
      const outcome = executeWorkflowById('month-end-close-service', {
        clientId: client.id,
        clientName: client.business_name,
        period,
        statements: parsedStatements,
        requirements,
        reconResult,
      })
      if (!outcome.ok) {
        setWorkflowError(outcome.error)
        if (outcome.result) onSetWorkflowResult(outcome.result)
        return
      }
      onSetWorkflowResult(outcome.result)
      // Keep recon in parent when we can recompute
      if (parsedStatements.length > 0) {
        const reconMod = await import('@/lib/reconciliation')
        const recon = reconMod.reconcileFromParsedStatements(parsedStatements, requirements)
        if (recon) onSetReconResult(recon)
      }
    } catch (err) {
      setWorkflowError(err instanceof Error ? err.message : 'Workflow failed')
    } finally {
      setWorkflowRunning(false)
    }
  }

  // NOTE: per Trust Ladder gating refactor (.claude/rules/ai-first-principles.md §3),
  // the "limited data" banner is no longer rendered at this level. Each engine panel
  // (TrendAnalysisPanel, CashFlowForecastPanel) handles its own LOCKED / PREVIEW
  // state internally based on monthsObserved. See LockedFeatureGate component.

  const emptyGate = (
    <div className="rounded-lg border border-gray-200 bg-white px-6 py-10 text-center">
      <FileText className="mx-auto mb-3 h-8 w-8 text-gray-300" />
      <p className="text-sm font-medium text-gray-700">
        No statements uploaded for {formatPeriod(period.year, period.month)}
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Upload bank statements in the Documents tab to unlock analysis.
      </p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Analysis sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {ANALYSIS_SECTIONS.map(s => {
          const disabled = s.requiresParsed && !hasParsed
          return (
            <button
              key={s.id}
              onClick={() => !disabled && setSection(s.id)}
              disabled={disabled}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                section === s.id
                  ? 'bg-primary text-white shadow-sm'
                  : disabled
                    ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* G5 — Workflow library + live month-end close */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <Suspense fallback={<LoadingSpinner size="sm" />}>
          <WorkflowLibraryPanel
            category="close"
            onRunWorkflow={async (w) => {
              if (w.id === 'month-end-close-service') {
                await runMonthEndClose()
                return
              }
              setWorkflowError(`"${w.label}" is not live yet.`)
            }}
          />
        </Suspense>
        {workflowError && (
          <p className="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            {workflowError}
          </p>
        )}
        {hasParsed && (
          <button
            type="button"
            disabled={workflowRunning}
            onClick={() => void runMonthEndClose()}
            className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            {workflowRunning ? 'Running month-end close…' : 'Run month-end close (service)'}
          </button>
        )}
      </div>

      {/* Phase 4 — editable playbooks (allowlist composition) */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <Suspense fallback={<LoadingSpinner size="sm" />}>
          <PlaybookEditorPanel
            bookkeeperId={bookkeeperId}
            clientId={client.id}
            clientName={client.business_name}
            period={period}
            executeCtx={{
              clientId: client.id,
              clientName: client.business_name,
              period,
              statements: parsedStatements,
              requirements,
              reconResult,
            }}
            onResult={onSetWorkflowResult}
            onError={setWorkflowError}
          />
        </Suspense>
        <button
          type="button"
          className="mt-3 text-xs font-medium text-primary hover:underline"
          onClick={async () => {
            setWorkflowRunning(true)
            setWorkflowError(null)
            try {
              const { runPrepAgent } = await import('@/lib/prep-agent')
              const result = await runPrepAgent({
                bookkeeperId,
                clientId: client.id,
                clientName: client.business_name,
                period,
                executeCtx: {
                  clientId: client.id,
                  clientName: client.business_name,
                  period,
                  statements: parsedStatements,
                  requirements,
                  reconResult,
                },
              })
              if (!result.ok) {
                setWorkflowError(result.message)
                if (result.outcome.result) onSetWorkflowResult(result.outcome.result)
              } else if (result.outcome.ok) {
                onSetWorkflowResult(result.outcome.result)
              }
            } catch (err) {
              setWorkflowError(err instanceof Error ? err.message : 'Prep agent failed')
            } finally {
              setWorkflowRunning(false)
            }
          }}
          disabled={workflowRunning}
        >
          {workflowRunning ? 'Prep agent running…' : 'Run prep agent (allowlisted steps · human approve still required)'}
        </button>
      </div>

      {/* Workflow Result Panel — executive summary */}
      {workflowResult && (
        <WorkflowResultPanel result={workflowResult} />
      )}

      {/* Prompt to parse first */}
      {!hasParsed && section !== 'parse' && section !== 'reconcile' && section !== 'readiness' && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-6 text-center">
          <Brain className="mx-auto mb-2 h-8 w-8 text-primary/40" />
          <p className="text-sm font-medium text-gray-700">Parse statements first to unlock intelligence engines</p>
          <p className="mt-1 text-xs text-gray-500">Go to the Parse tab and upload bank/credit card statements</p>
          <button
            onClick={() => setSection('parse')}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-xs font-medium text-white hover:bg-primary-light"
          >
            Go to Parser
          </button>
        </div>
      )}

      {/* Section content */}
      {section === 'parse' && (
        <StatementParserPanel
          requirements={requirements}
          clientName={client.business_name}
          year={period.year}
          month={period.month}
          onStatementsParsed={(stmts) => {
            onStatementsParsed(stmts)
            // Auto-switch to insights after parsing
            if (stmts.length > 0) setTimeout(() => setSection('insights'), 300)
          }}
        />
      )}

      {section === 'scan' && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Receipt & Document Scanner</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Photograph paper receipts, scan faxed documents, or upload images of anything that only exists as a hard copy.
              Add amounts, dates, and vendor info manually — everything gets included in exports and reports.
            </p>
          </div>
          <ReceiptScannerPanel
            clientName={client.business_name}
            year={period.year}
            month={period.month}
          />
        </div>
      )}

      {section === 'categorize' && (!hasParsed ? emptyGate : categorizationReport && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Auto-Categorization</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Every transaction automatically categorized with IRS-aligned categories, tax deductibility flags, and vendor matching.
              Automates manual categorization work.
            </p>
          </div>
          <CategorizationPanel report={categorizationReport} clientId={client.id} />
        </div>
      ))}

      {section === 'insights' && (!hasParsed ? emptyGate : insights && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Smart Insights</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Cash flow analysis, spending patterns, top vendors, anomaly detection, and actionable advice — generated automatically.
            </p>
          </div>
          <InsightsPanel insights={insights} />
        </div>
      ))}

      {section === 'forecast' && (!hasParsed ? emptyGate : cashForecast && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Cash Flow Forecast</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              3-month forward projection based on recurring income/expenses and historical patterns.
              Predicts cash crunches before they happen.
            </p>
          </div>
          <CashFlowForecastPanel forecast={cashForecast} monthsObserved={parsedStatements.length} />
        </div>
      ))}

      {section === 'audit' && (!hasParsed ? emptyGate : auditReport && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Data Quality Audit</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Catches duplicate charges, missing recurring payments, unusual transactions, and data integrity issues.
              Prevents costly errors before they reach the books.
            </p>
          </div>
          <AuditReportPanel report={auditReport} />
        </div>
      ))}

      {section === 'reconcile' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Auto-Reconciliation</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Matches bank transactions against uploaded receipts using amount, date, and vendor signals.
              </p>
            </div>
            <button
              onClick={onRunReconciliation}
              className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10"
            >
              <Zap className="h-3.5 w-3.5" />
              {parsedStatements.length > 0 ? 'Run on Parsed Data' : 'Run Demo'}
            </button>
          </div>
          {reconResult ? (
            <ReconciliationResultsSection result={reconResult} />
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
              <Zap className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              <p>Click "Run" to match bank transactions against receipts.</p>
              <p className="mt-1 text-xs">Uses 3-signal scoring: amount, date proximity, and vendor matching.</p>
            </div>
          )}
        </div>
      )}

      {section === 'trends' && (!hasParsed ? emptyGate : trendReport && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Month-over-Month Trends</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Compares spending, income, vendors, and categories across months. Spots patterns you'd otherwise miss.
            </p>
          </div>
          <TrendAnalysisPanel report={trendReport} monthsObserved={parsedStatements.length} />
        </div>
      ))}

      {section === 'policy' && (!hasParsed ? emptyGate : policyReport && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Expense Policy Compliance</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Checks every transaction against standard business expense policies. Catches violations before auditors do.
            </p>
          </div>
          <ExpensePolicyPanel report={policyReport} businessName={client.business_name} />
        </div>
      ))}

      {section === 'readiness' && (
        <CompletenessReportSection requirements={requirements} parsedStatements={parsedStatements} />
      )}

      {section === 'meeting' && (!hasParsed ? emptyGate : insights && (
        <div>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Client Meeting Agenda</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Auto-generated professional meeting agenda with talking points, data references, and follow-up email draft.
              Replaces 30+ minutes of meeting prep.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <button
              onClick={async () => {
                const m = await import('@/lib/meeting-agenda')
                const agenda = m.generateMeetingAgenda({
                  clientName: client.business_name,
                  bookkeeperName: 'Bookkeeper',
                  year: period.year,
                  month: period.month,
                  cashFlow: insights ? {
                    totalIncome: insights.cashFlow.totalIncome,
                    totalExpenses: insights.cashFlow.totalExpenses,
                    netCashFlow: insights.cashFlow.netCashFlow,
                  } : undefined,
                  taxDeductible: undefined,
                  estimatedTaxSavings: undefined,
                  anomalies: insights?.anomalies.map(a => ({ title: a.title, detail: a.detail })),
                  recommendations: insights?.advice.map(a => a.title),
                  forecastAlerts: cashForecast?.alerts.map(a => ({ title: a.title, detail: a.detail })),
                })
                m.downloadAgendaAsHTML(agenda)
              }}
              className="flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary-light"
            >
              <CalendarDays className="h-4 w-4" />
              Generate & Download Meeting Agenda
            </button>
            <p className="mt-3 text-xs text-gray-500">
              Includes financial overview, document status, issues to address, action items, and a follow-up email template.
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── EXPORT TAB ─────────────────────────────────────────────────────────────

function ExportTab({
  client,
  requirements,
  period,
  reconResult,
  parsedStatements,
  insights,
  bookkeeperName,
  packageDraft,
  onDownloadPackage,
  onDownloadZip,
  zipping,
  plan,
  teamsCopied,
  onTeamsCopy,
}: {
  client: Client
  requirements: RequirementWithUploads[]
  period: { year: number; month: number }
  reconResult: ReconciliationResult | null
  parsedStatements: StatementSummary[]
  insights: MonthlyInsights | null
  bookkeeperName: string
  packageDraft: ReturnType<typeof evaluatePackageDraft>
  onDownloadPackage: () => void
  onDownloadZip: () => void
  zipping: boolean
  plan: string
  teamsCopied: boolean
  onTeamsCopy: () => void
}) {
  const { isSolo: isBusinessOwnerMode } = useAccountType()
  const report = packageDraft.completeness
  const [exportApproved, setExportApproved] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  async function runApprovedExport(format: 'qbo_csv' | 'xero_csv' | 'journal_csv') {
    const { approveAndExport } = await import('@/lib/export-approve')
    const result = approveAndExport({
      packageDraft,
      approvedByBookkeeper: exportApproved,
      format,
      businessName: client.business_name,
      statements: parsedStatements,
    })
    setExportMsg(result.ok ? result.message : result.error)
  }

  return (
    <div className="space-y-4">
      {/* Auto-draft status */}
      <div
        className={cn(
          'rounded-lg border p-5',
          packageDraft.status === 'ready_for_review'
            ? 'border-emerald-200 bg-emerald-50'
            : packageDraft.status === 'incomplete'
              ? 'border-amber-200 bg-amber-50'
              : 'border-gray-200 bg-white',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              {packageDraft.status === 'ready_for_review' ? 'Package ready for review' : 'Month package draft'}
            </h4>
            <p className="mt-0.5 text-xs text-gray-600">{packageDraft.label}</p>
            <p className="mt-1 text-xs text-gray-500">
              Completeness {report.score}/100 · auto-drafted when required documents pass checks (no Analysis click required).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDownloadPackage}
              disabled={!packageDraft.canDownloadPackage}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Package className="h-4 w-4" />
              {packageDraft.canDownloadPackage ? 'Download package' : 'Generate (blocked)'}
            </button>
            {tenantConfig.features.zipDownload && (plan === 'starter' || plan === 'pro') && (
              <button
                type="button"
                onClick={onDownloadZip}
                disabled={!packageDraft.canDownloadZip || zipping}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                ZIP sources
              </button>
            )}
          </div>
        </div>
      </div>

      {/* P5 — Approve & export to accounting software (human gate) */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">Approve & export (QBO / Xero)</h4>
        <p className="text-xs text-gray-500">
          Does not post to your general ledger. Download a file you import after review.
          Requires package ready_for_review and your explicit approval.
        </p>
        <label className="flex items-start gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={exportApproved}
            onChange={e => setExportApproved(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            I reviewed this package for {formatPeriod(period.year, period.month)} and approve export
            of parsed transactions only (no silent push to QBO/Xero).
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runApprovedExport('qbo_csv')}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Export QBO CSV
          </button>
          <button
            type="button"
            onClick={() => void runApprovedExport('xero_csv')}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Export Xero CSV
          </button>
          <button
            type="button"
            onClick={() => void runApprovedExport('journal_csv')}
            className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
          >
            Export journal CSV
          </button>
        </div>
        {exportMsg && (
          <p className={cn(
            'text-xs rounded-md px-3 py-2 border',
            exportMsg.startsWith('Export blocked') || exportMsg.includes('blocked')
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-emerald-50 border-emerald-200 text-emerald-900',
          )}>
            {exportMsg}
          </p>
        )}
      </div>

      {/* Client Monthly Report (insights-based) */}
      {insights && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Client Monthly Report</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Cash flow summary, spending breakdown, vendor analysis — branded HTML report.
              </p>
            </div>
            <button
              onClick={async () => { const m = await import('@/lib/insights'); m.generateClientReport(insights, client.business_name, bookkeeperName) }}
              className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
            >
              <FileBarChart className="h-4 w-4" />
              Download Report
            </button>
          </div>
        </div>
      )}

      {/* Bookkeeper Package (manual re-download) */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              {isBusinessOwnerMode ? 'Package for Bookkeeper' : 'Bookkeeper Package'}
            </h4>
            <p className="mt-0.5 text-xs text-gray-500">
              HTML report with completeness score, checklist, and optional reconciliation.
              {reconResult ? ' Reconciliation data included when available.' : ' Run Analysis → reconciliation to enrich the report.'}
            </p>
          </div>
          <button
            onClick={onDownloadPackage}
            disabled={!packageDraft.canDownloadPackage}
            className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            {packageDraft.canDownloadPackage ? 'Download' : 'Blocked'}
          </button>
        </div>
      </div>

      {/* CSV Export */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Export CSV</h4>
            <p className="mt-0.5 text-xs text-gray-500">
              Opens in Excel, Google Sheets, and imports into QuickBooks.
            </p>
          </div>
          <button
            onClick={() => exportMonthCSV(client.business_name, requirements, period.year, period.month)}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Table className="h-4 w-4" />
            Download
          </button>
        </div>
      </div>

      {/* Accounting Software Exports */}
      {parsedStatements.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h4 className="mb-1 text-sm font-semibold text-gray-900">Accounting Software Export</h4>
          <p className="mb-4 text-xs text-gray-500">
            Import parsed transactions directly into your accounting software — zero manual data entry.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(() => {
              const txns = parsedStatements.flatMap(s => s.transactions).map(t => ({
                date: t.date, description: t.description,
                amount: Math.abs(t.amount), type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
                category: t.category,
              }))
              const lazyExport = (method: string) => async () => {
                const m = await import('@/lib/export-qb')
                const fn = m[method as keyof typeof m] as (...args: unknown[]) => void
                if (method === 'exportOFX') fn(txns, 'Checking', client.business_name)
                else fn(txns, client.business_name)
              }
              return [
              { label: 'QuickBooks IIF', fn: lazyExport('exportQuickBooksIIF'), icon: BookOpen },
              { label: 'QBO Online CSV', fn: lazyExport('exportQBOCSV'), icon: Table },
              { label: 'Xero CSV', fn: lazyExport('exportXeroCSV'), icon: Table },
              { label: 'Journal Entries', fn: lazyExport('exportJournalEntries'), icon: FileText },
              { label: 'OFX (Bank)', fn: lazyExport('exportOFX'), icon: Download },
            ]})().map(exp => (
              <button
                key={exp.label}
                onClick={exp.fn}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-3 text-xs font-medium text-gray-700 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <exp.icon className="h-4 w-4" />
                {exp.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Calendar */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Add Deadline to Calendar</h4>
            <p className="mt-0.5 text-xs text-gray-500">
              Works with Outlook, Google Calendar, and Apple Calendar.
            </p>
          </div>
          <button
            onClick={() => generateUploadDeadlineICS(client.business_name, getNextDeadline())}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Calendar className="h-4 w-4" />
            Download .ics
          </button>
        </div>
      </div>

      {/* Teams/Slack */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Copy for Teams / Slack</h4>
            <p className="mt-0.5 text-xs text-gray-500">
              Formatted summary ready to paste into a channel or DM.
            </p>
          </div>
          <button
            onClick={onTeamsCopy}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium',
              teamsCopied
                ? 'border-success/30 bg-success/5 text-success'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50',
            )}
          >
            {teamsCopied ? <CheckCircle className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
            {teamsCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── RECONCILIATION RESULTS ────────────────────────────────────────────────

function ReconciliationResultsSection({ result }: { result: ReconciliationResult }) {
  return (
    <div>
      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Match Rate</p>
          <p className={cn('text-xl font-bold', result.matchRate >= 80 ? 'text-success' : result.matchRate >= 50 ? 'text-warning' : 'text-danger')}>
            {result.matchRate}%
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Matched</p>
          <p className="text-xl font-bold text-success">{result.matched.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Unmatched Txns</p>
          <p className={cn('text-xl font-bold', result.unmatchedTransactions.length > 0 ? 'text-danger' : 'text-success')}>
            {result.unmatchedTransactions.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Hours Saved</p>
          <p className="text-xl font-bold text-primary">{result.estimatedHoursSaved}</p>
        </div>
      </div>

      <p className="mb-4 text-sm text-gray-600">{result.recommendation}</p>

      {/* Matched items */}
      {result.matched.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-gray-500">Matched Transactions</p>
          <div className="space-y-1.5">
            {result.matched.slice(0, 10).map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-success/20 bg-white px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-success" />
                  <span className="text-gray-700">{m.transaction.date} — {m.transaction.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">${Math.abs(m.transaction.amount).toFixed(2)}</span>
                  <span className="text-gray-400">{Array.isArray(m.receipt) ? m.receipt.map(r => r.filename).join(' + ') : m.receipt.filename}</span>
                  {m.matchType !== 'exact' && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">{m.matchType}</span>}
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    m.confidence === 'high' ? 'bg-success/10 text-success' : m.confidence === 'medium' ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger',
                  )}>
                    {m.confidence}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched transactions */}
      {result.unmatchedTransactions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-danger">Unmatched — Needs Review</p>
          <div className="space-y-1.5">
            {result.unmatchedTransactions.map((t, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-danger/20 bg-white px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                  <span className="text-gray-700">{t.date} — {t.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">${Math.abs(t.amount).toFixed(2)}</span>
                  <span className="text-gray-400">{t.category ?? 'Uncategorized'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring patterns */}
      {result.recurringPatterns.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-primary">Recurring Expenses Detected</p>
          <div className="space-y-1.5">
            {result.recurringPatterns.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span className="text-gray-700">{p.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">${p.amount.toFixed(2)}/mo</span>
                  <span className="text-gray-400">~day {p.dayOfMonth}</span>
                  <span className="text-gray-400">{p.occurrences}x seen</span>
                  {p.category && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{p.category}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── COMPLETENESS REPORT ────────────────────────────────────────────────────

function CompletenessReportSection({ requirements, parsedStatements }: { requirements: RequirementWithUploads[]; parsedStatements?: StatementSummary[] }) {
  const report = runCompletenessChecks(requirements, parsedStatements)

  const severityIcon = (severity: 'pass' | 'warning' | 'fail') => {
    switch (severity) {
      case 'pass': return <CheckCircle className="h-4 w-4 text-success" />
      case 'warning': return <AlertTriangle className="h-4 w-4 text-warning" />
      case 'fail': return <XCircle className="h-4 w-4 text-danger" />
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Readiness Check</h3>
        <div className="flex items-center gap-2">
          <div className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            report.readyForBookkeeper
              ? 'bg-success/10 text-success'
              : 'bg-warning/10 text-warning',
          )}>
            <ShieldCheck className="h-3.5 w-3.5" />
            {report.readyForBookkeeper ? 'Ready for review' : 'Not ready yet'}
          </div>
          <span className="text-xs text-gray-400">Score: {report.score}/100</span>
        </div>
      </div>
      <div className="space-y-2">
        {report.checks.map(check => (
          <div
            key={check.id}
            className="flex items-start gap-3 rounded-md border border-gray-100 bg-white px-4 py-2.5 text-sm"
          >
            {severityIcon(check.severity)}
            <div>
              <span className="font-medium text-gray-700">{check.label}</span>
              <p className="text-xs text-gray-500">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ENGAGEMENT LETTER CARD ─────────────────────────────────────────────────
// Wraps each letter row with an optional EngagementLetterEditor for the
// multi-signer invite flow. The editor itself is lazy-loaded — most
// bookkeepers won't open it for simple single-signer letters, and
// pdfjs-dist (used by SignaturePlacementDesigner) is heavy.

const EngagementLetterEditor = lazy(() =>
  import('@/components/practitioner/EngagementLetterEditor').then(m => ({ default: m.EngagementLetterEditor })),
)

function EngagementLetterCard({
  letter,
  bookkeeperId,
}: {
  letter: EngagementLetterWithSignature
  bookkeeperId: string
}) {
  const [editorOpen, setEditorOpen] = useState(false)
  const isFullySigned = !!letter.fully_signed_at
  const hasSignature = !!letter.signature

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">{letter.label}</span>
        </div>
        <div className="flex items-center gap-3">
          {isFullySigned ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" />
              Fully signed {new Date(letter.fully_signed_at!).toLocaleDateString()}
            </span>
          ) : hasSignature ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle className="h-3.5 w-3.5" />
              Signed {new Date(letter.signature!.signed_at).toLocaleDateString()}
              {' by '}{letter.signature!.signer_name}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <Clock className="h-3.5 w-3.5" />
              Awaiting signature
            </span>
          )}
          {!isFullySigned && bookkeeperId && (
            <button
              type="button"
              onClick={() => setEditorOpen(o => !o)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {editorOpen ? 'Close' : 'Add signatories'}
            </button>
          )}
        </div>
      </div>
      {editorOpen && bookkeeperId && (
        <div className="border-t border-gray-100 p-3">
          <Suspense fallback={
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          }>
            <EngagementLetterEditor
              letter={letter}
              bookkeeperId={bookkeeperId}
              onInvitesSent={() => setEditorOpen(false)}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}
