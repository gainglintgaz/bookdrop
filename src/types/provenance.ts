// src/types/provenance.ts
// Universal provenance metadata. Every AI-generated claim in BookDrop carries
// a ProvenanceData payload that explains what produced it. The Provenance
// component renders this as a click-to-source badge.
//
// Aligned with:
//   - .claude/rules/ai-first-principles.md §5 (anti-fabrication: every output
//     has verifiable evidence)
//   - .claude/rules/data-flywheel.md §8.2 (substring validator) — popover
//     content cited from real data, not invented
//   - DATA_FLYWHEEL.md §F (BookDrop anti-fabrication checks)

/** What kind of evidence produced this claim. */
export type ProvenanceSourceType =
  /** A deterministic rule (vendor mapping, regex, threshold). Highest trust. */
  | 'rule'
  /** A learned correction from this firm's past behavior. Compounds over loops. */
  | 'correction'
  /** A computed aggregate from N data points (subject to k=N suppression). */
  | 'aggregate'
  /** An LLM call (Gemini, Claude, etc.) — should always include a confidence. */
  | 'llm'
  /** A pure math/threshold computation (z-score, ratio, sum). */
  | 'computed'
  /** An industry baseline shown during cold-start (Loop 0). Lowest trust. */
  | 'baseline'

/** Confidence either as a tier or as a 0-1 score. */
export type ProvenanceConfidence = 'high' | 'medium' | 'low' | number

/** A clickable citation pointing back to a source the user can verify. */
export interface ProvenanceCitation {
  label: string
  href?: string
  /** Extra context shown beneath the label (e.g., "Bank txn #123 · 2026-04-15"). */
  meta?: string
}

/** Sample-size disclosure for aggregates. Drives k=N gating. */
export interface ProvenanceSampleSize {
  observed: number
  /** If `observed < threshold`, render as LOCKED — never expose the aggregate. */
  threshold?: number
}

/**
 * The shape every AI output should attach to make its reasoning auditable.
 * Engines populate this either inline or via an adapter at the panel render site.
 */
export interface ProvenanceData {
  type: ProvenanceSourceType
  /** One-liner shown in the badge tooltip and popover header. */
  summary: string
  /** Longer explanation rendered in the popover body. Optional. */
  detail?: string
  /** Always include for LLM source; usually include for aggregates and rules. */
  confidence?: ProvenanceConfidence
  /** Click-through links to source rows / source rules / source documents. */
  citations?: ProvenanceCitation[]
  /** For aggregate types: how many data points + the k=N gate. */
  sampleSize?: ProvenanceSampleSize
  /** For computed types: the formula, e.g., "(txAmount - mean) / stdDev". */
  formula?: string
}

/** True if a ProvenanceData with `type='aggregate'` should be locked behind k=N. */
export function isLockedByThreshold(p: ProvenanceData): boolean {
  if (p.type !== 'aggregate') return false
  if (!p.sampleSize?.threshold) return false
  return p.sampleSize.observed < p.sampleSize.threshold
}

/** Friendly label per source type, for the badge UI. */
export function provenanceLabel(type: ProvenanceSourceType): string {
  switch (type) {
    case 'rule': return 'Rule'
    case 'correction': return 'Learned'
    case 'aggregate': return 'Aggregate'
    case 'llm': return 'AI'
    case 'computed': return 'Computed'
    case 'baseline': return 'Baseline'
  }
}
