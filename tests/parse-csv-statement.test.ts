import { describe, it, expect } from 'vitest'
import { parseCSVText, isCsvFilename } from '../src/lib/parse-csv-statement'

const SAMPLE = `Date,Description,Amount
2026-07-01,AWS SERVICES,-49.99
2026-07-02,CLIENT PAYMENT,1200.00
2026-07-03,OFFICE DEPOT,-32.10
`

describe('parseCSVText', () => {
  it('parses transactions and totals', () => {
    const s = parseCSVText(SAMPLE)
    expect(s.transactions).toHaveLength(3)
    expect(s.totalDebits).toBeCloseTo(82.09, 1)
    expect(s.totalCredits).toBeCloseTo(1200, 1)
    expect(s.transactions[0].category).toBeTruthy()
  })

  it('returns empty on garbage (no fabrication)', () => {
    const s = parseCSVText('not,a,statement\nfoo,bar,baz')
    expect(s.transactions).toHaveLength(0)
  })

  it('detects csv filenames', () => {
    expect(isCsvFilename('chase.csv')).toBe(true)
    expect(isCsvFilename('stmt.PDF')).toBe(false)
  })
})
