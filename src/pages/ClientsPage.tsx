import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useClients } from '@/hooks/useClients'
import { usePlanGating } from '@/hooks/usePlanGating'
import { useAuthStore } from '@/stores/auth.store'
import { sendManualReminder } from '@/lib/send-reminder'
import { tenantConfig } from '@/lib/tenant.config'
import { cn, formatFileSize } from '@/lib/utils'
import { StatusBadge } from '@/components/practitioner/StatusBadge'
import { MonthSelector } from '@/components/practitioner/MonthSelector'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import { isDemoMode } from '@/lib/mode'
import {
  Users, Plus, Lock, Search, CheckCircle, Clock, Send, Copy,
  FileText, CreditCard, Receipt, ChevronRight, ArrowRight, Loader2,
  Building2, Mail, Calendar, AlertTriangle,
} from 'lucide-react'
import type { ClientWithStatus } from '@/types'

const PORTAL_BASE = `${window.location.origin}/upload/`

export function ClientsPage() {
  const { clients, loading, error, period, setPeriod, refresh } = useClients()
  const { canAddClient, upgradeMessage } = usePlanGating(clients.length)
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? clients.filter(c =>
        c.business_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.contact_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        c.contact_email.toLowerCase().includes(search.toLowerCase())
      )
    : clients

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={refresh} />
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{tenantConfig.clientLabel}s</h2>
          <p className="text-sm text-gray-500">
            Manage your {tenantConfig.clientLabel.toLowerCase()}s, view documents, and track submissions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MonthSelector year={period.year} month={period.month} onChange={setPeriod} />
          {canAddClient ? (
            <Link
              to="/clients/new"
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-light"
            >
              <Plus className="h-4 w-4" />
              Add {tenantConfig.clientLabel}
            </Link>
          ) : (
            <span className="flex cursor-not-allowed items-center gap-1.5 rounded-md bg-gray-200 px-3 py-2 text-sm font-medium text-gray-500" title={upgradeMessage ?? ''}>
              <Lock className="h-4 w-4" />
              Limit Reached
            </span>
          )}
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          aria-label={`Search ${tenantConfig.clientLabel.toLowerCase()}s`}
          placeholder={`Search ${tenantConfig.clientLabel.toLowerCase()}s by name or email...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Hint */}
      {isDemoMode && !search && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs text-primary">
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span>Click any card to open full details — statement parser, auto-reconciliation, exports, and more</span>
        </div>
      )}

      {/* Client cards */}
      {filtered.length === 0 ? (
        search ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No {tenantConfig.clientLabel.toLowerCase()}s match "{search}"</p>
            <button onClick={() => setSearch('')} className="mt-2 text-xs text-primary hover:underline">Clear search</button>
          </div>
        ) : (
          <EmptyState />
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(client => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── CLIENT CARD ──────────────────────────────────────────────────────────────

function ClientCard({ client }: { client: ClientWithStatus }) {
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const user = useAuthStore(state => state.user)

  const portalUrl = `${PORTAL_BASE}${client.portal_token}`
  const requiredCount = client.requirements.filter(r => r.required).length
  const uploadedCount = client.requirements.filter(r => r.required && r.uploads.length > 0).length
  const allUploads = client.requirements.flatMap(r => r.uploads)
  const lastUpload = allUploads.length > 0
    ? new Date(Math.max(...allUploads.map(u => new Date(u.uploaded_at).getTime())))
    : null

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleReminder = async (e: React.MouseEvent) => {
    e.preventDefault()
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

  return (
    <Link
      to={`/clients/${client.id}`}
      className="group block rounded-xl border border-gray-200 bg-white transition-all hover:border-primary/30 hover:shadow-md"
    >
      {/* Card header */}
      <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900 group-hover:text-primary">
              {client.business_name}
            </h3>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            {client.contact_name && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {client.contact_name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {client.contact_email}
            </span>
          </div>
        </div>
        <StatusBadge status={client.submissionStatus} />
      </div>

      {/* Document requirements */}
      <div className="px-5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500">Documents</span>
          <span className="text-xs font-medium text-gray-500">{uploadedCount}/{requiredCount} received</span>
        </div>

        {/* Progress bar */}
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              client.submissionStatus === 'complete' ? 'bg-success' :
              uploadedCount > 0 ? 'bg-primary' : 'bg-gray-200',
            )}
            style={{ width: requiredCount > 0 ? `${(uploadedCount / requiredCount) * 100}%` : '0%' }}
          />
        </div>

        {/* Requirement list */}
        <div className="space-y-1.5">
          {client.requirements.slice(0, 4).map(req => {
            const hasUpload = req.uploads.length > 0
            return (
              <div key={req.id} className="flex items-center gap-2 text-xs">
                {hasUpload ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : req.required ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                ) : (
                  <Clock className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                )}
                <span className={cn('truncate', hasUpload ? 'text-gray-600' : 'text-gray-400')}>
                  {req.label}
                </span>
                <DocTypeBadge type={req.doc_type} />
              </div>
            )
          })}
          {client.requirements.length > 4 && (
            <p className="text-[10px] text-gray-400">+{client.requirements.length - 4} more...</p>
          )}
        </div>
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          {lastUpload && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Last upload: {lastUpload.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {allUploads.length > 0 && (
            <span>
              {allUploads.length} file{allUploads.length !== 1 ? 's' : ''} ({formatFileSize(allUploads.reduce((s, u) => s + u.file_size_bytes, 0))})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleCopy}
            className={cn(
              'rounded p-1.5 text-xs',
              copied ? 'text-success' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
            )}
            title={copied ? 'Copied!' : 'Copy portal link'}
          >
            {copied ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {client.submissionStatus !== 'complete' && (
            <button
              onClick={handleReminder}
              disabled={sending || sent}
              className={cn(
                'rounded p-1.5 text-xs',
                sent ? 'text-success' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
              )}
              title={sent ? 'Sent!' : 'Send reminder'}
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sent ? <CheckCircle className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── DOC TYPE BADGE ─────────────────────────────────────────────────────────

function DocTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; icon: typeof FileText; color: string }> = {
    bank: { label: 'Bank', icon: Building2, color: 'text-blue-500 bg-blue-50' },
    credit_card: { label: 'CC', icon: CreditCard, color: 'text-purple-500 bg-purple-50' },
    payroll: { label: 'Payroll', icon: Receipt, color: 'text-green-500 bg-green-50' },
    receipt: { label: 'Receipt', icon: FileText, color: 'text-orange-500 bg-orange-50' },
    other: { label: 'Other', icon: FileText, color: 'text-gray-500 bg-gray-50' },
  }
  const c = config[type] ?? config.other
  return (
    <span className={cn('ml-auto flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium', c.color)}>
      <c.icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  )
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
      <Users className="mx-auto h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-sm font-semibold text-gray-900">
        No {tenantConfig.clientLabel.toLowerCase()}s yet
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Add your first {tenantConfig.clientLabel.toLowerCase()} to start collecting documents.
      </p>
      <Link
        to="/clients/new"
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light"
      >
        <Plus className="h-4 w-4" />
        Add {tenantConfig.clientLabel}
      </Link>
    </div>
  )
}
