import { describe, it, expect } from 'vitest'
import {
  toCents,
  fromCents,
  formatCurrency,
  generatePortalToken,
  formatMonth,
  formatPeriod,
  formatFileSize,
  getCurrentPeriod,
} from '../src/lib/utils'

describe('toCents / fromCents', () => {
  it('converts dollars to cents', () => {
    expect(toCents(39.99)).toBe(3999)
    expect(toCents(0)).toBe(0)
    expect(toCents(100)).toBe(10000)
  })

  it('handles floating point correctly', () => {
    expect(toCents(0.1 + 0.2)).toBe(30) // Math.round avoids 0.30000000000000004
  })

  it('converts cents to dollars', () => {
    expect(fromCents(3999)).toBe(39.99)
    expect(fromCents(0)).toBe(0)
    expect(fromCents(10000)).toBe(100)
  })

  it('roundtrips correctly', () => {
    expect(fromCents(toCents(79.99))).toBe(79.99)
  })
})

describe('formatCurrency', () => {
  it('formats cents as USD', () => {
    expect(formatCurrency(3900)).toBe('$39.00')
    expect(formatCurrency(7999)).toBe('$79.99')
    expect(formatCurrency(0)).toBe('$0.00')
  })
})

describe('generatePortalToken', () => {
  it('generates a 12-character token', () => {
    const token = generatePortalToken()
    expect(token).toHaveLength(12)
  })

  it('generates URL-safe characters only', () => {
    const token = generatePortalToken()
    expect(token).toMatch(/^[A-Za-z0-9]+$/)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generatePortalToken()))
    expect(tokens.size).toBe(100)
  })
})

describe('formatMonth', () => {
  it('formats month numbers to names', () => {
    expect(formatMonth(1)).toBe('January')
    expect(formatMonth(4)).toBe('April')
    expect(formatMonth(12)).toBe('December')
  })
})

describe('formatPeriod', () => {
  it('formats year + month as readable string', () => {
    expect(formatPeriod(2026, 4)).toBe('April 2026')
    expect(formatPeriod(2025, 12)).toBe('December 2025')
  })
})

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1048576)).toBe('1.0 MB')
    expect(formatFileSize(5242880)).toBe('5.0 MB')
  })
})

describe('getCurrentPeriod', () => {
  it('returns current year and month', () => {
    const { year, month } = getCurrentPeriod()
    const now = new Date()
    expect(year).toBe(now.getFullYear())
    expect(month).toBe(now.getMonth() + 1)
  })
})
