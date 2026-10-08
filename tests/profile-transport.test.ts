import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { saveLocalProfile, type ProfilePreferences } from '../src/lib/profile'
const request = vi.fn()
const id = '10000000-0000-4000-8000-000000000001'
const input: ProfilePreferences = { full_name: ' Generated user ', practice_name: '', reply_to_email: 'reply@example.test', reminder_tone: 'friendly', notify_on_complete: true, notify_on_any_upload: false, notify_on_late: true }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => { vi.stubGlobal('fetch', request) })
afterEach(() => { vi.unstubAllGlobals(); request.mockReset() })
it('saves preferences using verified cookie identity without browser owner or plan claims', async () => {
  const saved = { id, account_type: 'practitioner', ...input, full_name: input.full_name.trim() }
  request.mockResolvedValueOnce(json(saved))
  expect(await saveLocalProfile(input, id)).toEqual(saved)
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/bookdrop/profile', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: JSON.stringify({ ...input, full_name: input.full_name.trim() }) }))
  expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('id')
})
it('rejects protected or malformed settings before sending', async () => {
  for (const invalid of [{ ...input, plan: 'pro' }, { ...input, full_name: '' }, { ...input, reminder_tone: 'untrusted' }, { ...input, reply_to_email: 'bad' }, { ...input, notify_on_late: 'true' }]) await expect(saveLocalProfile(invalid as ProfilePreferences, id)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  expect(request).not.toHaveBeenCalled()
})
it('does not report success for an unrelated or malformed profile response', async () => {
  for (const result of [null, { id: 'other', account_type: 'practitioner' }, { id, account_type: 'untrusted' }]) {
    request.mockResolvedValueOnce(json(result))
    await expect(saveLocalProfile(input, id)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  }
})
it('keeps permission, offline and provider failures visible without sensitive error bodies or retries', async () => {
  for (const status of [403, 503]) {
    request.mockResolvedValueOnce(json({ code: status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE', message: 'generated private SQL fixture' }, status))
    await expect(saveLocalProfile(input, id)).rejects.toMatchObject({ status, message: expect.not.stringContaining('private SQL') })
  }
  request.mockRejectedValueOnce(new Error('generated network fixture'))
  await expect(saveLocalProfile(input, id)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
  expect(request).toHaveBeenCalledTimes(3)
})
