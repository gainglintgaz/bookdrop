import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const request = vi.fn()
const clientId = '10000000-0000-4000-8000-000000000001'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { vi.stubEnv('VITE_MODE', 'local'); vi.stubGlobal('fetch', request) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); request.mockReset() })
it('loads one period-specific local snapshot without hosted SDK calls or owner claims', async () => {
  const { fetchClientTearsheet } = await import('../src/lib/client-tearsheet')
  const snapshot = { client: { id: clientId }, requirements: [], reminders: [], outcomes: [] }
  request.mockResolvedValueOnce(json(snapshot))
  expect(await fetchClientTearsheet(clientId, 2025, 12)).toEqual(snapshot)
  expect(request).toHaveBeenCalledExactlyOnceWith(`/api/bookdrop/clients/${clientId}/tearsheet`, expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: '{"year":2025,"month":12}' }))
})
it('refuses invalid client/period before sending and preserves forbidden/unavailable failures', async () => {
  const { fetchClientTearsheet } = await import('../src/lib/client-tearsheet')
  await expect(fetchClientTearsheet('../other', 2025, 12)).rejects.toThrow('Invalid client')
  await expect(fetchClientTearsheet(clientId, 2025, 13)).rejects.toThrow('Invalid period')
  expect(request).not.toHaveBeenCalled()
  for (const status of [403, 503]) {
    request.mockResolvedValueOnce(json({ code: status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE', message: 'private SQL fixture' }, status))
    await expect(fetchClientTearsheet(clientId, 2025, 12)).rejects.toMatchObject({ status, message: expect.not.stringContaining('private SQL') })
  }
})
it('does not invent zero accuracy or hours for missing measurements', async () => {
  const { tearsheetMetrics } = await import('../src/lib/client-tearsheet')
  const empty = { period_year: 2025, period_month: 12, hours_saved_minutes: null, accuracy_pct: null, reconciliation_match_pct: null, total_categorized: null, total_corrected: null }
  expect(tearsheetMetrics([empty])).toEqual({ lifetimeHoursSaved: null, hoursSamples: 0, avgAccuracy: null, accuracySamples: 0 })
  expect(tearsheetMetrics([empty, { ...empty, hours_saved_minutes: 90, accuracy_pct: 80 }, { ...empty, accuracy_pct: 100 }])).toEqual({ lifetimeHoursSaved: 1.5, hoursSamples: 1, avgAccuracy: 90, accuracySamples: 2 })
})
