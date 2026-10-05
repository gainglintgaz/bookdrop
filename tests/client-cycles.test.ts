import { describe, it, expect } from 'vitest'
import {
  buildPeriodSnapshots,
  countCompletedCycles,
  completionDaysFromSnapshots,
  summarizeClientCycles,
  listLookbackPeriods,
  getReminderPersonalizationState,
} from '../src/lib/client-cycles'

const reqs = [
  { id: 'r1', required: true },
  { id: 'r2', required: true },
  { id: 'r3', required: false },
]

describe('listLookbackPeriods', () => {
  it('walks backward across year boundary', () => {
    const p = listLookbackPeriods(2026, 1, 3)
    expect(p).toEqual([
      { year: 2026, month: 1 },
      { year: 2025, month: 12 },
      { year: 2025, month: 11 },
    ])
  })
})

describe('buildPeriodSnapshots', () => {
  it('marks complete when all required reqs have uploads', () => {
    const snaps = buildPeriodSnapshots({
      requirements: reqs,
      endYear: 2026,
      endMonth: 7,
      lookbackMonths: 2,
      uploads: [
        { requirement_id: 'r1', period_year: 2026, period_month: 7, uploaded_at: '2026-07-04T12:00:00Z' },
        { requirement_id: 'r2', period_year: 2026, period_month: 7, uploaded_at: '2026-07-05T12:00:00Z' },
        { requirement_id: 'r1', period_year: 2026, period_month: 6, uploaded_at: '2026-06-03T12:00:00Z' },
        // missing r2 in June → incomplete
      ],
    })
    const jul = snaps.find(s => s.month === 7)!
    const jun = snaps.find(s => s.month === 6)!
    expect(jul.complete).toBe(true)
    expect(jul.completionDay).toBe(5) // latest required upload day (UTC)
    expect(jun.complete).toBe(false)
    expect(countCompletedCycles(snaps)).toBe(1)
  })

  it('counts multi-period complete cycles for Loop 2 unlock', () => {
    const snaps = buildPeriodSnapshots({
      requirements: reqs,
      endYear: 2026,
      endMonth: 7,
      lookbackMonths: 3,
      uploads: [
        { requirement_id: 'r1', period_year: 2026, period_month: 7, uploaded_at: '2026-07-04T00:00:00Z' },
        { requirement_id: 'r2', period_year: 2026, period_month: 7, uploaded_at: '2026-07-04T00:00:00Z' },
        { requirement_id: 'r1', period_year: 2026, period_month: 6, uploaded_at: '2026-06-03T00:00:00Z' },
        { requirement_id: 'r2', period_year: 2026, period_month: 6, uploaded_at: '2026-06-03T00:00:00Z' },
        { requirement_id: 'r1', period_year: 2026, period_month: 5, uploaded_at: '2026-05-10T00:00:00Z' },
        { requirement_id: 'r2', period_year: 2026, period_month: 5, uploaded_at: '2026-05-10T00:00:00Z' },
      ],
    })
    const summary = summarizeClientCycles(snaps)
    expect(summary.loopCount).toBe(3)
    expect(summary.reminderGate.unlocked).toBe(true)
    expect(summary.preferredDay?.day).toBe(4) // median of 4,3,10
    expect(completionDaysFromSnapshots(snaps)).toEqual(expect.arrayContaining([4, 3, 10]))
  })

  it('ignores optional-only uploads for completeness', () => {
    const snaps = buildPeriodSnapshots({
      requirements: reqs,
      endYear: 2026,
      endMonth: 7,
      lookbackMonths: 1,
      uploads: [
        { requirement_id: 'r3', period_year: 2026, period_month: 7, uploaded_at: '2026-07-01T00:00:00Z' },
      ],
    })
    expect(snaps[0].complete).toBe(false)
    expect(snaps[0].uploadedRequiredDocs).toBe(0)
  })

  it('does not invent preferred day when locked', () => {
    const snaps = buildPeriodSnapshots({
      requirements: reqs,
      endYear: 2026,
      endMonth: 7,
      lookbackMonths: 1,
      uploads: [
        { requirement_id: 'r1', period_year: 2026, period_month: 7, uploaded_at: '2026-07-04T00:00:00Z' },
        { requirement_id: 'r2', period_year: 2026, period_month: 7, uploaded_at: '2026-07-04T00:00:00Z' },
      ],
    })
    const summary = summarizeClientCycles(snaps)
    expect(summary.loopCount).toBe(1)
    expect(summary.reminderGate.unlocked).toBe(false)
    expect(summary.preferredDay).toBeNull()
    expect(getReminderPersonalizationState(1).unlocked).toBe(false)
  })
})
