import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useClients } from '@/hooks/useClients'
import { usePlanGating } from '@/hooks/usePlanGating'
import { useAuthStore } from '@/stores/auth.store'
import { sendManualReminder } from '@/lib/send-reminder'
import { tenantConfig } from '@/lib/tenant.config'
import { cn } from '@/lib/utils'
import { StatusBadge } from '@/components/practitioner/StatusBadge'
import { MonthSelector } from '@/components/practitioner/MonthSelector'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { isDemoMode } from '@/lib/mode'
import { ActivityFeed } from '@/components/shared/ActivityFeed'
import {
  Users, CheckCircle, Clock, AlertTriangle, Plus, Send, Eye, Copy, Lock,
  Zap, ArrowRight, ChevronRight, TrendingUp, FileText,
  Calendar, Package, BarChart3,
} from 'lucide-react'
import type { SubmissionStatus, ClientWithStatus } from '@/types'

const PORTAL_BASE = `${window.location.origin}/upload/`

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text)
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DashboardPage() {
  const { clients, loading, error, period, setPeriod, refresh } = useClients()
  const { canAddClient, isAtLimit, upgradeMessage } = usePlanGating(clients.length)
  const bookkeeper = useAuthStore(state => state.bookkeeper)

  // ---- Summary Stats ----
  const counts: Record<SubmissionStatus, number> = {
    complete: 0,
    partial: 0,
    missing: 0,
    not_started: 0,
  }
  for (const c of clients) {
    counts[c.submissionStatus]++
  }

  const activeClients = clients.filter(c => c.is_active).length
  const totalRequired = clients.reduce(
    (sum, c) => sum + c.requirements.filter(r => r.required).length,
    0,
  )
  const totalUploaded = clients.reduce(
    (sum, c) => sum + c.requirements.filter(r => r.required && r.uploads.length > 0).length,
    0,
  )
  const collectionRate = activeClients > 0
    ? Math.round((counts.complete / activeClients) * 100)
    : 0

  // Clients needing attention
  const clientsMissing = clients.filter(
    c => c.submissionStatus === 'not_started' || c.submissionStatus === 'missing',
  )
  const clientsPartial = clients.filter(c => c.submissionStatus === 'partial')
  const clientsComplete = clients.filter(c => c.submissionStatus === 'complete')

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }

  const firstName = bookkeeper?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* ---- Welcome Header ---- */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            {getGreeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {formatDate()}
            {bookkeeper?.practice_name && (
              <span className="ml-2 text-gray-400">|</span>
            )}
            {bookkeeper?.practice_name && (
              <span className="ml-2">{bookkeeper.practice_name}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthSelector year={period.year} month={period.month} onChange={setPeriod} />
          {canAddClient ? (
            <Link
              to="/clients/new"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-light transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add {tenantConfig.clientLabel}
            </Link>
          ) : (
            <span
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-400 cursor-not-allowed"
              title={upgradeMessage ?? ''}
            >
              <Lock className="h-4 w-4" />
              Limit Reached
            </span>
          )}
        </div>
      </div>

      {/* Plan limit banner */}
      {isAtLimit && upgradeMessage && (
        <div className="mb-6 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning flex items-center justify-between">
          <span>{upgradeMessage}</span>
          <Link to="/settings" className="font-medium underline ml-3 shrink-0">Upgrade now</Link>
        </div>
      )}

      {/* Demo mode banner */}
      {isDemoMode && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-white to-primary/5 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">You are exploring demo mode</p>
                <p className="text-xs text-gray-500">
                  Sample data loaded. Click any client to explore the full feature set.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/clients/client-001?tab=analysis"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-light transition-colors"
              >
                <Zap className="h-4 w-4" />
                See Pipeline in Action
              </Link>
              <Link
                to="/clients"
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                View All Clients
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---- Stats Row (4 cards) ---- */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active Clients"
          value={activeClients}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          trend={isDemoMode ? '+2 this month' : undefined}
        />
        <StatCard
          label="Documents This Month"
          value={`${totalUploaded}/${totalRequired}`}
          icon={FileText}
          iconColor="text-primary"
          iconBg="bg-emerald-50"
          trend={totalRequired > 0 ? `${Math.round((totalUploaded / totalRequired) * 100)}% received` : undefined}
        />
        <StatCard
          label="Ready for Review"
          value={counts.complete}
          icon={Package}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
          trend={counts.complete > 0 ? 'Packages complete' : undefined}
        />
        <StatCard
          label="Collection Rate"
          value={`${collectionRate}%`}
          icon={BarChart3}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          trend={collectionRate >= 80 ? 'On track' : collectionRate > 0 ? 'Needs attention' : undefined}
        />
      </div>

      {/* ---- Two Column Layout ---- */}
      {clients.length > 0 && (
        <div className="mb-8 grid gap-6 lg:grid-cols-5">
          {/* LEFT: Action Items (60%) */}
          <div className="lg:col-span-3 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              Action Items
            </h2>

            {/* Missing docs - needs reminders */}
            {clientsMissing.length > 0 && (
              <ActionCard
                icon={AlertTriangle}
                iconColor="text-red-500"
                iconBg="bg-red-50"
                title={`${clientsMissing.length} client${clientsMissing.length !== 1 ? 's' : ''} with missing documents`}
                description="These clients haven't started uploading yet this month."
              >
                <div className="mt-3 space-y-2">
                  {clientsMissing.slice(0, 3).map(c => (
                    <ActionClientRow key={c.id} client={c} />
                  ))}
                  {clientsMissing.length > 3 && (
                    <Link
                      to="/clients"
                      className="block text-xs font-medium text-primary hover:underline"
                    >
                      View all {clientsMissing.length} clients
                    </Link>
                  )}
                </div>
              </ActionCard>
            )}

            {/* Partial uploads - nudge */}
            {clientsPartial.length > 0 && (
              <ActionCard
                icon={Clock}
                iconColor="text-amber-500"
                iconBg="bg-amber-50"
                title={`${clientsPartial.length} client${clientsPartial.length !== 1 ? 's' : ''} with partial submissions`}
                description="Some documents received, but not all required ones."
              >
                <div className="mt-3 space-y-2">
                  {clientsPartial.slice(0, 3).map(c => (
                    <ActionClientRow key={c.id} client={c} />
                  ))}
                  {clientsPartial.length > 3 && (
                    <Link
                      to="/clients"
                      className="block text-xs font-medium text-primary hover:underline"
                    >
                      View all {clientsPartial.length} clients
                    </Link>
                  )}
                </div>
              </ActionCard>
            )}

            {/* Complete - ready for review */}
            {clientsComplete.length > 0 && (
              <ActionCard
                icon={CheckCircle}
                iconColor="text-success"
                iconBg="bg-green-50"
                title={`${clientsComplete.length} package${clientsComplete.length !== 1 ? 's' : ''} ready for review`}
                description="All required documents received. Ready to process."
              >
                <div className="mt-3 space-y-2">
                  {clientsComplete.slice(0, 3).map(c => (
                    <div key={c.id} className="flex items-center justify-between">
                      <Link
                        to={`/clients/${c.id}`}
                        className="text-sm font-medium text-gray-700 hover:text-primary"
                      >
                        {c.business_name}
                      </Link>
                      <Link
                        to={`/clients/${c.id}`}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Review
                      </Link>
                    </div>
                  ))}
                </div>
              </ActionCard>
            )}

            {/* All clear state */}
            {clientsMissing.length === 0 && clientsPartial.length === 0 && clientsComplete.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                <CheckCircle className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">No action items right now. Check back later.</p>
              </div>
            )}
          </div>

          {/* RIGHT: Activity Feed (40%) */}
          <div className="lg:col-span-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">
              Recent Activity
            </h2>
            <ActivityFeed maxItems={8} />
          </div>
        </div>
      )}

      {/* ---- Client Overview Table ---- */}
      {clients.length === 0 ? (
        <EmptyClientState />
      ) : (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
              All Clients
            </h2>
            <Link
              to="/clients"
              className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
            >
              View full list <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {isDemoMode && (
              <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/5 px-4 py-2.5 text-xs text-primary">
                <ArrowRight className="h-3.5 w-3.5" />
                <span className="font-medium">Click any row</span> to open statement parser, reconciliation, exports, and more
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-[560px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Client</th>
                    <th className="px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide sm:table-cell">Progress</th>
                    <th className="hidden px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide sm:table-cell">Last Upload</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500 text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clients.map(client => (
                    <ClientRow key={client.id} client={client} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Late rate insights */}
      {tenantConfig.features.lateRateInsights && clients.length >= 3 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-gray-900">Insights</h3>
          </div>
          <p className="text-xs text-gray-500">
            Late rate insights will appear here after 3 months of data. Track which {tenantConfig.clientLabel.toLowerCase()}s
            submit on time and which need more follow-up.
          </p>
        </div>
      )}
    </div>
  )
}

// ---- Stat Card ----

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  iconBg: string
  trend?: string
}

function StatCard({ label, value, icon: Icon, iconColor, iconBg, trend }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4.5 w-4.5', iconColor)} />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {trend && (
        <p className="mt-1 text-xs text-gray-400 flex items-center gap-1">
          <TrendingUp className="h-3 w-3" />
          {trend}
        </p>
      )}
    </div>
  )
}

// ---- Action Card ----

interface ActionCardProps {
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  iconBg: string
  title: string
  description: string
  children: React.ReactNode
}

function ActionCard({ icon: Icon, iconColor, iconBg, title, description, children }: ActionCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-4.5 w-4.5', iconColor)} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-gray-500">{description}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

// ---- Action Client Row (for action items section) ----

function ActionClientRow({ client }: { client: ClientWithStatus }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const user = useAuthStore(state => state.user)

  const requiredCount = client.requirements.filter(r => r.required).length
  const uploadedCount = client.requirements.filter(r => r.required && r.uploads.length > 0).length

  const handleSendReminder = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user || sending) return
    setSending(true)
    const { success } = await sendManualReminder(client, user.id)
    setSending(false)
    if (success) {
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <Link
          to={`/clients/${client.id}`}
          className="text-sm font-medium text-gray-700 hover:text-primary"
        >
          {client.business_name}
        </Link>
        <span className="ml-2 text-xs text-gray-400">
          {uploadedCount}/{requiredCount} docs
        </span>
      </div>
      <button
        onClick={handleSendReminder}
        disabled={sending || sent}
        className={cn(
          'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          sent
            ? 'bg-green-50 text-success'
            : 'bg-gray-50 text-gray-600 hover:bg-primary/10 hover:text-primary',
        )}
      >
        {sending ? (
          <LoadingSpinner size="sm" />
        ) : sent ? (
          <>
            <CheckCircle className="h-3 w-3" />
            Sent
          </>
        ) : (
          <>
            <Send className="h-3 w-3" />
            Remind
          </>
        )}
      </button>
    </div>
  )
}

// ---- Client Table Row ----

function ClientRow({ client }: { client: ClientWithStatus }) {
  const navigate = useNavigate()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const user = useAuthStore(state => state.user)

  const requiredCount = client.requirements.filter(r => r.required).length
  const uploadedCount = client.requirements.filter(r => r.required && r.uploads.length > 0).length
  const portalUrl = `${PORTAL_BASE}${client.portal_token}`

  const allUploads = client.requirements.flatMap(r => r.uploads)
  const lastUpload = allUploads.length > 0
    ? new Date(Math.max(...allUploads.map(u => new Date(u.uploaded_at).getTime())))
    : null

  const handleSendReminder = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!user || sending || client.submissionStatus === 'complete') return
    setSending(true)
    const { success } = await sendManualReminder(client, user.id)
    setSending(false)
    if (success) {
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    }
  }

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(portalUrl)
  }

  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-gray-50/80 group"
      onClick={() => navigate(`/clients/${client.id}`)}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 group-hover:text-primary transition-colors">
            {client.business_name}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>
        <p className="mt-0.5 text-xs text-gray-400">
          {client.contact_name ?? client.contact_email}
        </p>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={client.submissionStatus} />
      </td>
      <td className="hidden px-4 py-3.5 sm:table-cell">
        {requiredCount > 0 ? (
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  client.submissionStatus === 'complete' ? 'bg-success' : 'bg-primary',
                )}
                style={{ width: `${(uploadedCount / requiredCount) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-500">{uploadedCount}/{requiredCount}</span>
          </div>
        ) : (
          <span className="text-xs text-gray-400">No docs required</span>
        )}
      </td>
      <td className="hidden px-4 py-3.5 sm:table-cell">
        {lastUpload ? (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <Calendar className="h-3 w-3 text-gray-400" />
            {lastUpload.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span className="text-xs text-gray-400">--</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={handleCopyLink}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Copy portal link"
            aria-label="Copy portal link"
          >
            <Copy className="h-4 w-4" />
          </button>
          <Link
            to={`/clients/${client.id}`}
            onClick={e => e.stopPropagation()}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="View details"
            aria-label={`View details for ${client.business_name}`}
          >
            <Eye className="h-4 w-4" />
          </Link>
          <button
            onClick={handleSendReminder}
            disabled={sending || sent || client.submissionStatus === 'complete'}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              sent
                ? 'text-success'
                : client.submissionStatus === 'complete'
                  ? 'text-gray-200 cursor-not-allowed'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
            )}
            title={sent ? 'Reminder sent!' : client.submissionStatus === 'complete' ? 'All docs submitted' : 'Send reminder'}
            aria-label={sent ? 'Reminder sent' : client.submissionStatus === 'complete' ? 'All docs submitted' : 'Send reminder'}
          >
            {sending ? <LoadingSpinner size="sm" /> : sent ? <CheckCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ---- Empty State ----

function EmptyClientState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-16 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
        <Users className="h-8 w-8 text-gray-300" />
      </div>
      <h3 className="mt-6 text-base font-semibold text-gray-900">
        No {tenantConfig.clientLabel.toLowerCase()}s yet
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
        Add your first {tenantConfig.clientLabel.toLowerCase()} to start collecting documents.
        Each {tenantConfig.clientLabel.toLowerCase()} gets a unique upload link.
      </p>
      <Link
        to="/clients/new"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-light transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Your First {tenantConfig.clientLabel}
      </Link>
    </div>
  )
}
