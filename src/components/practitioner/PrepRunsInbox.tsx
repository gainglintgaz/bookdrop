// PrepRunsInbox — Period Desk History: overnight / manual prep agent runs.

import { useEffect, useState } from 'react'
import { listRecentRuns, type WorkflowRun } from '@/lib/workflows/playbooks'
import {
  buildPrepRunsInbox,
  monthLabel,
  type PrepRunInboxItem,
} from '@/lib/prep-runs-inbox'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import {
  Bot, CheckCircle2, AlertTriangle, XCircle, Clock, ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  bookkeeperId: string
  clientId: string
  period: { year: number; month: number }
}

function StatusIcon({ status }: { status: PrepRunInboxItem['status'] }) {
  if (status === 'complete') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (status === 'partial') return <AlertTriangle className="h-4 w-4 text-amber-600" />
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-600" />
  return <Clock className="h-4 w-4 text-gray-400" />
}

export function PrepRunsInbox({ bookkeeperId, clientId, period }: Props) {
  const [items, setItems] = useState<PrepRunInboxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listRecentRuns({ bookkeeperId, clientId, limit: 25 })
      .then((runs: WorkflowRun[]) => {
        if (cancelled) return
        setItems(buildPrepRunsInbox(runs, period))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[PrepRunsInbox]', err)
        setError('Could not load prep runs')
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bookkeeperId, clientId, period.year, period.month])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
      <div className="flex items-start gap-2">
        <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight">
            Prep runs · {monthLabel(period.year, period.month)}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Overnight cron and manual prep agent audit trail. AI preps lines — you still approve package export.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-amber-800 bg-amber-50 ring-1 ring-amber-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {items.length === 0 && !error && (
        <p className="text-sm text-gray-500 py-4 text-center">
          No prep runs for this month yet. Cron runs daily at 12:00 UTC, or use Power tools → Run prep agent.
        </p>
      )}

      <ul className="divide-y divide-gray-100">
        {items.map(item => {
          const open = expanded === item.id
          return (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : item.id)}
                className="w-full flex items-start gap-2 text-left"
              >
                <StatusIcon status={item.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {item.playbookName}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded',
                        item.status === 'complete' && 'bg-emerald-50 text-emerald-800',
                        item.status === 'partial' && 'bg-amber-50 text-amber-800',
                        item.status === 'failed' && 'bg-red-50 text-red-800',
                        item.status !== 'complete' &&
                          item.status !== 'partial' &&
                          item.status !== 'failed' &&
                          'bg-gray-100 text-gray-600',
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{item.summary}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(item.startedAt).toLocaleString()}
                    {item.readinessScore != null && ` · readiness ${item.readinessScore}`}
                    {item.alertCount > 0 && ` · ${item.alertCount} alert(s)`}
                  </p>
                </div>
                {open ? (
                  <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                )}
              </button>
              {open && item.alerts.length > 0 && (
                <ul className="mt-2 ml-6 space-y-1">
                  {item.alerts.map((a, i) => (
                    <li key={i} className="text-xs text-amber-900 bg-amber-50 rounded px-2 py-1">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
              {open && (
                <p className="mt-2 ml-6 text-[11px] text-gray-400 font-mono">
                  {item.engineVersion} · {item.stepCount} steps · {item.id.slice(0, 8)}…
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
