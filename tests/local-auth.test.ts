import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
let useAuthStore: typeof import('../src/stores/auth.store').useAuthStore
let backendRequest: typeof import('../src/lib/backend').backendRequest
// Load once before per-test mocks exist. A failed setup must not resume into
// another test's fetch queue; each case still has its original 5s deadline.
beforeAll(async () => {
  vi.stubEnv('VITE_MODE', 'local')
  ;({ useAuthStore } = await import('../src/stores/auth.store'))
  ;({ backendRequest } = await import('../src/lib/backend'))
}, 5000)
afterAll(() => { vi.unstubAllEnvs(); vi.resetModules() })
beforeEach(() => {
  vi.stubEnv('VITE_MODE', 'local')
  vi.stubGlobal('fetch', request)
  useAuthStore.setState({ user: null, session: null, bookkeeper: null, loading: true, error: null })
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  request.mockReset()
})
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

describe('local auth boundary', () => {
  it('leaves loading state on unavailable backend without authenticating', async () => {
    request.mockRejectedValue(new Error('private connection detail'))
    await useAuthStore.getState().initialize()
    expect(useAuthStore.getState()).toMatchObject({ loading: false, user: null, session: null, bookkeeper: null })
    expect(useAuthStore.getState().error).toContain('local backend is unavailable')
  })

  it('uses a same-origin cookie session and server-derived account mapping', async () => {
    const session = { user: { id: 'test-user' }, bookkeeper: { id: 'test-user', account_type: 'solo', self_client_id: 'test-self' } }
    request.mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({ session }))
    expect(await useAuthStore.getState().signIn('fixture@example.test', 'test-only')).toEqual({ error: null })
    expect(useAuthStore.getState().bookkeeper?.self_client_id).toBe('test-self')
    expect(request.mock.calls.map(call => call[0])).toEqual(['/api/bookdrop/auth/sign-in', '/api/bookdrop/auth/session'])
    expect(request.mock.calls[0][1]).toMatchObject({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' })
    expect(request.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('rejects a mismatched tenant profile and clears stale identity', async () => {
    request.mockResolvedValue(json({ session: { user: { id: 'one' }, bookkeeper: { id: 'two', account_type: 'practitioner' } } }))
    await useAuthStore.getState().initialize()
    expect(useAuthStore.getState().session).toBeNull()
    expect(useAuthStore.getState().error).toContain('invalid response')
  })

  it.each(['practitioner', 'solo'] as const)('refreshes verified identity before %s signup returns to the dashboard caller', async accountType => {
    const session = { user: { id: 'new-fixture' }, bookkeeper: {
      id: 'new-fixture', account_type: accountType, self_client_id: accountType === 'solo' ? 'self-fixture' : null,
    } }
    request.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ session }))
    const result = accountType === 'solo'
      ? await useAuthStore.getState().signUpSolo('fixture@example.test', 'test-only', 'Fixture', 'Fixture business')
      : await useAuthStore.getState().signUp('fixture@example.test', 'test-only', 'Fixture')
    expect(result).toEqual({ error: null })
    expect(useAuthStore.getState()).toMatchObject({ session, user: session.user, loading: false })
    expect(request.mock.calls.map(call => call[0])).toEqual(['/api/bookdrop/auth/sign-up', '/api/bookdrop/auth/session'])
  })

  it('does not report signup success if its cookie cannot establish a verified session', async () => {
    request.mockResolvedValueOnce(json({ ok: true })).mockResolvedValueOnce(json({ session: null }))
    const result = await useAuthStore.getState().signUp('fixture@example.test', 'test-only', 'Fixture')
    expect(result.error).toContain('Please sign in')
    expect(useAuthStore.getState().session).toBeNull()
  })

  it('rejects an HTML fallback and never exposes error body details', async () => {
    request.mockResolvedValueOnce(new Response('<html>fallback</html>'))
    await expect(backendRequest('/auth/session')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    request.mockResolvedValueOnce(json({ code: 'INVALID_CREDENTIALS', message: 'private data' }, 401))
    await expect(backendRequest('/auth/sign-in', {})).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Email or password was not accepted.' })
  })

  it('rejects external destinations before any request', async () => {
    for (const path of ['https://example.test', '//example.test', '/../auth', '/auth?redirect=elsewhere']) {
      await expect(backendRequest(path)).rejects.toMatchObject({ code: 'INVALID_ROUTE' })
    }
    expect(request).not.toHaveBeenCalled()
  })

  it('shows stable actionable errors without reflecting provider or database details', async () => {
    for (const [code, status, message] of [
      ['PLAN_LIMIT', 409, 'Your plan has reached its active client limit.'],
      ['RATE_LIMITED', 429, 'Too many attempts. Please wait a moment and try again.'],
      ['RECOVERY_UNAVAILABLE', 503, 'Password recovery is not configured. Please contact your administrator.'],
      ['INVALID_INPUT', 400, 'Please check the information you entered.'],
    ] as const) {
      request.mockResolvedValueOnce(json({ code, message: 'private provider detail' }, status))
      await expect(backendRequest('/clients', {})).rejects.toMatchObject({ code, status, message })
    }
  })

  it('does not report successful logout if the server cannot revoke the session', async () => {
    useAuthStore.setState({ user: { id: 'test-user' }, session: { user: { id: 'test-user' } } })
    request.mockRejectedValue(new Error('unavailable'))
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().session).not.toBeNull()
    expect(useAuthStore.getState().error).toContain('unavailable')
  })
})
