import { describe, it, expect } from 'vitest'
import { scoreClient, rankClients, type MonthlyData } from '../src/lib/client-scoring'

function makeMonth(overrides: Partial<MonthlyData> = {}): MonthlyData {
  return {
    year: 2026,
    month: 4,
    requiredDocs: 3,
    uploadedDocs: 3,
    onTime: true,
    remindersSent: 0,
    avgDaysToRespond: 0,
    parsedSuccessfully: 3,
    ...overrides,
  }
}

describe('scoreClient', () => {
  it('gives high score for perfect client', () => {
    const data = Array.from({ length: 6 }, (_, i) =>
      makeMonth({ month: i + 1 })
    )
    const score = scoreClient('c-1', 'Perfect Client', data)
    expect(score.overallScore).toBeGreaterThanOrEqual(90)
    expect(score.grade).toMatch(/^A/)
    expect(score.riskLevel).toBe('low')
  })

  it('gives low score for late, incomplete client', () => {
    const data = Array.from({ length: 6 }, (_, i) =>
      makeMonth({
        month: i + 1,
        uploadedDocs: 1,
        onTime: false,
        remindersSent: 3,
        avgDaysToRespond: 10,
        parsedSuccessfully: 0,
      })
    )
    const score = scoreClient('c-2', 'Bad Client', data)
    expect(score.overallScore).toBeLessThan(50)
    expect(score.riskLevel).toBe('high')
  })

  it('handles empty data with low score and risk factors', () => {
    const score = scoreClient('c-3', 'New Client', [])
    expect(score.overallScore).toBeLessThan(50)
    expect(['medium', 'high']).toContain(score.riskLevel)
    expect(score.riskFactors.length).toBeGreaterThan(0)
  })

  it('detects partial submissions', () => {
    const data = [
      makeMonth({ uploadedDocs: 2, requiredDocs: 3 }),
      makeMonth({ month: 3, uploadedDocs: 3, requiredDocs: 3 }),
    ]
    const score = scoreClient('c-4', 'Partial Client', data)
    expect(score.metrics.completenessRate).toBeLessThan(100)
    expect(score.metrics.completenessRate).toBeGreaterThan(0)
  })
})

describe('rankClients', () => {
  it('ranks multiple clients by overall score descending', () => {
    const goodData = Array.from({ length: 3 }, (_, i) =>
      makeMonth({ month: i + 1 })
    )
    const badData = Array.from({ length: 3 }, (_, i) =>
      makeMonth({ month: i + 1, uploadedDocs: 0, onTime: false, remindersSent: 4 })
    )
    const goodScore = scoreClient('c-good', 'Good Co', goodData)
    const badScore = scoreClient('c-bad', 'Bad Co', badData)
    const report = rankClients([goodScore, badScore])
    expect(report.rankings.length).toBe(2)
    expect(report.rankings[0].clientId).toBe('c-good')
    expect(report.rankings[1].clientId).toBe('c-bad')
    expect(report.insights.bestClient).toBe('Good Co')
    expect(report.insights.worstClient).toBe('Bad Co')
  })

  it('handles empty input', () => {
    const report = rankClients([])
    expect(report.rankings).toEqual([])
    expect(report.insights.avgScore).toBe(0)
  })
})
