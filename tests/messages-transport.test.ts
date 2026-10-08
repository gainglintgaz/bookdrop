import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const request = vi.fn()
const client = '10000000-0000-4000-8000-000000000001', token = 'generated_portal_token_123456789'
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { vi.stubEnv('VITE_MODE', 'local'); vi.stubGlobal('fetch', request) })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); request.mockReset() })
it('local reads, threads and counts use verified-cookie routes without browser owner claims', async () => {
  const service = await import('../src/lib/messages')
  request.mockResolvedValueOnce(json([])).mockResolvedValueOnce(json([])).mockResolvedValueOnce(json({ count: 2 }))
  expect(await service.fetchMessages(client)).toEqual([])
  expect(await service.fetchThreads('untrusted-owner')).toEqual([])
  expect(await service.getUnreadCount('untrusted-owner')).toBe(2)
  expect(request.mock.calls.map(call => call[0])).toEqual([`/api/bookdrop/clients/${client}/messages/list`, '/api/bookdrop/messages/threads', '/api/bookdrop/messages/unread'])
  for (const [, options] of request.mock.calls) { expect(options.credentials).toBe('same-origin'); expect(JSON.stringify(options)).not.toContain('untrusted-owner') }
})
it('sends one multipart transaction and never supplies sender or storage-key claims', async () => {
  const service = await import('../src/lib/messages')
  request.mockResolvedValueOnce(json({ id: 'generated-message' }))
  const file = new File(['generated fixture'], 'fixture.pdf', { type: 'application/pdf' })
  await service.sendMessage(client, ' A message ', 'bookkeeper', [file])
  const [route, options] = request.mock.calls[0]
  expect(route).toBe(`/api/bookdrop/clients/${client}/messages/send`)
  expect(options.credentials).toBe('same-origin'); expect(options.redirect).toBe('error')
  expect([...options.body.keys()]).toEqual(['content', 'attachments']); expect(options.body.get('content')).toBe('A message')
  expect(options.headers).toEqual({})
})
it('portal conversation uses only its header token with cookies omitted, including read receipts', async () => {
  const service = await import('../src/lib/messages')
  request.mockImplementation(async () => json([]))
  await service.fetchMessages(client, token); await service.markAsRead(client, 'client', token)
  await service.sendMessage(client, 'Client reply', 'client', undefined, token)
  for (const [route, options] of request.mock.calls) { expect(route).toContain('/api/bookdrop/portal/clients/'); expect(route).not.toContain(token); expect(options.credentials).toBe('omit'); expect(options.headers['x-bookdrop-portal']).toBe(token); expect(options.body instanceof FormData ? options.body.get('content') : options.body).not.toContain(token) }
})
it('refuses sender impersonation, invalid client and empty content before any request', async () => {
  const service = await import('../src/lib/messages')
  await expect(service.sendMessage(client, 'Claim', 'client')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(service.markAsRead(client, 'bookkeeper', token)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(service.fetchMessages('../clients')).rejects.toThrow()
  await expect(service.sendMessage(client, '', 'bookkeeper')).rejects.toThrow()
  expect(request).not.toHaveBeenCalled()
})
it('failures stay visible and uncertain sends request refresh instead of automatic retry', async () => {
  const service = await import('../src/lib/messages')
  request.mockResolvedValueOnce(json({ code: 'UNAVAILABLE', message: 'private SQL fixture' }, 503))
  await expect(service.fetchMessages(client)).rejects.toMatchObject({ code: 'UNAVAILABLE', message: expect.not.stringContaining('private SQL') })
  request.mockRejectedValueOnce(new Error('fixture network'))
  await expect(service.sendMessage(client, 'Message', 'bookkeeper')).rejects.toThrow('Refresh the conversation')
  expect(request).toHaveBeenCalledTimes(2)
})
