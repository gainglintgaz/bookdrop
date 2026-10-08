import { betterAuth } from 'better-auth';

/** Self-managed Better Auth for plain local PostgreSQL only.
 * Cloud identity uses a separately verified Neon Auth adapter at cutover.
 * Configuration is supplied in memory; this module never loads dotenv files.
 */
export function createLocalAuth({ pool, origin, secret, sendResetPassword }) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('LOCAL_AUTH_ORIGIN_REQUIRED');
  }
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('AUTH_SECRET_REQUIRED');
  return betterAuth({
    database: pool,
    baseURL: url.origin,
    basePath: '/api/bookdrop/identity',
    secret,
    trustedOrigins: [url.origin],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      ...(sendResetPassword ? { sendResetPassword: async (message, request) => {
        // Fragment tokens are not sent in HTTP request URLs or Referer headers.
        // The local page consumes this once and sends it in a JSON POST body.
        await sendResetPassword({ ...message, url: `${url.origin}/reset-password#token=${encodeURIComponent(message.token)}` }, request);
      } } : {}),
    },
    user: {
      additionalFields: {
        accountType: { type: ['practitioner', 'solo'], required: true, defaultValue: 'practitioner' },
        businessName: { type: 'string', required: false },
      },
    },
    session: { cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100 },
    advanced: { database: { generateId: 'uuid' }, ipAddress: { ipAddressHeaders: ['x-bookdrop-peer'] } },
    logger: { disabled: true },
  });
}
