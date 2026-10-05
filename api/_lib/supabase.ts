// api/_lib/supabase.ts
// Server-side Supabase client using service_role key.
// This bypasses RLS — only use in trusted server-side code.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — API functions will fail')
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? '',
  supabaseServiceKey ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
