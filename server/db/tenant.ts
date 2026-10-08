/** Driver-neutral subset of a PostgreSQL pool connection. */
export interface TenantConnection {
  query(sql: string, parameters?: unknown[]): Promise<unknown>
  release(destroy?: boolean): void
}

export interface TenantPool {
  connect(): Promise<TenantConnection>
}

export interface VerifiedTenant {
  bookkeeperId: string
  expiresAt: Date
}

/** Implement with managed auth verification plus private identity lookup.
 * Never implement this by accepting a browser-supplied tenant ID or plan.
 */
export type VerifySession = (request: Request) => Promise<VerifiedTenant | null>

export class TenantAccessError extends Error {
  readonly code = 'UNAUTHENTICATED'
  constructor() { super('A valid session is required.') }
}

/** One checked-out connection and one transaction per verified request.
 * Tenant role is fixed and has no BYPASSRLS. Identity is parameterized and LOCAL.
 * No automatic retries: a failed COMMIT can have an unknown outcome.
 */
export async function withTenant<T>(
  pool: TenantPool,
  request: Request,
  verifySession: VerifySession,
  operation: (connection: TenantConnection) => Promise<T>,
): Promise<T> {
  const identity = await verifySession(request)
  if (!identity || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity.bookkeeperId) ||
      !Number.isFinite(identity.expiresAt.getTime()) || identity.expiresAt.getTime() <= Date.now()) {
    throw new TenantAccessError()
  }
  const connection = await pool.connect()
  let began = false
  let destroy = false
  try {
    await connection.query('BEGIN')
    began = true
    await connection.query('SET LOCAL ROLE bookdrop_app')
    await connection.query("SELECT set_config('bookdrop.bookkeeper_id', $1, true)", [identity.bookkeeperId])
    const result = await operation(connection)
    await connection.query('COMMIT')
    return result
  } catch (error) {
    if (began) {
      try { await connection.query('ROLLBACK') } catch { destroy = true }
    } else {
      destroy = true
    }
    throw error
  } finally {
    connection.release(destroy)
  }
}
