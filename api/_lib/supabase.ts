// api/_lib/supabase.ts
// Server-side Supabase client using service_role key.
// This bypasses RLS — only use in trusted server-side code.
//
// IMPORTANT: Never call createClient() with empty strings at module load.
// Modern @supabase/supabase-js throws "supabaseUrl/Key is required" which
// causes Vercel FUNCTION_INVOCATION_FAILED on every route that imports this file.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

function resolveConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url.trim() || !key.trim()) return null
  return { url: url.trim(), key: key.trim() }
}

/** True when service-role credentials are present (safe to query as admin). */
export function hasSupabaseAdminConfig(): boolean {
  return resolveConfig() !== null
}

/**
 * Service-role Supabase client. Lazy-created on first use so missing env
 * does not crash the serverless module at import time.
 * Throws a clear Error if credentials are not configured.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  const cfg = resolveConfig()
  if (!cfg) {
    throw new Error(
      'Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY — set them on Vercel Production',
    )
  }
  _admin = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}

/**
 * Back-compat export used across api/*. Lazy Proxy: import never throws;
 * first property access creates the client or throws a readable error.
 */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getSupabaseAdmin()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})
