import { describe, it, expect } from 'vitest'
import {
  parseStatementFromLines,
  isPdfFilename,
} from '../src/lib/parse-statement-from-lines'

describe('parseStatementFromLines', () => {
  it('returns empty for no lines', () => {
    const s = parseStatementFromLines([])
    expect(s.transactions).toHaveLength(0)
    expect(s.totalDebits).toBe(0)
  })

  it('extracts date + amount bank lines', () => {
    const lines = [
      'Chase Business Checking',
      'Beginning Balance $1,000.00',
      '04/01 OFFICE DEPOT #1234 $45.67 $954.33',
      '04/02 ACME SOFTWARE INC $120.00 $834.33',
      'Ending Balance $834.33',
    ]
    const s = parseStatementFromLines(lines, 1)
    expect(s.bankName).toBe('Chase')
    expect(s.transactions.length).toBeGreaterThanOrEqual(2)
    expect(s.transactions[0].date).toBe('04/01')
    expect(s.transactions[0].description.toLowerCase()).toContain('office')
    expect(s.openingBalance).toBe(1000)
    expect(s.closingBalance).toBe(834.33)
    expect(s.pageCount).toBe(1)
  })

  it('never fabricates when only headers present', () => {
    const s = parseStatementFromLines(['Date Description Amount', 'Thank you for banking with us'])
    expect(s.transactions).toHaveLength(0)
  })
})

describe('isPdfFilename', () => {
  it('detects pdf extension case-insensitively', () => {
    expect(isPdfFilename('stmt.PDF')).toBe(true)
    expect(isPdfFilename('stmt.csv')).toBe(false)
  })
})
