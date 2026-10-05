// src/lib/mode.ts
// App mode — demo (default for localhost), local, or cloud.
// Account type is now RUNTIME (from DB), not build-time.
// Use useAccountType() hook in components instead of isBusinessOwnerMode.

export type AppMode = 'local' | 'cloud' | 'demo'

export const CURRENT_MODE: AppMode =
  (import.meta.env.VITE_MODE as AppMode) || 'demo'

export const isDemoMode = CURRENT_MODE === 'demo'
export const isLocalMode = CURRENT_MODE === 'local'
export const isCloudMode = CURRENT_MODE === 'cloud'

/**
 * @deprecated Use `useAccountType().isSolo` hook instead for runtime detection.
 * Kept only as a build-time fallback for non-React contexts (e.g. demo data init).
 */
export type UserType = 'bookkeeper' | 'business-owner'
export const CURRENT_USER_TYPE: UserType =
  (import.meta.env.VITE_USER_TYPE as UserType) || 'bookkeeper'
export const isBusinessOwnerMode = CURRENT_USER_TYPE === 'business-owner'
