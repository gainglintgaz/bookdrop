import { afterEach, expect, it, vi } from 'vitest'
import type { Client } from '../src/types'

const { session } = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('../src/lib/supabase', () => ({ supabase: { auth: { getSession: session } } }))
const request = vi.fn()
const client = { id: 'fixture-client' } as Client
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

it('local reminder refusal never invokes the retired auth or email endpoint', async () => {
  vi.stubEnv('VITE_MODE', 'local'); vi.stubGlobal('fetch', request)
  const { sendManualReminder } = await import('../src/lib/send-reminder')
  expect(await sendManualReminder(client, 'fixture-owner', { year: 2025, month: 12 })).toEqual({ success: false, error: 'Local reminder email is not configured yet. No reminder was sent.' })
  expect(session).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled()
})
it('legacy cloud reminder retains the explicitly selected period rather than using today', async () => {
  vi.stubEnv('VITE_MODE', 'cloud'); vi.stubGlobal('fetch', request)
  session.mockResolvedValue({ data: { session: { access_token: 'generated-fixture-only' } } })
  request.mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
  const { sendManualReminder } = await import('../src/lib/send-reminder')
  expect((await sendManualReminder(client, 'fixture-owner', { year: 2025, month: 12 })).success).toBe(true)
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ periodYear: 2025, periodMonth: 12 })
})
it('demo reminder remains an isolated simulation without a service call', async () => {
  vi.stubEnv('VITE_MODE', 'demo'); vi.stubGlobal('fetch', request)
  const { sendManualReminder } = await import('../src/lib/send-reminder')
  expect((await sendManualReminder(client, 'fixture-owner')).success).toBe(true)
  expect(session).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled()
})
