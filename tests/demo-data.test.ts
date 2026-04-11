import { describe, it, expect } from 'vitest'
import {
  getDemoClients,
  getDemoClient,
  getDemoClientByToken,
  getDemoRequirementsWithUploads,
  getDemoReminderLogs,
  demoBookkeeper,
  demoSoloUser,
} from '../src/lib/demo-data'

describe('demoBookkeeper / demoSoloUser', () => {
  it('practitioner has correct account_type and no self_client_id', () => {
    expect(demoBookkeeper.account_type).toBe('practitioner')
    expect(demoBookkeeper.self_client_id).toBeNull()
  })

  it('solo user has correct account_type and self_client_id', () => {
    expect(demoSoloUser.account_type).toBe('solo')
    expect(demoSoloUser.self_client_id).toBe('client-solo-001')
  })
})

describe('getDemoClients', () => {
  it('returns only practitioner clients (not solo)', () => {
    const clients = getDemoClients()
    expect(clients.length).toBe(5)
    expect(clients.every(c => c.bookkeeper_id === demoBookkeeper.id)).toBe(true)
  })

  it('returns clients with computed submissionStatus', () => {
    const clients = getDemoClients()
    const statuses = clients.map(c => c.submissionStatus)
    expect(statuses).toContain('complete')
    expect(statuses).toContain('partial')
    expect(statuses).toContain('not_started')
  })

  it('each client has requirements array', () => {
    const clients = getDemoClients()
    clients.forEach(c => {
      expect(Array.isArray(c.requirements)).toBe(true)
      expect(c.requirements.length).toBeGreaterThan(0)
    })
  })
})

describe('getDemoClient', () => {
  it('returns a specific client by ID', () => {
    const client = getDemoClient('client-001')
    expect(client).not.toBeNull()
    expect(client!.business_name).toBe('Riverside Cafe')
  })

  it('returns the solo client by ID', () => {
    const client = getDemoClient('client-solo-001')
    expect(client).not.toBeNull()
    expect(client!.business_name).toBe('Acme Supplies LLC')
  })

  it('returns null for unknown ID', () => {
    expect(getDemoClient('nonexistent')).toBeNull()
  })
})

describe('getDemoClientByToken', () => {
  it('returns portal data for valid token', () => {
    const data = getDemoClientByToken('aB3xK9mP2qRt')
    expect(data).not.toBeNull()
    expect(data!.client.business_name).toBe('Riverside Cafe')
    expect(data!.bookkeeper.full_name).toBe(demoBookkeeper.full_name)
    expect(data!.requirements.length).toBeGreaterThan(0)
  })

  it('returns null for invalid token', () => {
    expect(getDemoClientByToken('invalid-token')).toBeNull()
  })
})

describe('getDemoRequirementsWithUploads', () => {
  it('returns requirements for a client', () => {
    const reqs = getDemoRequirementsWithUploads('client-001')
    expect(reqs.length).toBe(4) // Chase, Amex, Receipts, Gusto
    reqs.forEach(r => {
      expect(r.client_id).toBe('client-001')
      expect(Array.isArray(r.uploads)).toBe(true)
    })
  })

  it('returns empty array for unknown client', () => {
    expect(getDemoRequirementsWithUploads('nonexistent')).toEqual([])
  })

  it('attaches uploads to correct requirements', () => {
    const reqs = getDemoRequirementsWithUploads('client-001')
    // Client 001 has uploads for req-001, req-002, req-004 but not req-003
    const withUploads = reqs.filter(r => r.uploads.length > 0)
    expect(withUploads.length).toBe(3)
  })
})

describe('getDemoReminderLogs', () => {
  it('returns reminders for client with history', () => {
    const logs = getDemoReminderLogs('client-004')
    expect(logs.length).toBe(2) // reminder 1 and 2
    logs.forEach(l => {
      expect(l.client_id).toBe('client-004')
    })
  })

  it('returns empty array for client with no reminders', () => {
    expect(getDemoReminderLogs('client-001')).toEqual([])
  })
})
