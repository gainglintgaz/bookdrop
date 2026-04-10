// src/hooks/useAppMode.ts
// React hook wrapping mode.ts constants + runtime account type for component use

import { useMemo } from 'react'
import {
  CURRENT_MODE,
  isDemoMode,
  isLocalMode,
  isCloudMode,
} from '@/lib/mode'
import { useAccountType } from '@/hooks/useAccountType'

export function useAppMode() {
  const { isSolo, isPractitioner } = useAccountType()

  return useMemo(
    () => ({
      currentMode: CURRENT_MODE,
      isDemoMode,
      isLocalMode,
      isCloudMode,
      // Runtime account type (replaces build-time VITE_USER_TYPE)
      isSolo,
      isPractitioner,
      isBusinessOwnerMode: isSolo,
      isFinancePrep: isSolo,
      getIntelligenceMode: () => ({
        runFullBrain: true,
        autoGeneratePackage: isSolo,
        showClientManagement: isPractitioner,
      }),
    }),
    [isSolo, isPractitioner],
  )
}
