import { afterEach, describe, expect, it, vi } from 'vitest'

const { createClient, loadSdk } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})), loadSdk: vi.fn() }))
vi.mock('@supabase/supabase-js', () => { loadSdk(); return { createClient } })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  createClient.mockClear()
})

describe('backend selection', () => {
  it('local mode never initializes hosted auth, database, or storage', async () => {
    vi.stubEnv('VITE_MODE', 'local')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.invalid')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-fixture-only')
    const { supabase } = await import('../src/lib/supabase')
    expect(loadSdk).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    for (const operation of [() => supabase.auth, () => supabase.from('clients'), () => supabase.storage]) {
      expect(operation).toThrow('not connected to the local backend')
    }
  })

  it('preserves credential-free demo behavior', async () => {
    vi.stubEnv('VITE_MODE', 'demo')
    const { supabase } = await import('../src/lib/supabase')
    expect(loadSdk).not.toHaveBeenCalled()
    expect(await supabase.auth.getSession()).toEqual({ data: { session: null }, error: null })
    expect(await supabase.from('clients').select('*')).toEqual({ data: null, error: null, count: null })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects an unknown mode instead of selecting a hosted backend', async () => {
    vi.stubEnv('VITE_MODE', 'locla')
    await expect(import('../src/lib/supabase')).rejects.toThrow('Invalid application mode')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('keeps hosted initialization explicit to cloud mode', async () => {
    vi.stubEnv('VITE_MODE', 'cloud')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.invalid')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-fixture-only')
    await import('../src/lib/supabase')
    expect(loadSdk).toHaveBeenCalledTimes(1)
    expect(createClient).toHaveBeenCalledWith('https://test.invalid', 'test-fixture-only')
  })
})
