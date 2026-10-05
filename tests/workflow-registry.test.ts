import { describe, it, expect } from 'vitest'
import {
  WORKFLOWS,
  WORKFLOW_CATEGORIES,
  getWorkflow,
  workflowsByCategory,
  workflowsGroupedByCategory,
} from '../src/lib/workflows/registry'

describe('workflow registry', () => {
  it('has at least 10 workflows (V1.1 scope minimum)', () => {
    expect(WORKFLOWS.length).toBeGreaterThanOrEqual(10)
  })

  it('every workflow has a stable kebab-case id', () => {
    const seen = new Set<string>()
    for (const w of WORKFLOWS) {
      expect(w.id).toMatch(/^[a-z0-9-]+$/)
      expect(seen.has(w.id)).toBe(false)
      seen.add(w.id)
    }
  })

  it('every workflow declares a category that exists in WORKFLOW_CATEGORIES', () => {
    const validCategories = Object.keys(WORKFLOW_CATEGORIES)
    for (const w of WORKFLOWS) {
      expect(validCategories).toContain(w.category)
    }
  })

  it('every workflow has positive estimated savings (no zero-value workflows)', () => {
    for (const w of WORKFLOWS) {
      expect(w.estimatedSavingsMinutes).toBeGreaterThan(0)
    }
  })

  it('every locked workflow (unlocksAt > 0) has an honest unlockHint', () => {
    for (const w of WORKFLOWS) {
      if (w.unlocksAt > 0) {
        expect(w.unlockHint.length).toBeGreaterThan(20)
      }
    }
  })

  it('getWorkflow returns workflow by id, null for unknown', () => {
    expect(getWorkflow('month-end-close-service')).not.toBeNull()
    expect(getWorkflow('nonexistent-workflow')).toBeNull()
  })

  it('workflowsByCategory returns only that category', () => {
    const closeWorkflows = workflowsByCategory('close')
    expect(closeWorkflows.length).toBeGreaterThan(0)
    for (const w of closeWorkflows) {
      expect(w.category).toBe('close')
    }
  })

  it('workflowsGroupedByCategory groups every workflow into its category', () => {
    const groups = workflowsGroupedByCategory()
    const totalGrouped = Object.values(groups).reduce((s, ws) => s + ws.length, 0)
    expect(totalGrouped).toBe(WORKFLOWS.length)
  })

  it('honesty check: no workflow promises advice/recommendations (LEGAL_GUARDRAILS.md)', () => {
    // Forbid words that would put the workflow into Level 3 territory.
    const forbidden = /you should|file form|adjust your|recommended to|consider deducting/i
    for (const w of WORKFLOWS) {
      expect(forbidden.test(w.description)).toBe(false)
      expect(forbidden.test(w.detail)).toBe(false)
    }
  })

  it('honesty check: tax-related workflows explicitly say "data prep only"', () => {
    const taxWorkflows = workflowsByCategory('tax')
    for (const w of taxWorkflows) {
      const combined = `${w.label} ${w.description} ${w.detail}`
      // Each tax workflow must either be 1099 prep (statutory facts only) or
      // explicitly mark itself "data only / no advice"
      const isStatutoryFactsOnly = /1099/i.test(w.label)
      const isDataOnlyDisclosed = /data prep|no advice|data only|DATA PREP ONLY/i.test(combined)
      expect(isStatutoryFactsOnly || isDataOnlyDisclosed).toBe(true)
    }
  })
})
