// src/lib/supabase.ts
// Supabase client — single instance shared across the app.
// In demo mode, exports a dummy object so nothing crashes.

import { isDemoMode, isLocalMode } from '@/lib/mode'
import type { SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient

if (isDemoMode) {
  // Dummy proxy — any chained call returns { data: null, error: null }
  const noop = () => ({ data: null, error: null, count: null })
  const chainable: Record<string, unknown> = {}
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') return undefined // not a thenable
      return () => new Proxy(chainable, handler)
    },
  }
  // Make terminal calls resolve
  const terminalHandler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (prop === 'then') {
        // resolve with { data: null, error: null }
        return (resolve: (v: unknown) => void) => resolve(noop())
      }
      return () => new Proxy(chainable, terminalHandler)
    },
  }
  _supabase = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === 'auth') {
        return {
          getSession: async () => ({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: async () => ({ data: null, error: { message: 'Demo mode' } }),
          signUp: async () => ({ data: null, error: { message: 'Demo mode' } }),
          signOut: async () => ({ error: null }),
          resetPasswordForEmail: async () => ({ error: null }),
        }
      }
      if (prop === 'storage') {
        return {
          from: () => ({
            upload: async () => ({ error: null }),
            download: async () => ({ data: null, error: { message: 'Demo mode' } }),
            createSignedUrl: async () => ({ data: null, error: { message: 'Demo mode' } }),
          }),
        }
      }
      // .from('table') returns a chainable proxy
      return () => new Proxy(chainable, terminalHandler)
    },
  }) as unknown as SupabaseClient
} else if (isLocalMode) {
  // Fail closed while callers migrate to the local API. Never initialize the
  // hosted SDK or silently return successful empty results in local mode.
  _supabase = new Proxy({} as SupabaseClient, {
    get() {
      throw new Error('This operation is not connected to the local backend yet.')
    },
  })
} else {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
    )
  }

  // Loading the hosted SDK belongs to the cloud branch too. Local and demo
  // imports must not evaluate its auth/storage dependency graph.
  const { createClient } = await import('@supabase/supabase-js')
  _supabase = createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = _supabase
