import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { backendRequest, BackendError } from '@/lib/backend'
import { tenantConfig } from '@/lib/tenant.config'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { cn } from '@/lib/utils'

/** Local recovery only. The provider verifies and consumes the reset token. */
export function ResetPasswordPage() {
  const [token, setToken] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token')
    return value && value.length <= 512 ? value : null
  })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || submitting) return
    setError(null)
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await backendRequest('/auth/update-password', { token, password })
      setPassword('')
      setConfirm('')
      setToken(null)
      setDone(true)
    } catch (cause: unknown) {
      setError(cause instanceof BackendError && cause.code === 'INVALID_INPUT'
        ? 'This reset link has expired or already been used. Please request a new link.'
        : cause instanceof Error ? cause.message : 'Unable to reset your password. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }
  const inputClasses = cn(
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm',
    'focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none',
  )

  return (
    <div className="flex min-h-svh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary-dark">{tenantConfig.productName}</h1>
          <p className="mt-1 text-sm text-gray-500">Choose a new password</p>
        </div>
        {done ? (
          <div role="status" className="rounded-lg border border-success/30 bg-success/5 p-6 text-center">
            <p className="font-medium text-success">Your password has been reset.</p>
            <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">Sign in</Link>
          </div>
        ) : !token ? (
          <div role="alert" className="rounded-md border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            <p>This reset link is missing or invalid.</p>
            <Link to="/forgot-password" className="mt-3 inline-block text-primary hover:underline">Request a new link</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={submitting}>
            {error && <p role="alert" className="rounded-md border border-danger/20 bg-danger/5 p-3 text-sm text-danger">{error}</p>}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
                value={password} onChange={event => setPassword(event.target.value)} disabled={submitting} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={128}
                value={confirm} onChange={event => setConfirm(event.target.value)} disabled={submitting} className={inputClasses} />
            </div>
            <button type="submit" disabled={submitting} className={cn(
              'flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white',
              'hover:bg-primary-light focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}>
              {submitting ? <LoadingSpinner size="sm" className="border-white/30 border-t-white" /> : 'Reset password'}
            </button>
            <Link to="/forgot-password" className="inline-block text-sm text-primary hover:underline">Request a new link</Link>
          </form>
        )}
      </div>
    </div>
  )
}
