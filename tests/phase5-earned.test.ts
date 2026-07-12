import { describe, it, expect, beforeEach } from 'vitest'
import {
  __resetCategoryMemoryStore,
  recordCorrection,
  getLearnedCategory,
  getLearningStats,
  getClientCorrections,
} from '../src/lib/category-memory'
import {
  countCompletedCycles,
  getReminderPersonalizationState,
  inferPreferredSubmissionDay,
  REMINDER_PERSONALIZATION_UNLOCKS_AT,
} from '../src/lib/client-cycles'
import {
  meetsCohortFloor,
  cohortAggregateOrNull,
  cohortLockedCopy,
  DEFAULT_COHORT_FLOOR,
} from '../src/lib/aggregate-gate'

beforeEach(() => {
  __resetCategoryMemoryStore()
})

describe('per-client category memory', () => {
  it('does not bleed Client A corrections into Client B', () => {
    recordCorrection('client-a', 'STARBUCKS #123', 'Uncategorized', 'Meals')
    recordCorrection('client-b', 'STARBUCKS #999', 'Uncategorized', 'Office')

    expect(getLearnedCategory('client-a', 'POS STARBUCKS')?.category).toBe('Meals')
    expect(getLearnedCategory('client-b', 'POS STARBUCKS')?.category).toBe('Office')
    expect(getLearnedCategory('client-c', 'STARBUCKS')).toBeNull()
  })

  it('bumps confidence on repeat correction', () => {
    recordCorrection('c1', 'AWS SERVICES', 'Other', 'Software')
    recordCorrection('c1', 'AWS SERVICES', 'Other', 'Software')
    const learned = getLearnedCategory('c1', 'AWS SERVICES')
    expect(learned?.confidence).toBe(2)
    expect(getClientCorrections('c1')).toHaveLength(1)
  })

  it('stats are scoped when clientId provided', () => {
    recordCorrection('c1', 'VENDOR A', 'X', 'Travel')
    recordCorrection('c2', 'VENDOR B', 'X', 'Meals')
    expect(getLearningStats('c1').totalCorrections).toBe(1)
    expect(getLearningStats().totalCorrections).toBe(2)
    expect(getLearningStats().clientCount).toBe(2)
  })
})

describe('reminder personalization gate', () => {
  it('locks below Loop 2', () => {
    const s0 = getReminderPersonalizationState(0)
    const s1 = getReminderPersonalizationState(1)
    expect(s0.unlocked).toBe(false)
    expect(s1.unlocked).toBe(false)
    if (!s0.unlocked) expect(s0.lockedCopy).toMatch(/unlocks after 2/i)
  })

  it('unlocks at Loop 2+', () => {
    const s = getReminderPersonalizationState(REMINDER_PERSONALIZATION_UNLOCKS_AT)
    expect(s.unlocked).toBe(true)
  })

  it('never invents preferred day when locked', () => {
    expect(
      inferPreferredSubmissionDay({
        loopCount: 0,
        submissionDays: [3, 4, 5, 6],
      }),
    ).toBeNull()
  })

  it('returns median day when unlocked with enough samples', () => {
    const r = inferPreferredSubmissionDay({
      loopCount: 3,
      submissionDays: [2, 4, 10],
    })
    expect(r).not.toBeNull()
    expect(r?.day).toBe(4)
    expect(r?.dataBasis).toMatch(/Based on 3 complete months/)
  })

  it('counts completed cycles honestly', () => {
    expect(
      countCompletedCycles([
        {
          year: 2026, month: 1, requiredDocs: 2, uploadedRequiredDocs: 2,
          complete: true, completionDay: 4,
        },
        {
          year: 2026, month: 2, requiredDocs: 2, uploadedRequiredDocs: 1,
          complete: false, completionDay: null,
        },
        {
          year: 2026, month: 3, requiredDocs: 0, uploadedRequiredDocs: 0,
          complete: false, completionDay: null,
        },
      ]),
    ).toBe(1)
  })
})

describe('cross-firm cohort floor', () => {
  it('suppresses below k=5', () => {
    expect(meetsCohortFloor(4)).toBe(false)
    expect(cohortAggregateOrNull(4, 42)).toBeNull()
    expect(meetsCohortFloor(DEFAULT_COHORT_FLOOR)).toBe(true)
    expect(cohortAggregateOrNull(5, 42)).toBe(42)
    expect(cohortLockedCopy(2)).toMatch(/5\+/)
  })
})
