import { describe, it, expect } from 'vitest'
import {
  ESIGN_DISCLOSURES,
  CURRENT_DISCLOSURE_VERSION,
  currentDisclosure,
  disclosureByVersion,
} from '../src/lib/esign-disclosures'

describe('ESIGN disclosure registry', () => {
  it('has at least one disclosure registered', () => {
    expect(Object.keys(ESIGN_DISCLOSURES).length).toBeGreaterThanOrEqual(1)
  })

  it('CURRENT_DISCLOSURE_VERSION resolves to a real entry', () => {
    expect(ESIGN_DISCLOSURES[CURRENT_DISCLOSURE_VERSION]).toBeDefined()
  })

  it('currentDisclosure() returns the active disclosure', () => {
    const d = currentDisclosure()
    expect(d.version).toBe(CURRENT_DISCLOSURE_VERSION)
    expect(d.label.length).toBeGreaterThan(5)
    expect(d.summary.length).toBeGreaterThan(20)
    expect(d.fullText.length).toBeGreaterThan(200)
  })

  it('every disclosure has all required fields', () => {
    for (const [key, d] of Object.entries(ESIGN_DISCLOSURES)) {
      expect(d.version).toBe(key) // version field must match map key
      expect(d.label).toBeTruthy()
      expect(d.summary).toBeTruthy()
      expect(d.fullText).toBeTruthy()
    }
  })

  it('every disclosure mentions ESIGN and UETA', () => {
    // Anti-fabrication: real ESIGN consent must reference the legal frameworks
    for (const d of Object.values(ESIGN_DISCLOSURES)) {
      expect(d.fullText).toMatch(/ESIGN/i)
      expect(d.fullText).toMatch(/UETA|Uniform Electronic Transactions/i)
    }
  })

  it('every disclosure includes paper-copy right + audit-record disclosure', () => {
    // ESIGN Act requires disclosure of paper-copy availability and audit-trail awareness
    for (const d of Object.values(ESIGN_DISCLOSURES)) {
      expect(d.fullText).toMatch(/paper copy/i)
      expect(d.fullText).toMatch(/audit/i)
    }
  })
})

describe('disclosureByVersion', () => {
  it('returns the disclosure for a known version', () => {
    const d = disclosureByVersion(CURRENT_DISCLOSURE_VERSION)
    expect(d).not.toBeNull()
    expect(d!.version).toBe(CURRENT_DISCLOSURE_VERSION)
  })

  it('returns null for unknown version', () => {
    expect(disclosureByVersion('esign-9999-12-31-vfake')).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(disclosureByVersion(null)).toBeNull()
    expect(disclosureByVersion(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(disclosureByVersion('')).toBeNull()
  })
})

describe('disclosure version stability (non-regression)', () => {
  it('disclosure versions are append-only stable identifiers (kebab + date format)', () => {
    // Every version id must follow the convention so we can sort + recognize them
    for (const version of Object.keys(ESIGN_DISCLOSURES)) {
      expect(version).toMatch(/^esign-\d{4}-\d{2}-\d{2}-v\d+$/)
    }
  })
})
