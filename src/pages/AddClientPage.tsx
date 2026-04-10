import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth.store'
import { tenantConfig } from '@/lib/tenant.config'
import { generatePortalToken, cn } from '@/lib/utils'
import { checkAndFireTrigger, TRIGGER_FIRST_CLIENT, TRIGGER_THREE_CLIENTS } from '@/lib/engagement-triggers'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import type { DocType } from '@/types'
import { Plus, Trash2, GripVertical } from 'lucide-react'

interface RequirementDraft {
  key: string // temp key for React
  label: string
  doc_type: DocType
  required: boolean
}

let keyCounter = 0
function nextKey(): string {
  return `draft-${++keyCounter}`
}

function defaultRequirements(): RequirementDraft[] {
  return tenantConfig.defaultDocumentTypes.map(dt => ({
    key: nextKey(),
    label: dt.label,
    doc_type: dt.doc_type,
    required: dt.required,
  }))
}

export function AddClientPage() {
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)

  const [businessName, setBusinessName] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [notesForClient, setNotesForClient] = useState('')
  const [notesPrivate, setNotesPrivate] = useState('')
  const [requirements, setRequirements] = useState<RequirementDraft[]>(defaultRequirements)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nudge, setNudge] = useState<string | null>(null)

  const addRequirement = () => {
    setRequirements(prev => [
      ...prev,
      { key: nextKey(), label: '', doc_type: 'other', required: true },
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
    if (!user) return

    setError(null)
    setSubmitting(true)

    try {
      const portalToken = generatePortalToken()

      // Insert client
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .insert({
          bookkeeper_id: user.id,
          business_name: businessName.trim(),
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim(),
          portal_token: portalToken,
          notes_for_client: notesForClient.trim() || null,
          notes_private: notesPrivate.trim() || null,
        })
        .select()
        .maybeSingle()

      if (clientErr) throw new Error(clientErr.message)
      if (!client) throw new Error('Client was not created')

      // Insert requirements
      const validReqs = requirements.filter(r => r.label.trim())
      if (validReqs.length > 0) {
        const { error: reqErr } = await supabase
          .from('document_requirements')
          .insert(
            validReqs.map((r, i) => ({
              client_id: client.id,
              label: r.label.trim(),
              doc_type: r.doc_type,
              required: r.required,
              sort_order: i,
            })),
          )

        if (reqErr) throw new Error(reqErr.message)
      }

      // Insert default reminder schedules
      if (tenantConfig.defaultReminderDays.length > 0) {
        const { error: remErr } = await supabase
          .from('reminder_schedules')
          .insert(
            tenantConfig.defaultReminderDays.map((day, i) => ({
              client_id: client.id,
              day_of_month: day,
              reminder_number: i + 1,
            })),
          )

        if (remErr) throw new Error(remErr.message)
      }

      // Fire engagement triggers based on client count
      const { count } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('bookkeeper_id', user.id)

      let nudgeFired = false

      if (count === 1) {
        checkAndFireTrigger(TRIGGER_FIRST_CLIENT, () => {
          setNudge('First client added! Copy their portal link and send it to them now.')
          nudgeFired = true
          setTimeout(() => navigate('/dashboard'), 2500)
        })
      }
      if (count === 3) {
        checkAndFireTrigger(TRIGGER_THREE_CLIENTS, () => {
          setNudge('3 clients in — anything confusing so far? Reply to your invite email.')
          nudgeFired = true
          setTimeout(() => navigate('/dashboard'), 2500)
        })
      }
      if (!nudgeFired) {
        navigate('/dashboard')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create client'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const inputClasses = cn(
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm',
    'focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none',
  )

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h2 className="text-xl font-bold text-gray-900">Add {tenantConfig.clientLabel}</h2>
      <p className="mt-1 text-sm text-gray-500">
        They'll receive a unique upload link — no account needed.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {error && (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        {nudge && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {nudge}
          </div>
        )}

        {/* Business info */}
        <fieldset className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Business Info</legend>

          <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">
              Business Name *
            </label>
            <input
              id="businessName"
              required
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              className={inputClasses}
              placeholder="Acme Corp"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="contactName" className="block text-sm font-medium text-gray-700">
                Contact Name
              </label>
              <input
                id="contactName"
                value={contactName}
                onChange={e => setContactName(e.target.value)}
                className={inputClasses}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700">
                Contact Email *
              </label>
              <input
                id="contactEmail"
                type="email"
                required
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                className={inputClasses}
                placeholder="jane@acme.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="notesForClient" className="block text-sm font-medium text-gray-700">
              Note for {tenantConfig.clientLabel.toLowerCase()} (shown on upload page)
            </label>
            <textarea
              id="notesForClient"
              rows={2}
              value={notesForClient}
              onChange={e => setNotesForClient(e.target.value)}
              className={inputClasses}
              placeholder="Please upload by the 5th of each month"
            />
          </div>

          <div>
            <label htmlFor="notesPrivate" className="block text-sm font-medium text-gray-700">
              Private Notes (only you can see)
            </label>
            <textarea
              id="notesPrivate"
              rows={2}
              value={notesPrivate}
              onChange={e => setNotesPrivate(e.target.value)}
              className={inputClasses}
              placeholder="Switched from QuickBooks in March..."
            />
          </div>
        </fieldset>

        {/* Document requirements */}
        <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">
            Required Documents
          </legend>
          <p className="text-xs text-gray-500">
            What documents should this {tenantConfig.clientLabel.toLowerCase()} upload each month?
          </p>

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
                    <input
                      type="checkbox"
                      checked={req.required}
                      onChange={e => updateRequirement(req.key, 'required', e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    Required
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeRequirement(req.key)}
                className="mt-2 rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRequirement}
            className="flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Add document
          </button>
        </fieldset>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
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
            {submitting ? (
              <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create {tenantConfig.clientLabel}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
