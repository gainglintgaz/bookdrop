// src/hooks/useAccountType.ts
// Runtime account type detection — replaces build-time VITE_USER_TYPE for UI branching

import { useAuthStore } from '@/stores/auth.store'

export function useAccountType() {
  const bookkeeper = useAuthStore(state => state.bookkeeper)
  return {
    accountType: bookkeeper?.account_type ?? 'practitioner',
    isPractitioner: bookkeeper?.account_type !== 'solo',
    isSolo: bookkeeper?.account_type === 'solo',
    selfClientId: bookkeeper?.self_client_id ?? null,
    businessName: bookkeeper?.business_name ?? null,
  }
}
