// src/hooks/useClients.ts
// Fetches clients with their submission status for a given period.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { isDemoMode, isLocalMode } from '@/lib/mode'
import { backendRequest } from '@/lib/backend'
import { getDemoClients } from '@/lib/demo-data'
import { computeSubmissionStatus } from '@/types'
import type { ClientWithStatus, RequirementWithUploads, DocumentUpload, DocumentRequirement, Client } from '@/types'
import { getCurrentPeriod } from '@/lib/utils'

interface UseClientsReturn {
  clients: ClientWithStatus[]
  loading: boolean
  error: string | null
  period: { year: number; month: number }
  setPeriod: (period: { year: number; month: number }) => void
  refresh: () => Promise<void>
}

export function useClients(): UseClientsReturn {
  const [clients, setClients] = useState<ClientWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState(getCurrentPeriod)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      if (isDemoMode) {
        setClients(getDemoClients())
        return
      }

      let clientRows: Client[]
      let requirements: DocumentRequirement[]
      let uploads: DocumentUpload[]
      if (isLocalMode) {
        const result = await backendRequest<{ clients: Client[]; requirements: DocumentRequirement[]; uploads: DocumentUpload[] }>('/clients/status', { year: period.year, month: period.month })
        clientRows = result.clients
        requirements = result.requirements
        uploads = result.uploads
      } else {
        const { data, error: clientErr } = await supabase
          .from('clients')
          .select('*')
          .order('business_name', { ascending: true })

        if (clientErr) throw new Error(clientErr.message)
        clientRows = data ?? []
        const clientIds = clientRows.map(c => c.id)

        const [reqResult, uploadResult] = clientIds.length ? await Promise.all([
          supabase
            .from('document_requirements')
            .select('*')
            .in('client_id', clientIds),
          supabase
            .from('document_uploads')
            .select('*')
            .in('client_id', clientIds)
            .eq('period_year', period.year)
            .eq('period_month', period.month),
        ]) : [{ data: [], error: null }, { data: [], error: null }]

        if (reqResult.error) throw new Error(reqResult.error.message)
        if (uploadResult.error) throw new Error(uploadResult.error.message)

        requirements = reqResult.data ?? []
        uploads = uploadResult.data ?? []
      }

      // Build enriched client list
      const enriched: ClientWithStatus[] = clientRows.map((client: Client) => {
        const clientReqs = requirements
          .filter((r: DocumentRequirement) => r.client_id === client.id)
          .sort((a: DocumentRequirement, b: DocumentRequirement) => a.sort_order - b.sort_order)

        const reqsWithUploads: RequirementWithUploads[] = clientReqs.map((req: DocumentRequirement) => ({
          ...req,
          uploads: uploads.filter((u: DocumentUpload) => u.requirement_id === req.id),
        }))

        return {
          ...client,
          requirements: reqsWithUploads,
          submissionStatus: computeSubmissionStatus(reqsWithUploads),
          lateRate: null, // Computed separately for performance
          averageSubmissionDay: null,
        }
      })

      setClients(enriched)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load clients'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [period.year, period.month])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { clients, loading, error, period, setPeriod, refresh: fetchAll }
}
