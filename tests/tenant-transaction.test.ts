import { describe, expect, it, vi } from 'vitest'
import { withTenant, type VerifiedTenant } from '../server/db/tenant'

const request = new Request('http://localhost/api/bookdrop/clients', { headers: { 'X-Tenant-Id': 'untrusted' } })
const identity = (): VerifiedTenant => ({ bookkeeperId: '00000000-0000-4000-8000-000000000001', expiresAt: new Date(Date.now() + 60000) })
const fixture = () => {
  const connection = { query: vi.fn().mockResolvedValue({}), release: vi.fn() }
  const pool = { connect: vi.fn().mockResolvedValue(connection) }
  return { connection, pool }
}

describe('request-scoped tenant transaction', () => {
  it('uses only verified identity and commits before returning the connection', async () => {
    const { connection, pool } = fixture()
    const verified = identity()
    const result = await withTenant(pool, request, async () => verified, async tx => {
      await tx.query('SELECT id FROM public.clients')
      return 'result'
    })
    expect(result).toBe('result')
    expect(connection.query.mock.calls).toEqual([
      ['BEGIN'], ['SET LOCAL ROLE bookdrop_app'],
      ["SELECT set_config('bookdrop.bookkeeper_id', $1, true)", [verified.bookkeeperId]],
      ['SELECT id FROM public.clients'], ['COMMIT'],
    ])
    expect(connection.release).toHaveBeenCalledExactlyOnceWith(false)
  })

  it.each([null, { ...identity(), expiresAt: new Date(0) }, { ...identity(), bookkeeperId: "bad'; SELECT 1" }])(
    'rejects missing, expired, or invalid identity before connecting', async verified => {
      const { pool } = fixture()
      const operation = vi.fn()
      await expect(withTenant(pool, request, async () => verified, operation)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
      expect(pool.connect).not.toHaveBeenCalled()
      expect(operation).not.toHaveBeenCalled()
    },
  )

  it('rolls back on operation failure without committing or retrying', async () => {
    const { connection, pool } = fixture()
    const error = new Error('test operation failure')
    await expect(withTenant(pool, request, async () => identity(), async () => { throw error })).rejects.toBe(error)
    expect(connection.query.mock.calls.at(-1)).toEqual(['ROLLBACK'])
    expect(connection.query.mock.calls.flat()).not.toContain('COMMIT')
    expect(connection.release).toHaveBeenCalledExactlyOnceWith(false)
  })

  it('discards the connection when rollback fails', async () => {
    const { connection, pool } = fixture()
    connection.query.mockImplementation(async sql => { if (sql === 'ROLLBACK') throw new Error('rollback failure'); return {} })
    await expect(withTenant(pool, request, async () => identity(), async () => { throw new Error('operation failure') })).rejects.toThrow('operation failure')
    expect(connection.release).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('never retries a transaction after an ambiguous commit failure', async () => {
    const { connection, pool } = fixture()
    connection.query.mockImplementation(async sql => { if (sql === 'COMMIT') throw new Error('commit outcome unknown'); return {} })
    const operation = vi.fn().mockResolvedValue('test')
    await expect(withTenant(pool, request, async () => identity(), operation)).rejects.toThrow('commit outcome unknown')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(connection.release).toHaveBeenCalledTimes(1)
  })
})
