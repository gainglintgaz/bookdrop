import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import JSZip from 'jszip'
import type { DocumentUpload } from '../src/types'

const request = vi.fn()
const createUrl = vi.fn()
const click = vi.fn()
const fileId = '10000000-0000-4000-8000-000000000001'
const secondId = '10000000-0000-4000-8000-000000000002'
beforeEach(() => {
  vi.stubEnv('VITE_MODE', 'local')
  vi.stubGlobal('fetch', request)
  vi.stubGlobal('document', { body: { appendChild: vi.fn(), removeChild: vi.fn() }, createElement: () => ({ click, remove: vi.fn() }) })
  vi.spyOn(URL, 'createObjectURL').mockImplementation(createUrl.mockReturnValue('blob:fixture-only'))
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); request.mockReset(); createUrl.mockReset(); click.mockReset() })
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function ticket(bytes: Uint8Array) {
  return { grant: 'fixture-grant-only', size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex'), contentType: 'application/pdf' }
}
const upload = (id = fileId, filename = 'statement.pdf') => ({ id, filename_original: filename, storage_path: 'fixture/no-object.pdf' }) as DocumentUpload

it('uses cookie-authenticated POST grants and verifies downloaded bytes before returning a file', async () => {
  const bytes = new TextEncoder().encode('fixture document')
  request.mockResolvedValueOnce(json(ticket(bytes))).mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }))
  const { fetchPrivateFile } = await import('../src/lib/files')
  expect(await (await fetchPrivateFile(fileId)).text()).toBe('fixture document')
  expect(request.mock.calls.map(call => call[0])).toEqual([`/api/bookdrop/files/${fileId}/grant`, `/api/bookdrop/files/${fileId}/download`])
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store' })
  expect(request.mock.calls[1][0]).not.toContain('fixture-grant-only')
})
it('refuses incomplete or corrupted downloads without creating a browser file', async () => {
  const bytes = new TextEncoder().encode('fixture document')
  for (const wrong of ['short', 'fixture documenX']) {
    request.mockResolvedValueOnce(json(ticket(bytes))).mockResolvedValueOnce(new Response(wrong, { headers: { 'Content-Type': 'application/pdf' } }))
    const { downloadPrivateFile } = await import('../src/lib/files')
    await expect(downloadPrivateFile(fileId, 'document', 'statement.pdf')).rejects.toMatchObject({ code: 'FILE_INTEGRITY' })
  }
  expect(createUrl).not.toHaveBeenCalled()
})
it('ZIP fails completely when a required file is unavailable', async () => {
  request.mockResolvedValue(json({ code: 'FILE_NOT_FOUND' }, 404))
  const { downloadUploadsAsZip } = await import('../src/lib/download-zip')
  await expect(downloadUploadsAsZip([upload()], 'fixture.zip')).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
  expect(createUrl).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled()
})
it('ZIP retains every file with duplicate-safe names', async () => {
  const bytes = new TextEncoder().encode('fixture document')
  request.mockImplementation(async (url: string) => url.endsWith('/grant') ? json(ticket(bytes)) : new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }))
  const { downloadUploadsAsZip } = await import('../src/lib/download-zip')
  await downloadUploadsAsZip([upload(), upload(secondId)], 'fixture.zip')
  const blob = createUrl.mock.calls[0][0] as Blob
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  expect(Object.keys(zip.files)).toEqual(['statement.pdf', 'statement (2).pdf'])
  expect(await zip.file('statement.pdf')?.async('string')).toBe('fixture document')
  expect(await zip.file('statement (2).pdf')?.async('string')).toBe('fixture document')
})
it('rejects unsafe ZIP entry names before any download', async () => {
  const { downloadUploadsAsZip } = await import('../src/lib/download-zip')
  await expect(downloadUploadsAsZip([upload(fileId, '../elsewhere.pdf')], 'fixture.zip')).rejects.toThrow('invalid filename')
  expect(request).not.toHaveBeenCalled(); expect(createUrl).not.toHaveBeenCalled()
})
it('engagement designer receives only verified private letter bytes without sending storage paths', async () => {
  const bytes = new TextEncoder().encode('generated engagement PDF fixture')
  request.mockResolvedValueOnce(json(ticket(bytes))).mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }))
  const { fetchEngagementDocument } = await import('../src/lib/engagement-document')
  expect(new Uint8Array(await fetchEngagementDocument({ id: fileId, storage_path: 'fixture/private-letter.pdf' }))).toEqual(bytes)
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ kind: 'letter' })
  expect(JSON.stringify(request.mock.calls)).not.toContain('private-letter.pdf')
})
it('engagement designer refuses corrupt or unavailable letters and demo files stay isolated', async () => {
  const bytes = new TextEncoder().encode('generated engagement PDF fixture')
  const { fetchEngagementDocument } = await import('../src/lib/engagement-document')
  request.mockResolvedValueOnce(json(ticket(bytes))).mockResolvedValueOnce(new Response('corrupt', { headers: { 'Content-Type': 'application/pdf' } }))
  await expect(fetchEngagementDocument({ id: fileId, storage_path: 'fixture/private-letter.pdf' })).rejects.toMatchObject({ code: 'FILE_INTEGRITY' })
  request.mockResolvedValueOnce(json({ code: 'STORAGE_UNAVAILABLE' }, 503))
  await expect(fetchEngagementDocument({ id: fileId, storage_path: 'fixture/private-letter.pdf' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
  vi.resetModules(); vi.stubEnv('VITE_MODE', 'demo'); request.mockReset()
  const demo = await import('../src/lib/engagement-document')
  await expect(demo.fetchEngagementDocument({ id: fileId, storage_path: 'fixture/private-letter.pdf' })).rejects.toThrow('demo documents')
  expect(request).not.toHaveBeenCalled()
})
