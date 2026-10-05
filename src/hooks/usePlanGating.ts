// src/hooks/usePlanGating.ts
// Enforces plan limits: free=3 clients, starter=15, pro=unlimited.

import { useMemo } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { tenantConfig } from '@/lib/tenant.config'
import type { Plan } from '@/types'

interface PlanGating {
  canAddClient: boolean
  clientLimit: number | null // null = unlimited
  currentPlan: Plan
  isAtLimit: boolean
  upgradeMessage: string | null
}

export function usePlanGating(currentClientCount: number): PlanGating {
  const plan = useAuthStore(state => state.bookkeeper?.plan ?? 'free')

  return useMemo(() => {
    const limit = tenantConfig.planLimits[plan]
    const isAtLimit = limit !== null && currentClientCount >= limit
    const canAddClient = !isAtLimit

    let upgradeMessage: string | null = null
    if (isAtLimit) {
      if (plan === 'free') {
        upgradeMessage = `Free plan allows up to ${limit} ${tenantConfig.clientLabel.toLowerCase()}s. Upgrade to Starter for up to ${tenantConfig.planLimits.starter}.`
      } else if (plan === 'starter') {
        upgradeMessage = `Starter plan allows up to ${limit} ${tenantConfig.clientLabel.toLowerCase()}s. Upgrade to Pro for unlimited.`
      }
    }

    return { canAddClient, clientLimit: limit, currentPlan: plan, isAtLimit, upgradeMessage }
  }, [plan, currentClientCount])
}
