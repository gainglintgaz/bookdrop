// PeriodDeskNav — P1 stage chips for the single close-prep desk.

import { cn } from '@/lib/utils'
import {
  PERIOD_DESK_CATALOG,
  type PeriodDeskStage,
  type StageStatus,
} from '@/lib/period-desk'
import {
  CheckCircle2, Circle, AlertCircle, MinusCircle, Wrench,
} from 'lucide-react'

interface Props {
  active: PeriodDeskStage
  statuses: Record<PeriodDeskStage, StageStatus>
  onSelect: (stage: PeriodDeskStage) => void
}

function StatusIcon({ status }: { status: StageStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
  if (status === 'needs_work') return <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
  if (status === 'blocked') return <Circle className="h-3.5 w-3.5 text-gray-300" />
  if (status === 'optional') return <Wrench className="h-3.5 w-3.5 text-gray-400" />
  return <MinusCircle className="h-3.5 w-3.5 text-gray-300" />
}

export function PeriodDeskNav({ active, statuses, onSelect }: Props) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Period desk</h3>
        <p className="text-xs text-gray-500">
          One workspace for this client and month. Work stages left to right — AI preps, you approve.
        </p>
      </div>
      <nav className="flex flex-wrap gap-1.5" aria-label="Period desk stages">
        {PERIOD_DESK_CATALOG.map(stage => {
          const st = statuses[stage.id]
          const isActive = active === stage.id
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onSelect(stage.id)}
              title={stage.description}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors',
                isActive
                  ? 'bg-primary text-white ring-primary'
                  : st === 'needs_work'
                    ? 'bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100'
                    : st === 'done'
                      ? 'bg-emerald-50 text-emerald-900 ring-emerald-200 hover:bg-emerald-100'
                      : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50',
              )}
            >
              <StatusIcon status={st} />
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{stage.shortLabel}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
