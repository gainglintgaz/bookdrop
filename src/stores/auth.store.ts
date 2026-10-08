// src/stores/auth.store.ts
// Auth state management — bookkeeper login/logout/session
// Supports both practitioner and solo account types

import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { isDemoMode, isLocalMode } from '@/lib/mode'
import { backendRequest, fetchBackendSession, type BackendSession } from '@/lib/backend'
import { demoBookkeeper, demoSoloUser } from '@/lib/demo-data'
import { generatePortalToken } from '@/lib/utils'
import type { Bookkeeper, AccountType } from '@/types'

type User = BackendSession['user']
type Session = { user: User }

interface AuthState {
  user: User | null
  session: Session | null
  bookkeeper: Bookkeeper | null
  loading: boolean
  error: string | null
}

interface AuthActions {
  initialize: (demoAccountType?: AccountType) => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>
  signUpSolo: (email: string, password: string, fullName: string, businessName: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: string | null }>
  fetchBookkeeper: () => Promise<void>
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  user: null,
  session: null,
  bookkeeper: null,
  loading: true,
  error: null,

  initialize: async (demoAccountType?: AccountType) => {
    if (isDemoMode) {
      const demoUser = demoAccountType === 'solo' ? demoSoloUser : demoBookkeeper
      set({
        user: { id: demoUser.id, email: demoUser.email } as User,
        session: { user: { id: demoUser.id } } as Session,
        bookkeeper: demoUser,
        loading: false,
      })
      return
    }

    if (isLocalMode) {
      try {
        const session = await fetchBackendSession()
        set({ user: session?.user ?? null, session, bookkeeper: session?.bookkeeper ?? null, error: null })
      } catch (error) {
        set({ user: null, session: null, bookkeeper: null, error: error instanceof Error ? error.message : 'Unable to load session.' })
      } finally {
        set({ loading: false })
      }
      return
    }

    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      set({ user: session.user, session, loading: false })
      await get().fetchBookkeeper()
    } else {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, session })
      if (session?.user) {
        get().fetchBookkeeper()
      } else {
        set({ bookkeeper: null })
      }
    })
  },

  signIn: async (_email, _password) => {
    set({ error: null })

    // In demo mode, bypass Supabase and auto-login with demo bookkeeper
    if (isDemoMode) {
      set({
        user: { id: 'bk-demo-001', email: demoBookkeeper.email } as User,
        session: { user: { id: 'bk-demo-001' } } as Session,
        bookkeeper: demoBookkeeper,
        loading: false,
      })
      return { error: null }
    }

    if (isLocalMode) {
      try {
        await backendRequest('/auth/sign-in', { email: _email, password: _password })
        await get().initialize()
        if (!get().session) return { error: get().error ?? 'Sign-in did not create a session.' }
        return { error: null }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sign in.'
        set({ error: message })
        return { error: message }
      }
    }

    const { error } = await supabase.auth.signInWithPassword({ email: _email, password: _password })
    if (error) {
      set({ error: error.message })
      return { error: error.message }
    }
    return { error: null }
  },

  signUp: async (email, password, fullName) => {
    set({ error: null })

    // In demo mode, bypass Supabase and auto-login with demo bookkeeper
    if (isDemoMode) {
      set({
        user: { id: 'bk-demo-001', email: demoBookkeeper.email } as User,
        session: { user: { id: 'bk-demo-001' } } as Session,
        bookkeeper: { ...demoBookkeeper, email, full_name: fullName },
        loading: false,
      })
      return { error: null }
    }

    if (isLocalMode) {
      try {
        await backendRequest('/auth/sign-up', { email, password, fullName, accountType: 'practitioner' })
        await get().initialize()
        if (!get().session) return { error: get().error ?? 'Sign-up did not create a session. Please sign in.' }
        return { error: null }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sign up.'
        set({ error: message })
        return { error: message }
      }
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ error: error.message })
      return { error: error.message }
    }

    // Create bookkeeper row after signup (practitioner by default)
    if (data.user) {
      const { error: insertError } = await supabase.from('bookkeepers').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        practice_name: '',
        reply_to_email: email,
        account_type: 'practitioner',
        plan: 'starter',
      })
      if (insertError) {
        set({ error: insertError.message })
        return { error: insertError.message }
      }
    }

    return { error: null }
  },

  signUpSolo: async (email, password, fullName, businessName) => {
    set({ error: null })

    // In demo mode, bypass Supabase and auto-login with demo solo user
    if (isDemoMode) {
      set({
        user: { id: demoSoloUser.id, email: demoSoloUser.email } as User,
        session: { user: { id: demoSoloUser.id } } as Session,
        bookkeeper: { ...demoSoloUser, email, full_name: fullName, business_name: businessName },
        loading: false,
      })
      return { error: null }
    }

    if (isLocalMode) {
      try {
        await backendRequest('/auth/sign-up', { email, password, fullName, businessName, accountType: 'solo' })
        await get().initialize()
        if (!get().session) return { error: get().error ?? 'Sign-up did not create a session. Please sign in.' }
        return { error: null }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to sign up.'
        set({ error: message })
        return { error: message }
      }
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ error: error.message })
      return { error: error.message }
    }

    if (data.user) {
      // 1. Create bookkeeper row with account_type = 'solo'
      const { error: insertError } = await supabase.from('bookkeepers').insert({
        id: data.user.id,
        email,
        full_name: fullName,
        practice_name: '',
        reply_to_email: email,
        account_type: 'solo',
        business_name: businessName,
      })
      if (insertError) {
        set({ error: insertError.message })
        return { error: insertError.message }
      }

      // 2. Auto-create a client row (solo user is their own client)
      const { data: clientRow, error: clientError } = await supabase
        .from('clients')
        .insert({
          bookkeeper_id: data.user.id,
          business_name: businessName,
          contact_name: fullName,
          contact_email: email,
          portal_token: generatePortalToken(),
          notes_for_client: null,
          notes_private: 'Auto-created for solo account',
          is_active: true,
        })
        .select('id')
        .single()

      if (clientError) {
        set({ error: clientError.message })
        return { error: clientError.message }
      }

      // 3. Link self_client_id back to the bookkeeper row
      const { error: updateError } = await supabase
        .from('bookkeepers')
        .update({ self_client_id: clientRow.id })
        .eq('id', data.user.id)

      if (updateError) {
        set({ error: updateError.message })
        return { error: updateError.message }
      }
    }

    return { error: null }
  },

  signOut: async () => {
    if (isLocalMode) {
      try {
        await backendRequest('/auth/sign-out', {})
        set({ user: null, session: null, bookkeeper: null, error: null })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Unable to sign out.' })
      }
      return
    }
    await supabase.auth.signOut()
    set({ user: null, session: null, bookkeeper: null })
  },

  resetPassword: async (email) => {
    if (isLocalMode) {
      try {
        await backendRequest('/auth/reset-password', { email })
        return { error: null }
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unable to reset password.' }
      }
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) return { error: error.message }
    return { error: null }
  },

  fetchBookkeeper: async () => {
    if (isLocalMode) {
      await get().initialize()
      return
    }
    const user = get().user
    if (!user) return

    const { data, error } = await supabase
      .from('bookkeepers')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      set({ error: error.message })
      return
    }

    set({ bookkeeper: data })
  },
}))
