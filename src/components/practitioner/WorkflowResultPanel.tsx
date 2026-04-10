// src/components/practitioner/WorkflowResultPanel.tsx
// Displays the automated workflow pipeline results in a scannable format.
// Shows readiness score, step progress, summary cards, alerts, and category breakdown.

import { cn } from '@/lib/utils'
import type { WorkflowResult, WorkflowStep, WorkflowSummary } from '@/lib/workflow-engine'
import {
  CheckCircle, XCircle, AlertTriangle, Clock,
  Download, Send, Zap, FileText, Shield,
  TrendingUp, Copy, BarChart3,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  result: WorkflowResult
  onDownloadPackage?: () => void
  onSendToBookkeeper?: () => void
}

// ---------------------------------------------------------------------------
// Readiness gauge colors
// ---------------------------------------------------------------------------

function gaugeColor(score: number): { ring: string; text: string; bg: string } {
  if (score >= 80) return { ring: 'stroke-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-50' }
  if (score >= 60) return { ring: 'stroke-amber-500', text: 'text-amber-600', bg: 'bg-amber-50' }
  return { ring: 'stroke-red-500', text: 'text-red-600', bg: 'bg-red-50' }
}

function statusBadgeClass(status: WorkflowResult['status']): string {
  switch (status) {
    case 'complete':
      return 'bg-emerald-100 text-emerald-700'
    case 'partial':
      return 'bg-amber-100 text-amber-700'
    case 'failed':
      return 'bg-red-100 text-red-700'
  }
}

// ---------------------------------------------------------------------------
// Circular gauge (SVG)
// ---------------------------------------------------------------------------

function ReadinessGauge({ score, grade }: { score: number; grade: string }) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const colors = gaugeColor(score)

  return (
    <div className={cn('flex flex-col items-center rounded-xl p-4', colors.bg)}>
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle
          cx="70" cy="70" r={radius}
          fill="none" stroke="currentColor"
          strokeWidth="10"
          className="text-gray-200"
        />
        <circle
          cx="70" cy="70" r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={colors.ring}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: 140, height: 140 }}>
        <span className={cn('text-3xl font-black', colors.text)}>{score}</span>
        <span className={cn('text-sm font-semibold', colors.text)}>{grade}</span>
      </div>
      <span className="mt-1 text-xs font-medium text-gray-500">Readiness Score</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step list
// ---------------------------------------------------------------------------

function StepIcon({ status }: { status: WorkflowStep['status'] }) {
  switch (status) {
    case 'complete':
      return <CheckCircle className="h-4.5 w-4.5 text-emerald-500" />
    case 'skipped':
      return <Clock className="h-4.5 w-4.5 text-gray-400" />
    case 'failed':
      return <XCircle className="h-4.5 w-4.5 text-red-500" />
  }
}

function StepList({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Pipeline Steps</h4>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2">
            <StepIcon status={step.status} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">{step.name}</span>
                <span className="ml-2 shrink-0 text-xs text-gray-400">{step.durationMs}ms</span>
              </div>
              {step.resultSummary && (
                <p className="mt-0.5 text-xs text-gray-500">{step.resultSummary}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Summary stat cards
// ---------------------------------------------------------------------------

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent?: string
}

function StatCard({ icon, label, value, sub, accent = 'text-gray-900' }: StatCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
      <div className="mt-0.5 shrink-0 text-gray-400">{icon}</div>
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className={cn('text-lg font-bold', accent)}>{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

function SummaryCards({ summary }: { summary: WorkflowSummary }) {
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard
        icon={<FileText className="h-5 w-5" />}
        label="Transactions"
        value={summary.totalTransactions}
        sub={`${summary.categorizedCount} categorized`}
      />
      <StatCard
        icon={<BarChart3 className="h-5 w-5" />}
        label="Categorization"
        value={`${summary.categorizationRate}%`}
        sub="high/medium confidence"
        accent={summary.categorizationRate >= 80 ? 'text-emerald-600' : summary.categorizationRate >= 60 ? 'text-amber-600' : 'text-red-600'}
      />
      <StatCard
        icon={<Shield className="h-5 w-5" />}
        label="Tax Deductions"
        value={summary.taxDeductionsFound}
        sub={fmt.format(summary.taxDeductionAmount)}
        accent="text-emerald-600"
      />
      <StatCard
        icon={<Copy className="h-5 w-5" />}
        label="Duplicates"
        value={summary.duplicatesFound}
        accent={summary.duplicatesFound === 0 ? 'text-emerald-600' : 'text-red-600'}
      />
      <StatCard
        icon={<AlertTriangle className="h-5 w-5" />}
        label="Anomalies"
        value={summary.anomaliesFound}
        accent={summary.anomaliesFound === 0 ? 'text-emerald-600' : 'text-amber-600'}
      />
      <StatCard
        icon={<Zap className="h-5 w-5" />}
        label="Hours Saved"
        value={summary.estimatedHoursSaved}
        sub="vs manual processing"
        accent="text-violet-600"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Alert list
// ---------------------------------------------------------------------------

function AlertList({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Alerts</h4>
      <ul className="space-y-1.5">
        {alerts.map((alert, i) => (
          <li key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>{alert}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top categories bar chart
// ---------------------------------------------------------------------------

function CategoryBars({ categories }: { categories: WorkflowSummary['topCategories'] }) {
  if (categories.length === 0) return null

  const maxAmount = Math.max(...categories.map((c) => c.amount))

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Top Categories
      </h4>
      <div className="space-y-2">
        {categories.map((cat) => {
          const pct = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0
          return (
            <div key={cat.category}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700 truncate max-w-[60%]">{cat.category}</span>
                <span className="text-gray-500">
                  ${cat.amount.toLocaleString()} ({cat.count})
                </span>
              </div>
              <div className="mt-0.5 h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-indigo-500"
                  style={{ width: `${pct}%`, transition: 'width 0.5s ease-out' }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatPeriod(period: { year: number; month: number }): string {
  const name = MONTH_NAMES[period.month - 1] ?? `Month ${period.month}`
  return `${name} ${period.year}`
}

function formatDuration(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function WorkflowResultPanel({ result, onDownloadPackage, onSendToBookkeeper }: Props) {
  const { summary, steps } = result

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {result.clientName} &mdash; {formatPeriod(result.period)}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Processed in {formatDuration(result.startedAt, result.completedAt)}
            {' '}&middot;{' '}
            {summary.totalTransactions} transactions
          </p>
        </div>
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', statusBadgeClass(result.status))}>
          {result.status === 'complete' ? 'Complete' : result.status === 'partial' ? 'Partial' : 'Failed'}
        </span>
      </div>

      {/* Readiness + Steps row */}
      <div className="flex flex-col items-start gap-6 md:flex-row">
        <div className="relative shrink-0">
          <ReadinessGauge score={summary.readinessScore} grade={summary.readinessGrade} />
        </div>
        <div className="min-w-0 flex-1">
          <StepList steps={steps} />
        </div>
      </div>

      {/* Summary cards */}
      <SummaryCards summary={summary} />

      {/* Alerts */}
      <AlertList alerts={summary.alerts} />

      {/* Category bars */}
      <CategoryBars categories={summary.topCategories} />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onDownloadPackage}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          <Download className="h-4 w-4" />
          Download Package
        </button>
        <button
          type="button"
          onClick={onSendToBookkeeper}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Send className="h-4 w-4" />
          Send to Bookkeeper
        </button>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
          <TrendingUp className="h-3.5 w-3.5" />
          <span>{summary.estimatedHoursSaved}h saved vs manual</span>
        </div>
      </div>
    </div>
  )
}
