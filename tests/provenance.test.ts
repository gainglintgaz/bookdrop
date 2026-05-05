import { describe, it, expect } from 'vitest'
import {
  isLockedByThreshold,
  provenanceLabel,
  type ProvenanceData,
  type ProvenanceSourceType,
} from '../src/types/provenance'

describe('provenanceLabel', () => {
  const cases: Array<[ProvenanceSourceType, string]> = [
    ['rule', 'Rule'],
    ['correction', 'Learned'],
    ['aggregate', 'Aggregate'],
    ['llm', 'AI'],
    ['computed', 'Computed'],
    ['baseline', 'Baseline'],
  ]

  cases.forEach(([type, expected]) => {
    it(`labels ${type} as "${expected}"`, () => {
      expect(provenanceLabel(type)).toBe(expected)
    })
  })
})

describe('isLockedByThreshold (k=N enforcement)', () => {
  it('returns false for non-aggregate types', () => {
    const types: ProvenanceSourceType[] = ['rule', 'correction', 'llm', 'computed', 'baseline']
    types.forEach(type => {
      const data: ProvenanceData = {
        type,
        summary: 'test',
        sampleSize: { observed: 1, threshold: 10 },
      }
      expect(isLockedByThreshold(data)).toBe(false)
    })
  })

  it('returns false for aggregate without a threshold', () => {
    const data: ProvenanceData = {
      type: 'aggregate',
      summary: 'test',
      sampleSize: { observed: 3 },
    }
    expect(isLockedByThreshold(data)).toBe(false)
  })

  it('returns false for aggregate without sampleSize at all', () => {
    const data: ProvenanceData = {
      type: 'aggregate',
      summary: 'test',
    }
    expect(isLockedByThreshold(data)).toBe(false)
  })

  it('returns true when observed < threshold (k=N suppression fires)', () => {
    const data: ProvenanceData = {
      type: 'aggregate',
      summary: 'test',
      sampleSize: { observed: 3, threshold: 5 },
    }
    expect(isLockedByThreshold(data)).toBe(true)
  })

  it('returns false when observed equals threshold (boundary unlocks)', () => {
    const data: ProvenanceData = {
      type: 'aggregate',
      summary: 'test',
      sampleSize: { observed: 5, threshold: 5 },
    }
    expect(isLockedByThreshold(data)).toBe(false)
  })

  it('returns false when observed exceeds threshold', () => {
    const data: ProvenanceData = {
      type: 'aggregate',
      summary: 'test',
      sampleSize: { observed: 12, threshold: 5 },
    }
    expect(isLockedByThreshold(data)).toBe(false)
  })

  it('returns true at observed=0 (cold start always locked)', () => {
    const data: ProvenanceData = {
      type: 'aggregate',
      summary: 'test',
      sampleSize: { observed: 0, threshold: 5 },
    }
    expect(isLockedByThreshold(data)).toBe(true)
  })

  // The high-stakes anti-fabrication invariant from data-flywheel.md §4
  it('NEVER unlocks an aggregate below its declared threshold (anti-fabrication invariant)', () => {
    // Try every observed/threshold pair where observed < threshold
    const pairs: Array<[number, number]> = [
      [0, 1], [0, 5], [0, 10],
      [1, 2], [1, 5], [1, 10],
      [4, 5], [9, 10], [49, 50],
    ]
    pairs.forEach(([observed, threshold]) => {
      const data: ProvenanceData = {
        type: 'aggregate',
        summary: 'test',
        sampleSize: { observed, threshold },
      }
      expect(isLockedByThreshold(data)).toBe(true)
    })
  })
})
