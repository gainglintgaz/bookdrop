import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const request = vi.fn()
beforeEach(() => { vi.stubEnv('VITE_MODE', 'local'); vi.stubGlobal('fetch', request) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); request.mockReset() })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })

it('local notification reads and counts use the verified cookie API without owner claims', async () => {
  const service = await import('../src/lib/notifications')
  request.mockResolvedValueOnce(json([{ id: 'generated-notification' }])).mockResolvedValueOnce(json({ count: 1 }))
  expect(await service.fetchNotifications()).toEqual([{ id: 'generated-notification' }])
  expect(await service.getUnreadNotificationCount()).toBe(1)
  expect(request.mock.calls.map(call => call[0])).toEqual(['/api/bookdrop/notifications', '/api/bookdrop/notifications/unread'])
  for (const [, options] of request.mock.calls) expect(options).toMatchObject({ credentials: 'same-origin', redirect: 'error', cache: 'no-store' })
})
it('read actions persist through fixed POST routes and reject unsafe identifiers', async () => {
  const service = await import('../src/lib/notifications')
  request.mockImplementation(async () => json({ ok: true }))
  const id = '10000000-0000-4000-8000-000000000001'
  await service.markNotificationRead(id); await service.markAllRead()
  expect(request.mock.calls.map(call => call[0])).toEqual([`/api/bookdrop/notifications/${id}/read`, '/api/bookdrop/notifications/read-all'])
  for (const [, options] of request.mock.calls) expect(options).toMatchObject({ method: 'POST', body: '{}' })
  await expect(service.markNotificationRead('../read-all')).rejects.toThrow()
  expect(request).toHaveBeenCalledTimes(2)
})
it('local service failures remain failures rather than empty lists, zero counts or read success', async () => {
  const service = await import('../src/lib/notifications')
  request.mockImplementation(async () => json({ code: 'UNAVAILABLE', message: 'private fixture error' }, 503))
  for (const operation of [service.fetchNotifications, service.getUnreadNotificationCount, service.markAllRead]) {
    await expect(operation()).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.not.stringContaining('private fixture') })
  }
})
it('local clients cannot fabricate event notifications', async () => {
  const service = await import('../src/lib/notifications')
  await expect(service.createNotification('payment_received', { title: 'Untrusted claim', body: 'Untrusted claim' })).rejects.toThrow('server events')
  expect(request).not.toHaveBeenCalled()
})
