// src/components/practitioner/WorkflowLibraryPanel.tsx
//
// V1.1 — Renders the workflow registry as a CPA-facing panel.
//
// Per data-flywheel.md §4 and ai-first-principles.md §3, workflows that
// aren't yet wired show their LOCKED state with honest "still being built"
// copy — never a fake "click to run" button that produces no output.

import { useState } from 'react'
import {
  Play, Lock, ChevronDown, ChevronUp, Clock, Zap, Hammer,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WORKFLOWS,
  WORKFLOW_CATEGORIES,
  workflowsGroupedByCategory,
  type WorkflowDef,
} from '@/lib/workflows/registry'

interface Props {
  /** Optional: prefilter to one category. Pass undefined for "all". */
  category?: WorkflowDef['category']
  /** Called when bookkeeper clicks a live workflow. Receives the workflow def. */
  onRunWorkflow?: (workflow: WorkflowDef) => void
}

export function WorkflowLibraryPanel({ category, onRunWorkflow }: Props) {
  const groups = workflowsGroupedByCategory()
  const visibleCategories = category
    ? [category]
    : (Object.keys(groups) as Array<WorkflowDef['category']>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Workflow library</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Pre-built CPA orchestrations. Each runs the underlying engines in the right order so you don't have to.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">
            <Zap className="h-3 w-3" />
            {WORKFLOWS.filter(w => w.status === 'live').length} live
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200">
            <Hammer className="h-3 w-3" />
            {WORKFLOWS.filter(w => w.status === 'stub').length} preview
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-gray-600 ring-1 ring-gray-200">
            <Lock className="h-3 w-3" />
            {WORKFLOWS.filter(w => w.status === 'planned').length} planned
          </span>
        </div>
      </div>

      {/* Category groups */}
      {visibleCategories.map(cat => {
        const items = groups[cat] ?? []
        if (items.length === 0) return null
        const catMeta = WORKFLOW_CATEGORIES[cat]
        return (
          <div key={cat}>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <span className={cn('rounded-full px-2 py-0.5 ring-1', catMeta.color)}>{catMeta.label}</span>
              <span className="text-gray-400">{items.length}</span>
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map(w => (
                <WorkflowCard key={w.id} workflow={w} onRun={onRunWorkflow} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface CardProps {
  workflow: WorkflowDef
  onRun?: (workflow: WorkflowDef) => void
}

function WorkflowCard({ workflow, onRun }: CardProps) {
  const [expanded, setExpanded] = useState(false)
  const w = workflow

  const StatusIcon = w.status === 'live' ? Zap : w.status === 'stub' ? Hammer : Lock
  const statusColor =
    w.status === 'live' ? 'text-emerald-600' :
    w.status === 'stub' ? 'text-amber-600' :
    'text-gray-400'
  const statusLabel =
    w.status === 'live' ? 'Live' :
    w.status === 'stub' ? 'Preview' :
    'Planned'

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <button
        type="button"
        className="flex w-full items-start gap-3 text-left"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls={`wf-detail-${w.id}`}
      >
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
          <w.icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-gray-900">{w.label}</p>
            <span className={cn('inline-flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide', statusColor)}>
              <StatusIcon className="h-3 w-3" />
              {statusLabel}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{w.description}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-400">
            <span className="inline-flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              saves ~{w.estimatedSavingsMinutes} min
            </span>
            {w.unlocksAt > 0 && (
              <span>· unlocks after {w.unlocksAt} cycle{w.unlocksAt === 1 ? '' : 's'}</span>
            )}
            <span className="ml-auto text-gray-300">{expanded ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div id={`wf-detail-${w.id}`} className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs leading-relaxed text-gray-600">{w.detail}</p>

          {/* Unlock hint */}
          <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
            <strong className="text-gray-700">When this works:</strong> {w.unlockHint}
          </div>

          {/* Action button */}
          <div className="mt-3 flex items-center justify-end gap-2">
            {w.status === 'live' && onRun && (
              <button
                type="button"
                onClick={() => onRun(w)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
              >
                <Play className="h-3 w-3" />
                Run workflow
              </button>
            )}
            {w.status === 'stub' && (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
                title="Preview only — no executor runs. Nothing is simulated as success."
              >
                <Hammer className="h-3 w-3" />
                Preview only (not runnable)
              </span>
            )}
            {w.status === 'planned' && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500">
                <Lock className="h-3 w-3" />
                Coming in V1.1 ({w.buildEffortDays} day build)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
