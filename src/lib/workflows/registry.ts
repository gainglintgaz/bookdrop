// src/lib/workflows/registry.ts
//
// V1.1 — Workflow Library registry. Pattern-transferred from Perplexity
// Computer's "35 finance workflows" (May 2026), retargeted to CPA work.
//
// Each workflow is a pre-built orchestration of existing engines. The
// bookkeeper clicks one button instead of running 6-12 manual steps.
//
// Architectural decision: registry is data-driven (this file) so adding a
// new workflow doesn't require touching the UI. The WorkflowLibraryPanel
// renders whatever's exported here.
//
// Aligned with .claude/rules/ai-first-principles.md §3 (Trust Ladder):
// workflows that depend on Loop 2+ data declare it via `unlocksAt`. The
// panel renders LOCKED state with honest "needs N more cycles" copy until
// the threshold is met.

import {
  Calendar, FileCheck, Receipt, Building, ShieldCheck, Search,
  TrendingUp, Briefcase, ClipboardList, AlertTriangle, Mail,
  type LucideIcon,
} from 'lucide-react'

/** Loop count required before this workflow produces meaningful results. */
export type LoopGate = 0 | 1 | 2 | 3 | 6 | 12

export interface WorkflowDef {
  /** Stable kebab-case id. Used in URLs + telemetry. */
  id: string
  /** Display name. */
  label: string
  /** Short pitch — what this saves the CPA. */
  description: string
  /** Detailed multi-line description (rendered when expanded). */
  detail: string
  /** Lucide icon used in the panel. */
  icon: LucideIcon
  /** Category for grouping in the UI. */
  category: 'close' | 'tax' | 'compliance' | 'onboarding' | 'audit' | 'comms'
  /** Time saved vs. manual execution (rough estimate, used for ROI display). */
  estimatedSavingsMinutes: number
  /** Trust Ladder gate — when does this start producing real output? */
  unlocksAt: LoopGate
  /** Plain-English description of what's needed before this is unlocked.
   *  Rendered to the user when status is locked. */
  unlockHint: string
  /** Estimated effort to fully build the engine for this workflow.
   *  Used to triage V1.1 vs V1.2 build order. */
  buildEffortDays: number
  /**
   * Implementation status today:
   *  - `live`: workflow runs end-to-end against existing engines
   *  - `stub`: registry entry present, executor returns a friendly stub
   *  - `planned`: in V1.1 scope but not yet wired
   */
  status: 'live' | 'stub' | 'planned'
}

export const WORKFLOWS: WorkflowDef[] = [
  // ── CLOSE ──────────────────────────────────────────────────────────────
  {
    id: 'month-end-close-service',
    label: 'Month-end close — service business',
    description: 'Reconcile + categorize + generate package for service-industry clients (consultants, agencies, freelancers).',
    detail: 'Runs in sequence: bank statement parse → auto-categorize → reconciliation → anomaly check → AR aging summary → bookkeeper-ready package. Drops review queue ranked by AI confidence (low confidence = manual review first). Skips inventory + payroll-specific steps that don\'t apply to service clients.',
    icon: Calendar,
    category: 'close',
    estimatedSavingsMinutes: 45,
    unlocksAt: 0,
    unlockHint: 'Works from day one. Improves with each correction you make (Loop 2+).',
    buildEffortDays: 2,
    status: 'stub',
  },
  {
    id: 'month-end-close-retail',
    label: 'Month-end close — retail / inventory',
    description: 'Reconcile + COGS adjustment + inventory true-up for retail clients.',
    detail: 'Adds inventory adjustment AJE templates + sales-tax reconciliation on top of the service-business pipeline. Flags large COGS swings vs. prior month.',
    icon: Receipt,
    category: 'close',
    estimatedSavingsMinutes: 60,
    unlocksAt: 0,
    unlockHint: 'Works from day one for the deterministic steps. Inventory-trend flags need Loop 3+.',
    buildEffortDays: 3,
    status: 'planned',
  },
  {
    id: 'month-end-close-payroll',
    label: 'Month-end close — payroll-heavy',
    description: 'Payroll accrual + tax-liability true-up + benefit reconciliation.',
    detail: 'Pulls payroll register, books accrued-payroll + payroll-tax-liability + benefits accrual AJEs. Reconciles cash payments to liability balances.',
    icon: Briefcase,
    category: 'close',
    estimatedSavingsMinutes: 50,
    unlocksAt: 0,
    unlockHint: 'Needs payroll register upload. No flywheel data required.',
    buildEffortDays: 3,
    status: 'planned',
  },
  {
    id: 'year-end-close',
    label: 'Year-end close (December)',
    description: 'Close-the-books December workflow + 1099 prep + retained-earnings rollover.',
    detail: 'Runs all month-end close work + 1099 vendor identification + RE rollover entries + lock prior-period adjustments.',
    icon: FileCheck,
    category: 'close',
    estimatedSavingsMinutes: 120,
    unlocksAt: 0,
    unlockHint: 'No data dependency — runs whenever you trigger it.',
    buildEffortDays: 3,
    status: 'planned',
  },

  // ── TAX (data prep only — no advice per LEGAL_GUARDRAILS.md) ──────────
  {
    id: 'quarterly-tax-data-prep',
    label: 'Quarterly tax — DATA PREP ONLY',
    description: 'Compile Q1-Q4 data for client\'s tax preparer. No advice, no estimate.',
    detail: 'Aggregates quarterly P&L + cash flow + estimated income. Outputs a CSV the client (or their tax pro) can use. NEVER produces "you owe $X" or "make Y election" — LEGAL_GUARDRAILS.md Level 3 territory.',
    icon: ClipboardList,
    category: 'tax',
    estimatedSavingsMinutes: 30,
    unlocksAt: 0,
    unlockHint: 'Works with at least one month of transactions.',
    buildEffortDays: 2,
    status: 'planned',
  },
  {
    id: '1099-prep',
    label: '1099 prep — vendors ≥ $600 threshold',
    description: 'Identify all vendors paid ≥ $600 in the year. Produce 1099-NEC / 1099-MISC issuance list.',
    detail: 'Scans the year\'s vendor payments. Groups by recipient. Surfaces vendors crossing the $600 threshold. Outputs the list ready for tax-form filing. Year-keyed thresholds (NOT hardcoded — pulled from per-year table per bug-checklist.md Bug 3).',
    icon: FileCheck,
    category: 'tax',
    estimatedSavingsMinutes: 90,
    unlocksAt: 0,
    unlockHint: 'Works with at least 6 months of transactions.',
    buildEffortDays: 2,
    status: 'planned',
  },

  // ── COMPLIANCE / AUDIT ────────────────────────────────────────────────
  {
    id: 'audit-prep-packet',
    label: 'Audit prep packet',
    description: 'Generate everything an auditor will ask for: trial balance, GL, reconciliations, schedules, signed engagement letters.',
    detail: 'Compiles trial balance + general ledger + bank reconciliations + AR/AP aging + fixed asset schedule + signed engagement letters + audit trail of every AJE for the period.',
    icon: ShieldCheck,
    category: 'audit',
    estimatedSavingsMinutes: 180,
    unlocksAt: 0,
    unlockHint: 'Runs against whatever you have. More complete data = more complete packet.',
    buildEffortDays: 4,
    status: 'planned',
  },
  {
    id: 'recon-troubleshoot',
    label: 'Reconciliation troubleshoot',
    description: 'Find the off-by-$X delta. Diff bank → ledger → source docs across the period.',
    detail: 'Three-way reconciliation: bank statement totals vs. ledger entries vs. source-doc parsed totals. Surfaces every unmatched transaction with the most likely missing-row hypothesis.',
    icon: Search,
    category: 'audit',
    estimatedSavingsMinutes: 60,
    unlocksAt: 0,
    unlockHint: 'Needs at least one bank statement + ledger export for the period.',
    buildEffortDays: 3,
    status: 'planned',
  },
  {
    id: 'ar-aging-review',
    label: 'AR aging review',
    description: 'Surface overdue invoices, flag high-risk receivables, summarize collection priorities.',
    detail: 'Pulls AR aging buckets (0-30, 31-60, 61-90, 90+). Flags vendors with rising balance + slowing payment cadence. Outputs a follow-up call list ranked by $$ at risk.',
    icon: AlertTriangle,
    category: 'audit',
    estimatedSavingsMinutes: 25,
    unlocksAt: 2,
    unlockHint: 'Needs 2 prior monthly close cycles to compute payment-cadence trends honestly.',
    buildEffortDays: 2,
    status: 'planned',
  },

  // ── ONBOARDING ────────────────────────────────────────────────────────
  {
    id: 'new-client-onboarding',
    label: 'New client onboarding',
    description: 'Intake + first reconciliation + baseline categorization rules from prior books.',
    detail: 'Intake form → opening-balances import → first reconciliation against existing books → categorization-rule baseline (learns from how the prior bookkeeper categorized similar vendors). Sends client their engagement letter + portal credentials.',
    icon: Building,
    category: 'onboarding',
    estimatedSavingsMinutes: 90,
    unlocksAt: 0,
    unlockHint: 'Designed for the brand-new client. No prior data needed.',
    buildEffortDays: 4,
    status: 'planned',
  },

  // ── BACKEND / RECURRING ──────────────────────────────────────────────
  {
    id: 'recurring-aje-batch',
    label: 'Recurring AJE batch generate',
    description: 'Auto-generate this month\'s candidates from recurring templates. NEVER auto-posts.',
    detail: 'Reads recurring_journal_templates → produces AJE candidates for the close period → drops into review queue. Diff alerts on any candidate that strays >5% from its historical pattern (per data-flywheel.md §15).',
    icon: TrendingUp,
    category: 'close',
    estimatedSavingsMinutes: 30,
    unlocksAt: 1,
    unlockHint: 'Needs at least one AJE template defined for this client.',
    buildEffortDays: 5,
    status: 'planned',
  },

  // ── COMMS ────────────────────────────────────────────────────────────
  {
    id: 'client-meeting-qa',
    label: 'Client meeting Q&A pack',
    description: 'Generate a 1-page brief for your next meeting: trends, open items, questions to ask.',
    detail: 'Pulls this client\'s last 90 days of activity + open items + anomaly summary + AR aging snapshot. Generates the 5 most-likely-to-come-up topics with citations to source rows. Bookkeeper walks in prepared.',
    icon: Mail,
    category: 'comms',
    estimatedSavingsMinutes: 20,
    unlocksAt: 1,
    unlockHint: 'Better with more history. Works with one month of data.',
    buildEffortDays: 3,
    status: 'planned',
  },
]

/** Workflow categories with display metadata. */
export const WORKFLOW_CATEGORIES = {
  close: { label: 'Close',         color: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  tax: { label: 'Tax data prep',   color: 'bg-amber-50 text-amber-700 ring-amber-200' },
  compliance: { label: 'Compliance', color: 'bg-purple-50 text-purple-700 ring-purple-200' },
  onboarding: { label: 'Onboarding', color: 'bg-blue-50 text-blue-700 ring-blue-200' },
  audit: { label: 'Audit',         color: 'bg-rose-50 text-rose-700 ring-rose-200' },
  comms: { label: 'Communications', color: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
} as const

/** Lookup a workflow by id. Returns null if not found. */
export function getWorkflow(id: string): WorkflowDef | null {
  return WORKFLOWS.find(w => w.id === id) ?? null
}

/** Filter workflows by category. */
export function workflowsByCategory(category: WorkflowDef['category']): WorkflowDef[] {
  return WORKFLOWS.filter(w => w.category === category)
}

/** Group all workflows by their category for UI rendering. */
export function workflowsGroupedByCategory(): Record<WorkflowDef['category'], WorkflowDef[]> {
  const groups: Record<string, WorkflowDef[]> = {}
  for (const w of WORKFLOWS) {
    if (!groups[w.category]) groups[w.category] = []
    groups[w.category].push(w)
  }
  return groups as Record<WorkflowDef['category'], WorkflowDef[]>
}
