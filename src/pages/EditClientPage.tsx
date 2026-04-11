import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { tenantConfig } from '@/lib/tenant.config'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ErrorState } from '@/components/shared/ErrorState'
import type { Client, DocumentRequirement, DocType } from '@/types'
import { Plus, Trash2, GripVertical, Save } from 'lucide-react'

interface RequirementDraft {
  key: string
  id: string | null // null = new, string = existing
  label: string
  doc_type: DocType
  required: boolean
}

let keyCounter = 1000
function nextKey(): string {
  return `edit-${++keyCounter}`
}

export function EditClientPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()

  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notesForClient, setNotesForClient] = useState('')
  const [notesPrivate, setNotesPrivate] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [requirements, setRequirements] = useState<RequirementDraft[]>([])
  const [submitting, setSubmitting] = useState(false)

  const loadClient = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError(null)

    try {
      const { data: clientData, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle()

      if (clientErr) throw new Error(clientErr.message)
      if (!clientData) throw new Error('Client not found')

      setClient(clientData)
      setBusinessName(clientData.business_name)
      setContactName(clientData.contact_name ?? '')
      setContactEmail(clientData.contact_email)
      setNotesForClient(clientData.notes_for_client ?? '')
      setNotesPrivate(clientData.notes_private ?? '')
      setIsActive(clientData.is_active)

      // Load requirements
      const { data: reqs, error: reqErr } = await supabase
        .from('document_requirements')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true })

      if (reqErr) throw new Error(reqErr.message)

      setRequirements(
        (reqs ?? []).map((r: DocumentRequirement) => ({
          key: nextKey(),
          id: r.id,
          label: r.label,
          doc_type: r.doc_type,
          required: r.required,
        })),
      )
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load client')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    loadClient()
  }, [loadClient])

  const addRequirement = () => {
    setRequirements(prev => [
      ...prev,
      { key: nextKey(), id: null, label: '', doc_type: 'other', required: true },
    ])
  }

  const removeRequirement = (key: string) => {
    setRequirements(prev => prev.filter(r => r.key !== key))
  }

  const updateRequirement = (key: string, field: keyof RequirementDraft, value: string | boolean) => {
    setRequirements(prev =>
      prev.map(r => (r.key === key ? { ...r, [field]: value } : r)),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!client) return

    setError(null)
    setSubmitting(true)

    try {
      // Update client row
      const { error: updateErr } = await supabase
        .from('clients')
        .update({
          business_name: businessName.trim(),
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim(),
          notes_for_client: notesForClient.trim() || null,
          notes_private: notesPrivate.trim() || null,
          is_active: isActive,
        })
        .eq('id', client.id)

      if (updateErr) throw new Error(updateErr.message)

      // Delete removed requirements (those with existing IDs no longer in the list)
      const { data: existingReqs } = await supabase
        .from('document_requirements')
        .select('id')
        .eq('client_id', client.id)

      const currentIds = new Set(requirements.filter(r => r.id).map(r => r.id))
      const toDelete = (existingReqs ?? []).filter(r => !currentIds.has(r.id)).map(r => r.id)

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('document_requirements')
          .delete()
          .in('id', toDelete)
        if (delErr) throw new Error(delErr.message)
      }

      // Upsert requirements
      const validReqs = requirements.filter(r => r.label.trim())
      for (let i = 0; i < validReqs.length; i++) {
        const req = validReqs[i]
        if (req.id) {
          // Update existing
          const { error: upErr } = await supabase
            .from('document_requirements')
            .update({ label: req.label.trim(), doc_type: req.doc_type, required: req.required, sort_order: i })
            .eq('id', req.id)
          if (upErr) throw new Error(upErr.message)
        } else {
          // Insert new
          const { error: insErr } = await supabase
            .from('document_requirements')
            .insert({
              client_id: client.id,
              label: req.label.trim(),
              doc_type: req.doc_type,
              required: req.required,
              sort_order: i,
            })
          if (insErr) throw new Error(insErr.message)
        }
      }

      navigate(`/clients/${client.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClasses = cn(
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm',
    'focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none',
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error && !client) {
    return (
      <div className="p-8">
        <ErrorState message={error} onRetry={loadClient} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h2 className="text-xl font-bold text-gray-900">Edit {tenantConfig.clientLabel}</h2>
      <p className="mt-1 text-sm text-gray-500">{client?.business_name}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {error && (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Business info */}
        <fieldset className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Business Info</legend>

          <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">Business Name *</label>
            <input id="businessName" required value={businessName} onChange={e => setBusinessName(e.target.value)} className={inputClasses} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contactName" className="block text-sm font-medium text-gray-700">Contact Name</label>
              <input id="contactName" value={contactName} onChange={e => setContactName(e.target.value)} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">Contact Email *</label>
              <input id="contactEmail" type="email" required value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={inputClasses} />
            </div>
          </div>

          <div>
            <label htmlFor="notesForClient" className="block text-sm font-medium text-gray-700">Note for {tenantConfig.clientLabel.toLowerCase()}</label>
            <textarea id="notesForClient" rows={2} value={notesForClient} onChange={e => setNotesForClient(e.target.value)} className={inputClasses} />
          </div>

          <div>
            <label htmlFor="notesPrivate" className="block text-sm font-medium text-gray-700">Private Notes</label>
            <textarea id="notesPrivate" rows={2} value={notesPrivate} onChange={e => setNotesPrivate(e.target.value)} className={inputClasses} />
          </div>

          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary" />
            <span className="text-sm text-gray-700">Active (inactive clients won't receive reminders)</span>
          </label>
        </fieldset>

        {/* Requirements */}
        <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Required Documents</legend>

          {requirements.map((req, index) => (
            <div key={req.key} className="flex items-start gap-2 rounded-md border border-gray-100 bg-gray-50 p-3">
              <GripVertical className="mt-2 h-4 w-4 shrink-0 cursor-grab text-gray-300" />
              <div className="flex-1 space-y-2">
                <input
                  value={req.label}
                  onChange={e => updateRequirement(req.key, 'label', e.target.value)}
                  className={cn(inputClasses, 'mt-0')}
                  placeholder={`Document ${index + 1} label`}
                />
                <div className="flex items-center gap-3">
                  <select
                    value={req.doc_type}
                    onChange={e => updateRequirement(req.key, 'doc_type', e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="bank">Bank Statement</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="receipt">Receipt / Invoice</option>
                    <option value="payroll">Payroll</option>
                    <option value="w2">W-2</option>
                    <option value="1099_nec">1099-NEC</option>
                    <option value="1099_misc">1099-MISC</option>
                    <option value="1099_int">1099-INT</option>
                    <option value="1099_div">1099-DIV</option>
                    <option value="1099_k">1099-K</option>
                    <option value="1040">1040 / Tax Return</option>
                    <option value="1098">1098 / Mortgage</option>
                    <option value="investment">Investment</option>
                    <option value="mortgage">Mortgage Statement</option>
                    <option value="other">Other</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={req.required} onChange={e => updateRequirement(req.key, 'required', e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary" />
                    Required
                  </label>
                </div>
              </div>
              <button type="button" onClick={() => removeRequirement(req.key)} className="mt-2 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button type="button" onClick={addRequirement} className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-primary hover:text-primary">
            <Plus className="h-4 w-4" />
            Add document
          </button>
        </fieldset>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              'flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white',
              'hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {submitting ? <LoadingSpinner size="sm" className="border-white/30 border-t-white" /> : <><Save className="h-4 w-4" />Save Changes</>}
          </button>
        </div>
      </form>
    </div>
  )
}
