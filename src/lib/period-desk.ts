// period-desk.ts — P1 single home for client × month close-prep.
// Stages replace scavenger-hunt tabs. Status is computed from real data only.

import type { PackageDraft } from './package-draft'
import type { RequirementWithUploads } from '@/types'
import type { ReconciliationResult } from './reconciliation'

export const PERIOD_DESK_STAGES = [
  'collect',
  'confirm',
  'exceptions',
  'recon',
  'package',
  'history',
  'power',
] as const

export type PeriodDeskStage = (typeof PERIOD_DESK_STAGES)[number]

export type StageStatus = 'done' | 'needs_work' | 'blocked' | 'optional' | 'idle'

export interface PeriodDeskStageDef {
  id: PeriodDeskStage
  label: string
  shortLabel: string
  description: string
}

export const PERIOD_DESK_CATALOG: readonly PeriodDeskStageDef[] = [
  {
    id: 'collect',
    label: 'Collect',
    shortLabel: 'Collect',
    description: 'Required documents and portal link for this month.',
  },
  {
    id: 'confirm',
    label: 'Confirm',
    shortLabel: 'Confirm',
    description: 'Client / bookkeeper line confirm progress.',
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    shortLabel: 'Exceptions',
    description: 'Low-confidence and open judgment items.',
  },
  {
    id: 'recon',
    label: 'Recon',
    shortLabel: 'Recon',
    description: 'Unmatched bank lines when statements are parsed.',
  },
  {
    id: 'package',
    label: 'Package',
    shortLabel: 'Package',
    description: 'Completeness gate, ZIP, and export approve.',
  },
  {
    id: 'history',
    label: 'History',
    shortLabel: 'History',
    description: 'Reminders, activity, earned intelligence.',
  },
  {
    id: 'power',
    label: 'Power tools',
    shortLabel: 'Tools',
    description: 'Analysis engines and playbooks (power-user).',
  },
] as const

export function isPeriodDeskStage(v: string | null | undefined): v is PeriodDeskStage {
  return !!v && (PERIOD_DESK_STAGES as readonly string[]).includes(v)
}

export interface PeriodDeskInputs {
  requirements: RequirementWithUploads[]
  packageDraft: PackageDraft
  /** Open low-confidence / unconfirmed lines count (0 if unknown). */
  openExceptionCount: number
  /** Client-confirm open count from proof strip (0 if unknown). */
  openConfirmCount: number
  reconResult: ReconciliationResult | null
  hasParsedStatements: boolean
}

export function computeStageStatuses(input: PeriodDeskInputs): Record<PeriodDeskStage, StageStatus> {
  const required = input.requirements.filter(r => r.required)
  const requiredDone = required.filter(r => r.uploads.length > 0).length
  const collectDone = required.length > 0 && requiredDone >= required.length
  const collectPartial = requiredDone > 0 && !collectDone

  const unmatched = input.reconResult?.unmatchedTransactions.length ?? 0

  return {
    collect: collectDone
      ? 'done'
      : collectPartial
        ? 'needs_work'
        : required.length === 0
          ? 'idle'
          : 'blocked',
    confirm:
      input.openConfirmCount > 0
        ? 'needs_work'
        : collectDone
          ? 'done'
          : 'idle',
    exceptions:
      input.openExceptionCount > 0
        ? 'needs_work'
        : collectPartial || collectDone
          ? 'done'
          : 'idle',
    recon: !input.hasParsedStatements
      ? 'idle'
      : unmatched > 0
        ? 'needs_work'
        : input.reconResult
          ? 'done'
          : 'optional',
    package:
      input.packageDraft.status === 'ready_for_review'
        ? 'done'
        : input.packageDraft.status === 'incomplete'
          ? 'needs_work'
          : 'blocked',
    history: 'optional',
    power: 'optional',
  }
}

/** Prefer first stage that needs work; else collect. */
export function suggestDefaultStage(
  statuses: Record<PeriodDeskStage, StageStatus>,
): PeriodDeskStage {
  const order: PeriodDeskStage[] = [
    'collect',
    'confirm',
    'exceptions',
    'recon',
    'package',
  ]
  for (const id of order) {
    if (statuses[id] === 'needs_work' || statuses[id] === 'blocked') return id
  }
  if (statuses.package === 'done') return 'package'
  return 'collect'
}

export function deskPath(clientId: string, stage?: PeriodDeskStage, period?: { year: number; month: number }): string {
  const params = new URLSearchParams()
  if (stage) params.set('desk', stage)
  if (period) {
    params.set('year', String(period.year))
    params.set('month', String(period.month))
  }
  const q = params.toString()
  return q ? `/clients/${clientId}?${q}` : `/clients/${clientId}`
}
