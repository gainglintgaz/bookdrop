import { backendRequest, BackendError, readBackendJson, portalRequest, portalHeaders } from '@/lib/backend'
import type { DocumentUpload, EngagementLetter } from '@/types'

const maxBytes = 50 * 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export type PrivateFileKind = 'document' | 'letter' | 'signed' | 'message'
function checkId(value: string) {
  if (!uuid.test(value)) throw new BackendError('INVALID_INPUT', 0, 'Invalid document operation.')
}
async function upload<T>(route: string, file: File, headers: Record<string, string>): Promise<T> {
  if (!file.size || file.size > maxBytes) throw new BackendError('PAYLOAD_TOO_LARGE', 413, 'Choose a document between 1 byte and 50 MB.')
  try {
    const response = await fetch(`/api/bookdrop${route}`, {
      method: 'POST', credentials: headers['x-bookdrop-portal'] ? 'omit' : 'same-origin', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-bookdrop-filename': encodeURIComponent(file.name), ...headers },
      body: file, signal: AbortSignal.timeout(120000),
    })
    return await readBackendJson<T>(response)
  } catch (cause) {
    if (cause instanceof BackendError) throw cause
    throw new BackendError('UPLOAD_INCOMPLETE', 0, 'The upload did not finish. Please refresh before retrying.')
  }
}
export function uploadLocalDocument(file: File, clientId: string, requirementId: string, year: number, month: number, portalToken?: string) {
  checkId(clientId); checkId(requirementId)
  return upload<DocumentUpload>(`${portalToken === undefined ? '' : '/portal'}/clients/${clientId}/requirements/${requirementId}/upload`, file, {
    'x-bookdrop-year': String(year), 'x-bookdrop-month': String(month),
    ...(portalToken === undefined ? {} : portalHeaders(portalToken)),
  })
}
export function uploadLocalLetter(file: File, clientId: string, label: string) {
  checkId(clientId)
  return upload<EngagementLetter>(`/clients/${clientId}/letters/upload`, file, { 'x-bookdrop-label': encodeURIComponent(label) })
}
export async function fetchPrivateFile(id: string, kind: PrivateFileKind = 'document', portalToken?: string): Promise<Blob> {
  checkId(id)
  type Ticket = { grant: string; size: number; sha256: string; contentType: string }
  const ticket = portalToken === undefined
    ? await backendRequest<Ticket>(`/files/${id}/grant`, { kind })
    : await portalRequest<Ticket>(`/files/${id}/grant`, portalToken, { kind })
  if (typeof ticket.grant !== 'string' || !Number.isSafeInteger(ticket.size) || ticket.size < 1 || ticket.size > maxBytes || !/^[a-f0-9]{64}$/.test(ticket.sha256) || typeof ticket.contentType !== 'string') {
    throw new BackendError('INVALID_RESPONSE', 200, 'The download response was invalid.')
  }
  let response: Response
  try {
    response = await fetch(`/api/bookdrop${portalToken === undefined ? '' : '/portal'}/files/${id}/download`, {
      method: 'POST', credentials: portalToken === undefined ? 'same-origin' : 'omit', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(portalToken === undefined ? {} : portalHeaders(portalToken)) }, body: JSON.stringify({ kind, grant: ticket.grant }),
      signal: AbortSignal.timeout(120000),
    })
  } catch { throw new BackendError('STORAGE_UNAVAILABLE', 0, 'Private file storage is unavailable. Please try again.') }
  if (!response.ok) return readBackendJson<never>(response)
  if (response.headers.get('content-type')?.split(';')[0] !== ticket.contentType || !response.body) throw new BackendError('INVALID_RESPONSE', 200, 'The download response was invalid.')
  const reader = response.body.getReader()
  const parts: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > ticket.size) { await reader.cancel(); throw new Error() }
      parts.push(new Uint8Array(chunk.value))
    }
    if (size !== ticket.size) throw new Error()
  } catch { throw new BackendError('FILE_INTEGRITY', 0, 'The document download was incomplete. No file was saved.') }
  finally { reader.releaseLock() }
  const blob = new Blob(parts, { type: ticket.contentType })
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  if (hash !== ticket.sha256) throw new BackendError('FILE_INTEGRITY', 0, 'The document failed its integrity check. No file was saved.')
  return blob
}
export async function downloadPrivateFile(id: string, kind: PrivateFileKind, filename: string, portalToken?: string) {
  const blob = await fetchPrivateFile(id, kind, portalToken)
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url; link.download = filename
    document.body.appendChild(link); link.click(); link.remove()
  } finally { URL.revokeObjectURL(url) }
}
