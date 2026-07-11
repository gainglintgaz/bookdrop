// PlaybookEditorPanel.tsx — Phase 4 editable playbooks.
// Compose only allowlisted steps. Soft-delete. Run produces audit trail.

import { useCallback, useEffect, useState } from 'react'
import {
  BookOpen, ChevronDown, ChevronUp, Loader2, Play, Plus, Trash2, ListOrdered,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PLAYBOOK_STEP_CATALOG,
  type PlaybookStepId,
} from '@/lib/workflows/playbook-steps'
import {
  createPlaybook,
  listPlaybooks,
  listRecentRuns,
  softDeletePlaybook,
  updatePlaybook,
  type WorkflowPlaybook,
  type WorkflowRun,
} from '@/lib/workflows/playbooks'
import { executePlaybook } from '@/lib/workflows/run-playbook'
import type { WorkflowExecuteContext } from '@/lib/workflows/execute'
import type { WorkflowResult } from '@/lib/workflow-engine'

interface Props {
  bookkeeperId: string
  clientId: string
  clientName: string
  period: { year: number; month: number }
  /** Same context as month-end close executor. */
  executeCtx: WorkflowExecuteContext
  onResult?: (result: WorkflowResult) => void
  onError?: (message: string) => void
}

export function PlaybookEditorPanel({
  bookkeeperId,
  clientId,
  clientName,
  period,
  executeCtx,
  onResult,
  onError,
}: Props) {
  const [playbooks, setPlaybooks] = useState<WorkflowPlaybook[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftSteps, setDraftSteps] = useState<PlaybookStepId[]>([
    'extract_map',
    'categorize',
    'completeness',
    'package_draft',
  ])
  const [editSteps, setEditSteps] = useState<PlaybookStepId[]>([])
  const [localError, setLocalError] = useState<string | null>(null)

  const selected = playbooks.find(p => p.id === selectedId) ?? null

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [list, recent] = await Promise.all([
        listPlaybooks(bookkeeperId),
        listRecentRuns({ bookkeeperId, clientId, limit: 8 }),
      ])
      setPlaybooks(list)
      setRuns(recent)
      setSelectedId(prev => {
        if (prev && list.some(p => p.id === prev)) return prev
        const def = list.find(p => p.is_default) ?? list[0]
        return def?.id ?? null
      })
    } catch (err) {
      console.error('[PlaybookEditorPanel] refresh failed:', err)
      setLocalError(err instanceof Error ? err.message : 'Failed to load playbooks')
    } finally {
      setLoading(false)
    }
  }, [bookkeeperId, clientId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (selected) setEditSteps([...selected.step_ids])
  }, [selected?.id, selected?.step_ids])

  function moveStep(list: PlaybookStepId[], index: number, dir: -1 | 1): PlaybookStepId[] {
    const next = [...list]
    const j = index + dir
    if (j < 0 || j >= next.length) return next
    ;[next[index], next[j]] = [next[j], next[index]]
    return next
  }

  function toggleDraftStep(id: PlaybookStepId) {
    setDraftSteps(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id],
    )
  }

  function toggleEditStep(id: PlaybookStepId) {
    setEditSteps(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id],
    )
  }

  async function handleCreate() {
    setSaving(true)
    setLocalError(null)
    const res = await createPlaybook({
      bookkeeperId,
      name: draftName || 'Custom close playbook',
      description: 'User-composed from allowlisted engines only.',
      stepIds: draftSteps,
    })
    setSaving(false)
    if (!res.ok) {
      setLocalError(res.error)
      onError?.(res.error)
      return
    }
    setShowCreate(false)
    setDraftName('')
    await refresh()
    setSelectedId(res.playbook.id)
  }

  async function handleSaveOrder() {
    if (!selected) return
    setSaving(true)
    setLocalError(null)
    const res = await updatePlaybook({
      bookkeeperId,
      playbookId: selected.id,
      stepIds: editSteps,
    })
    setSaving(false)
    if (!res.ok) {
      setLocalError(res.error)
      onError?.(res.error)
      return
    }
    await refresh()
  }

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(`Soft-delete playbook "${selected.name}"? Past runs stay in the audit log.`)) {
      return
    }
    setSaving(true)
    setLocalError(null)
    const res = await softDeletePlaybook({
      bookkeeperId,
      playbookId: selected.id,
    })
    setSaving(false)
    if (!res.ok) {
      setLocalError(res.error)
      onError?.(res.error)
      return
    }
    await refresh()
  }

  async function handleRun() {
    if (!selected) return
    setRunning(true)
    setLocalError(null)
    try {
      // Persist current editor order before run if dirty
      const stepsChanged =
        editSteps.length !== selected.step_ids.length ||
        editSteps.some((s, i) => s !== selected.step_ids[i])
      let playbook = selected
      if (stepsChanged) {
        const updated = await updatePlaybook({
          bookkeeperId,
          playbookId: selected.id,
          stepIds: editSteps,
        })
        if (!updated.ok) {
          setLocalError(updated.error)
          onError?.(updated.error)
          return
        }
        playbook = updated.playbook
      }

      const outcome = await executePlaybook(playbook, {
        ...executeCtx,
        bookkeeperId,
        clientId,
        clientName,
        period,
      })
      if (!outcome.ok) {
        setLocalError(outcome.error)
        onError?.(outcome.error)
        if (outcome.result) onResult?.(outcome.result)
      } else {
        onResult?.(outcome.result)
      }
      const recent = await listRecentRuns({ bookkeeperId, clientId, limit: 8 })
      setRuns(recent)
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Playbook run failed'
      setLocalError(msg)
      onError?.(msg)
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading playbooks…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-primary" />
            Editable playbooks
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Compose close steps from the allowlist only. No free-typed tax actions. Runs are audited.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(s => !s)}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3 w-3" />
          New playbook
        </button>
      </div>

      {localError && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {localError}
        </p>
      )}

      {showCreate && (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-3">
          <label className="block text-xs font-medium text-gray-700">
            Name
            <input
              type="text"
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Light close — docs only"
              className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
            />
          </label>
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5">Steps (allowlist)</p>
            <div className="space-y-1">
              {PLAYBOOK_STEP_CATALOG.map(step => (
                <label
                  key={step.id}
                  className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 text-xs border border-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={draftSteps.includes(step.id)}
                    onChange={() => toggleDraftStep(step.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-gray-800">{step.label}</span>
                    <span className="block text-gray-500">{step.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || draftSteps.length === 0}
              onClick={() => void handleCreate()}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Playbook picker */}
      <div className="flex flex-wrap gap-2">
        {playbooks.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedId(p.id)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors',
              selectedId === p.id
                ? 'bg-primary text-white ring-primary'
                : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50',
            )}
          >
            {p.name}
            {p.is_default && <span className="ml-1 opacity-70">· default</span>}
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-900">{selected.name}</p>
              {selected.description && (
                <p className="mt-0.5 text-xs text-gray-500">{selected.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={running || editSteps.length === 0}
                onClick={() => void handleRun()}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {running ? 'Running…' : 'Run playbook'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                title="Soft-delete (runs retained)"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1">
              <ListOrdered className="h-3 w-3" />
              Step order
            </p>
            <div className="space-y-1">
              {editSteps.map((id, index) => {
                const def = PLAYBOOK_STEP_CATALOG.find(s => s.id === id)
                return (
                  <div
                    key={`${id}-${index}`}
                    className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2 py-1.5"
                  >
                    <span className="text-[10px] font-mono text-gray-400 w-4">{index + 1}</span>
                    <span className="flex-1 text-xs font-medium text-gray-800">
                      {def?.label ?? id}
                    </span>
                    <button
                      type="button"
                      aria-label="Move up"
                      onClick={() => setEditSteps(s => moveStep(s, index, -1))}
                      className="p-0.5 text-gray-400 hover:text-gray-700"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      onClick={() => setEditSteps(s => moveStep(s, index, 1))}
                      className="p-0.5 text-gray-400 hover:text-gray-700"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-gray-500">Add / remove from allowlist:</p>
              {PLAYBOOK_STEP_CATALOG.map(step => (
                <label key={step.id} className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={editSteps.includes(step.id)}
                    onChange={() => toggleEditStep(step.id)}
                  />
                  {step.label}
                </label>
              ))}
            </div>

            <button
              type="button"
              disabled={saving || editSteps.length === 0}
              onClick={() => void handleSaveOrder()}
              className="mt-2 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save step order'}
            </button>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1.5">Recent runs (this client)</p>
          <ul className="space-y-1.5">
            {runs.map(r => (
              <li
                key={r.id}
                className="rounded-md border border-gray-100 bg-white px-2.5 py-1.5 text-[11px] text-gray-600"
              >
                <span className="font-medium text-gray-800">{r.playbook_name}</span>
                <span className="mx-1.5 text-gray-300">·</span>
                <span
                  className={cn(
                    r.status === 'complete' && 'text-emerald-700',
                    r.status === 'partial' && 'text-amber-700',
                    r.status === 'failed' && 'text-red-700',
                  )}
                >
                  {r.status}
                </span>
                <span className="mx-1.5 text-gray-300">·</span>
                {r.period_year}-{String(r.period_month).padStart(2, '0')}
                <span className="mx-1.5 text-gray-300">·</span>
                {r.step_results.length} steps
                {r.readiness_score != null && (
                  <>
                    <span className="mx-1.5 text-gray-300">·</span>
                    readiness {r.readiness_score}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
