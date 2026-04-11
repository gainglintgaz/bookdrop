import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { supabase } from '@/lib/supabase'
import { tenantConfig } from '@/lib/tenant.config'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import type { ReminderTone } from '@/types'
import { isDemoMode } from '@/lib/mode'
import { Save, CheckCircle, ExternalLink } from 'lucide-react'

export function SettingsPage() {
  const bookkeeper = useAuthStore(state => state.bookkeeper)
  const fetchBookkeeper = useAuthStore(state => state.fetchBookkeeper)

  const [fullName, setFullName] = useState('')
  const [practiceName, setPracticeName] = useState('')
  const [replyToEmail, setReplyToEmail] = useState('')
  const [reminderTone, setReminderTone] = useState<ReminderTone>('professional')
  const [notifyOnComplete, setNotifyOnComplete] = useState(true)
  const [notifyOnAnyUpload, setNotifyOnAnyUpload] = useState(false)
  const [notifyOnLate, setNotifyOnLate] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)

  // Initialize from bookkeeper data
  useEffect(() => {
    if (!bookkeeper) return
    setFullName(bookkeeper.full_name)
    setPracticeName(bookkeeper.practice_name)
    setReplyToEmail(bookkeeper.reply_to_email)
    setReminderTone(bookkeeper.reminder_tone)
    setNotifyOnComplete(bookkeeper.notify_on_complete)
    setNotifyOnAnyUpload(bookkeeper.notify_on_any_upload)
    setNotifyOnLate(bookkeeper.notify_on_late)
  }, [bookkeeper])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bookkeeper) return

    setError(null)
    setSaved(false)
    setSubmitting(true)

    const { error: updateErr } = await supabase
      .from('bookkeepers')
      .update({
        full_name: fullName.trim(),
        practice_name: practiceName.trim(),
        reply_to_email: replyToEmail.trim(),
        reminder_tone: reminderTone,
        notify_on_complete: notifyOnComplete,
        notify_on_any_upload: notifyOnAnyUpload,
        notify_on_late: notifyOnLate,
      })
      .eq('id', bookkeeper.id)

    setSubmitting(false)

    if (updateErr) {
      setError(updateErr.message)
    } else {
      setSaved(true)
      fetchBookkeeper()
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const inputClasses = cn(
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm',
    'focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none',
  )

  if (!bookkeeper) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Manage your {tenantConfig.practitionerLabel.toLowerCase()} profile and preferences.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {error && (
          <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Profile */}
        <fieldset className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Profile</legend>

          <div>
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">Full Name</label>
            <input id="fullName" required value={fullName} onChange={e => setFullName(e.target.value)} className={inputClasses} />
          </div>

          <div>
            <label htmlFor="practiceName" className="block text-sm font-medium text-gray-700">Practice Name</label>
            <input id="practiceName" value={practiceName} onChange={e => setPracticeName(e.target.value)} className={inputClasses} placeholder="Smith Bookkeeping LLC" />
          </div>

          <div>
            <label htmlFor="replyToEmail" className="block text-sm font-medium text-gray-700">Reply-To Email</label>
            <input id="replyToEmail" type="email" required value={replyToEmail} onChange={e => setReplyToEmail(e.target.value)} className={inputClasses} />
            <p className="mt-1 text-xs text-gray-400">
              {tenantConfig.clientLabel}s will see this on reminder emails.
            </p>
          </div>
        </fieldset>

        {/* Reminders */}
        <fieldset className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Reminders</legend>

          <div>
            <label htmlFor="reminderTone" className="block text-sm font-medium text-gray-700">Reminder Tone</label>
            <select
              id="reminderTone"
              value={reminderTone}
              onChange={e => setReminderTone(e.target.value as ReminderTone)}
              className={cn(inputClasses, 'mt-1')}
            >
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="firm">Firm</option>
            </select>
          </div>
        </fieldset>

        {/* Notifications */}
        <fieldset className="space-y-3 rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Notifications</legend>

          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={notifyOnComplete} onChange={e => setNotifyOnComplete(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary" />
            <span className="text-sm text-gray-700">Notify me when a {tenantConfig.clientLabel.toLowerCase()} completes all uploads</span>
          </label>

          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={notifyOnAnyUpload} onChange={e => setNotifyOnAnyUpload(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary" />
            <span className="text-sm text-gray-700">Notify me on every upload</span>
          </label>

          <label className="flex items-center gap-2.5">
            <input type="checkbox" checked={notifyOnLate} onChange={e => setNotifyOnLate(e.target.checked)} className="rounded border-gray-300 text-primary focus:ring-primary" />
            <span className="text-sm text-gray-700">Notify me when a {tenantConfig.clientLabel.toLowerCase()} is late</span>
          </label>
        </fieldset>

        {/* Plan & Billing */}
        <fieldset className="rounded-lg border border-gray-200 bg-white p-5">
          <legend className="px-2 text-sm font-semibold text-gray-700">Plan & Billing</legend>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900 capitalize">{bookkeeper.plan} Plan</p>
              <p className="text-xs text-gray-500">
                {bookkeeper.plan === 'free' ? 'Up to 3 clients' : bookkeeper.plan === 'starter' ? 'Beta access — up to 15 clients' : 'Beta access — unlimited clients'}
              </p>
            </div>
            {bookkeeper.plan === 'starter' && !bookkeeper.stripe_customer_id && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Beta — Full Access
              </span>
            )}
            {bookkeeper.stripe_customer_id && (
              <button
                type="button"
                disabled={billingLoading || isDemoMode}
                onClick={async () => {
                  if (isDemoMode || !bookkeeper) return
                  setBillingLoading(true)
                  try {
                    const endpoint = bookkeeper.stripe_customer_id
                      ? '/api/stripe/portal'
                      : '/api/stripe/create-checkout'
                    const body = bookkeeper.stripe_customer_id
                      ? { bookkeeperId: bookkeeper.id }
                      : { bookkeeperId: bookkeeper.id, plan: bookkeeper.plan === 'free' ? 'starter' : 'pro' }

                    const res = await fetch(endpoint, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    const data = await res.json()
                    if (data.url) {
                      window.location.href = data.url
                    } else {
                      setError(data.error ?? 'Failed to open billing')
                    }
                  } catch {
                    setError('Failed to connect to billing')
                  } finally {
                    setBillingLoading(false)
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/5',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {billingLoading ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <>
                    <ExternalLink className="h-3 w-3" />
                    Manage Billing
                  </>
                )}
              </button>
            )}
          </div>
          {isDemoMode && (
            <p className="mt-2 text-xs text-gray-400">Billing is disabled in demo mode.</p>
          )}
        </fieldset>

        {/* Save */}
        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle className="h-4 w-4" />
              Saved
            </span>
          )}
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
                <Save className="h-4 w-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
