import type { Bookkeeper } from '@/types'

export interface BackendSession {
  user: { id: string; email?: string }
  bookkeeper: Bookkeeper
}

export class BackendError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.status = status
  }
}

const messages: Record<string, string> = {
  UNAUTHENTICATED: 'Please sign in again.',
  INVALID_CREDENTIALS: 'Email or password was not accepted.',
  FORBIDDEN: 'You do not have access to this operation.',
  UNAVAILABLE: 'The local backend is unavailable. Start the local API and try again.',
  INVALID_RESPONSE: 'The backend returned an invalid response. Please try again.',
  INVALID_INPUT: 'Please check the information you entered.',
  PLAN_LIMIT: 'Your plan has reached its active client limit.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  RECOVERY_UNAVAILABLE: 'Password recovery is not configured. Please contact your administrator.',
  NOT_FOUND: 'This item was not found or is no longer available.',
  PAYLOAD_TOO_LARGE: 'The request is too large. Please reduce it and try again.',
  STORAGE_UNAVAILABLE: 'Private file storage is unavailable. Please try again.',
  FILE_NOT_FOUND: 'The document could not be found. Please refresh and try again.',
  FILE_INTEGRITY: 'The document failed its integrity check. Please contact your administrator.',
  INVALID_GRANT: 'The download permission expired or is invalid. Please try again.',
  UPLOAD_INCOMPLETE: 'The upload did not finish. Please check your connection and try again.',
}

/** Fixed same-origin namespace; never accept an arbitrary backend URL. */
export function portalHeaders(token: string): Record<string, string> {
  if (!/^[A-Za-z0-9_-]{12,128}$/.test(token)) throw new BackendError('NOT_FOUND', 404, messages.NOT_FOUND)
  return { 'x-bookdrop-portal': token }
}
export function portalRequest<T>(route: string, token: string, body: unknown): Promise<T> {
  return backendRequest<T>(`/portal${route}`, body, token)
}
export async function backendRequest<T>(route: string, body?: unknown, portalToken?: string): Promise<T> {
  if (!/^\/[a-z0-9/-]+$/.test(route) || route.includes('//') || route.includes('..')) {
    throw new BackendError('INVALID_ROUTE', 0, 'Invalid backend operation.')
  }
  if (portalToken !== undefined && !route.startsWith('/portal/')) throw new BackendError('INVALID_ROUTE', 0, 'Invalid portal operation.')
  const tokenHeaders = portalToken === undefined ? {} : portalHeaders(portalToken)
  let response: Response
  try {
    response = await fetch(`/api/bookdrop${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: portalToken === undefined ? 'same-origin' : 'omit',
      redirect: 'error',
      cache: 'no-store',
      headers: body === undefined ? { Accept: 'application/json', ...tokenHeaders } : {
        Accept: 'application/json', 'Content-Type': 'application/json', ...tokenHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new BackendError('UNAVAILABLE', 0, messages.UNAVAILABLE)
  }
  return readBackendJson<T>(response)
}

export async function readBackendJson<T>(response: Response): Promise<T> {
  let payload: unknown
  try {
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error()
    payload = await response.json()
  } catch {
    throw new BackendError('INVALID_RESPONSE', response.status, messages.INVALID_RESPONSE)
  }
  if (!response.ok) {
    const suppliedCode = typeof payload === 'object' && payload !== null && 'code' in payload
      ? payload.code : undefined
    const code = typeof suppliedCode === 'string' && Object.hasOwn(messages, suppliedCode)
      ? suppliedCode : 'UNAVAILABLE'
    // Never render arbitrary server bodies, SQL errors, or reflected credentials.
    throw new BackendError(code, response.status, messages[code])
  }
  return payload as T
}

export async function fetchBackendSession(): Promise<BackendSession | null> {
  const result = await backendRequest<{ session: BackendSession | null }>('/auth/session')
  if (!result || !Object.hasOwn(result, 'session')) {
    throw new BackendError('INVALID_RESPONSE', 200, messages.INVALID_RESPONSE)
  }
  if (result.session === null) return null
  const session = result.session
  if (!session?.user?.id || session.bookkeeper?.id !== session.user.id ||
      !['practitioner', 'solo'].includes(session.bookkeeper.account_type) ||
      (session.bookkeeper.account_type === 'solo' && !session.bookkeeper.self_client_id)) {
    throw new BackendError('INVALID_RESPONSE', 200, messages.INVALID_RESPONSE)
  }
  return session
}
