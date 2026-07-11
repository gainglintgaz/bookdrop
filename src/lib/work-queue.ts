// work-queue.ts — Phase 3 judgment hub filters (dashboard + documents).
// All filters grounded in real submission status / upload metadata — no invented signals.

import type { ClientWithStatus, DocumentUpload, RequirementWithUploads, SubmissionStatus } from '@/types'
import { evaluatePackageDraft } from './package-draft'

/** Dashboard client filters — user can switch freely (not one fixed view). */
export type DashboardFilterId =
  | 'all'
  | 'needs_docs'
  | 'partial'
  | 'package_ready'
  | 'has_low_conf'
  | 'client_confirmed'

export const DASHBOARD_FILTERS: Array<{
  id: DashboardFilterId
  label: string
  description: string
}> = [
  { id: 'all', label: 'All', description: 'Every active client this period' },
  { id: 'needs_docs', label: 'Missing docs', description: 'Not started or missing required uploads' },
  { id: 'partial', label: 'Partial', description: 'Some required docs in' },
  { id: 'package_ready', label: 'Package ready', description: 'Completeness gate passed' },
  { id: 'has_low_conf', label: 'Low-confidence', description: 'Upload still has low-confidence lines' },
  { id: 'client_confirmed', label: 'Client confirmed', description: 'At least one upload client_confirmed_at set' },
]

export function clientHasLowConfidence(c: ClientWithStatus): boolean {
  return c.requirements.some(r =>
    r.uploads.some(u => (u.categorization_summary?.lowConfidence ?? 0) > 0 && !u.client_confirmed_at),
  )
}

export function clientHasClientConfirm(c: ClientWithStatus): boolean {
  return c.requirements.some(r => r.uploads.some(u => !!u.client_confirmed_at))
}

export function clientPackageReady(c: ClientWithStatus, year: number, month: number): boolean {
  const draft = evaluatePackageDraft(c.requirements, year, month)
  return draft.status === 'ready_for_review'
}

export function filterClientsByWorkQueue<T extends ClientWithStatus>(
  clients: T[],
  filter: DashboardFilterId,
  period: { year: number; month: number },
): T[] {
  switch (filter) {
    case 'all':
      return clients
    case 'needs_docs':
      return clients.filter(
        c => c.submissionStatus === 'not_started' || c.submissionStatus === 'missing',
      )
    case 'partial':
      return clients.filter(c => c.submissionStatus === 'partial')
    case 'package_ready':
      return clients.filter(c => clientPackageReady(c, period.year, period.month))
    case 'has_low_conf':
      return clients.filter(clientHasLowConfidence)
    case 'client_confirmed':
      return clients.filter(clientHasClientConfirm)
    default:
      return clients
  }
}

export function countByFilter(
  clients: ClientWithStatus[],
  period: { year: number; month: number },
): Record<DashboardFilterId, number> {
  const ids = DASHBOARD_FILTERS.map(f => f.id)
  const out = {} as Record<DashboardFilterId, number>
  for (const id of ids) {
    out[id] = filterClientsByWorkQueue(clients, id, period).length
  }
  return out
}

/** Documents tab work sections */
export type DocsWorkTab = 'docs' | 'exceptions' | 'confirms' | 'package'

export const DOCS_WORK_TABS: Array<{ id: DocsWorkTab; label: string }> = [
  { id: 'docs', label: 'Documents' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'confirms', label: 'Client confirms' },
  { id: 'package', label: 'Package' },
]

export function docsTabHasWork(
  tab: DocsWorkTab,
  requirements: RequirementWithUploads[],
  period: { year: number; month: number },
): boolean {
  const uploads = requirements.flatMap(r => r.uploads)
  switch (tab) {
    case 'docs':
      return true
    case 'exceptions':
      return uploads.some(u => (u.categorization_summary?.lowConfidence ?? 0) > 0 && !u.client_confirmed_at)
    case 'confirms':
      return uploads.some(u => !!u.client_confirmed_at || !!u.auto_categorized_at)
    case 'package':
      return evaluatePackageDraft(requirements, period.year, period.month).status !== 'not_started'
  }
}

const VIEW_STORAGE_KEY = 'bookdrop:dashboard_work_filter'

/** Persist last filter choice (per-browser customization). */
export function loadSavedDashboardFilter(): DashboardFilterId {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY) as DashboardFilterId | null
    if (v && DASHBOARD_FILTERS.some(f => f.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'all'
}

export function saveDashboardFilter(id: DashboardFilterId): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export type { SubmissionStatus, DocumentUpload }
