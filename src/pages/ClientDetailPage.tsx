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

type TabId = 'documents' | 'analysis' | 'activity' | 'export'

const TABS: { id: TabId; label: string; icon: typeof FileText }[] = [
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'export', label: 'Export', icon: FolderDown },
]

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const [searchParams] = useSearchParams()
  const [client, setClient] = useState<Client | null>(null)
  const [requirements, setRequirements] = useState<RequirementWithUploads[]>([])
  const [reminderLog, setReminderLog] = useState<ReminderLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(getCurrentPeriod)
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
  const initialTab = (['documents', 'analysis', 'activity', 'export'] as TabId[]).includes(searchParams.get('tab') as TabId)
    ? (searchParams.get('tab') as TabId)
    : 'documents'
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null)
  const [showMessages, setShowMessages] = useState(false)
  const [nudge, setNudge] = useState<string | null>(null)
  const [engagementLetters, setEngagementLetters] = useState<EngagementLetterWithSignature[]>([])
  const [uploadingLetter, setUploadingLetter] = useState(false)
  const [letterLabel, setLetterLabel] = useState('')
  const user = useAuthStore(state => state.user)
  const plan = useAuthStore(state => state.bookkeeper?.plan ?? 'free')

  const fetchData = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)

    try {
      if (isDemoMode) {
        const demoClient = getDemoClient(clientId)
        if (!demoClient) throw new Error('Client not found')
        setClient(demoClient)
        setRequirements(getDemoRequirementsWithUploads(clientId))
        setReminderLog(getDemoReminderLogs(clientId))
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
              onClick={() => setActiveTab('export')}
              className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline"
            >
              Export tab
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

      {/* ─── TAB BAR ────────────────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-1 sm:gap-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              aria-label={tab.label}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                'flex items-center gap-2 border-b-2 px-2 pb-3 text-sm font-medium transition-colors sm:px-1',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ─── TAB CONTENT ────────────────────────────────────────────────────────── */}

      {activeTab === 'documents' && (
        <DocumentsTab
          requirements={requirements}
          client={client}
          onDownload={handleDownload}
          engagementLetters={engagementLetters}
          uploadingLetter={uploadingLetter}
          letterLabel={letterLabel}
          setLetterLabel={setLetterLabel}
          user={user}
          onLetterUploaded={async () => {
            if (!clientId) return
            const updated = await fetchEngagementLetters(clientId)
            setEngagementLetters(updated)
          }}
          setUploadingLetter={setUploadingLetter}
        />
      )}

      {activeTab === 'analysis' && (
        <Suspense fallback={<div className="py-12 text-center"><LoadingSpinner size="lg" /></div>}>
        <AnalysisTab
          requirements={requirements}
          client={client}
          period={period}
          parsedStatements={parsedStatements}
          onStatementsParsed={async (stmts) => {
            setParsedStatements(stmts)
            // Auto-run ALL intelligence engines when statements are parsed
            if (stmts.length > 0) {
              const allTxns = stmts.flatMap(s => s.transactions).map(t => ({
                date: t.date,
                description: t.description,
                amount: Math.abs(t.amount),
                type: (t.amount >= 0 ? 'credit' : 'debit') as 'credit' | 'debit',
                category: t.category,
              }))
              // Dynamic imports — keeps these libs out of the main chunk
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
          reconResult={reconResult}
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

      {activeTab === 'activity' && (
        <Suspense fallback={<div className="py-12 text-center"><LoadingSpinner size="lg" /></div>}>
        <ActivityTimeline
          requirements={requirements}
          reminderLog={reminderLog}
          clientName={client.business_name}
        />
        </Suspense>
      )}

      {activeTab === 'export' && (
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
  onLetterUploaded,
  setUploadingLetter,
}: {
  requirements: RequirementWithUploads[]
  client: Client
  onDownload: (path: string, name: string) => void
  engagementLetters: EngagementLetterWithSignature[]
  uploadingLetter: boolean
  letterLabel: string
  setLetterLabel: (v: string) => void
  user: { id: string } | null
  onLetterUploaded: () => Promise<void>
  setUploadingLetter: (v: boolean) => void
}) {
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

  return (
    <div className="space-y-3">
      {categorizedUploads.length > 0 && (
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
                . Open Analysis only if you want full transaction detail — this strip is the exception queue.
              </p>
            </div>
          </div>
        </div>
      )}
      {requirements.map(req => {
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

      {/* Private notes */}
      {client.notes_private && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Private Notes</h3>
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            {client.notes_private}
          </div>
        </div>
      )}

      {/* Engagement Letters / E-Signatures */}
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
  period,
  parsedStatements,
  onStatementsParsed,
  reconResult,
  onRunReconciliation,
  insights,
  categorizationReport,
  cashForecast,
  auditReport,
  trendReport,
  policyReport,
  workflowResult,
  onSetWorkflowResult,
}: {
  requirements: RequirementWithUploads[]
  client: Client
  period: { year: number; month: number }
  parsedStatements: StatementSummary[]
  onStatementsParsed: (s: StatementSummary[]) => void
  reconResult: ReconciliationResult | null
  onRunReconciliation: () => void
  insights: MonthlyInsights | null
  categorizationReport: CategorizationReport | null
  cashForecast: CashFlowForecast | null
  auditReport: AuditReport | null
  trendReport: TrendReport | null
  policyReport: PolicyReport | null
  workflowResult: WorkflowResult | null
  onSetWorkflowResult: (r: WorkflowResult | null) => void
}) {
  const [section, setSection] = useState<AnalysisSection>('parse')
  const hasParsed = parsedStatements.length > 0

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

      {/* Workflow Result Panel — executive summary */}
      {workflowResult && (
        <WorkflowResultPanel result={workflowResult} />
      )}
      {!workflowResult && hasParsed && (
        <button
          onClick={async () => { const m = await import('@/lib/workflow-engine'); onSetWorkflowResult(m.getDemoWorkflowResult()) }}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <Zap className="h-4 w-4" />
          Run Full Pipeline
        </button>
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

      {/* Client Monthly Report (insights-based) */}
      {insights && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">Client Monthly Report</h4>
              <p className="mt-0.5 text-xs text-gray-500">
                Cash flow summary, spending breakdown, vendor analysis, and smart advice — branded HTML report.
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
