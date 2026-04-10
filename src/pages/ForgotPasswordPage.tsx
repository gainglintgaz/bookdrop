import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { tenantConfig } from '@/lib/tenant.config'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { cn } from '@/lib/utils'

export function ForgotPasswordPage() {
  const resetPassword = useAuthStore(state => state.resetPassword)
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: resetError } = await resetPassword(email)
    setSubmitting(false)

    if (resetError) {
      setError(resetError)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-primary-dark">{tenantConfig.productName}</h1>
          <p className="mt-1 text-sm text-gray-500">Reset your password</p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-success/30 bg-success/5 p-6 text-center">
            <p className="font-medium text-success">Check your email</p>
            <p className="mt-1 text-sm text-gray-600">
              We sent a password reset link to <strong>{email}</strong>
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={cn(
                  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm',
                  'focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none',
                )}
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white',
                'hover:bg-primary-light focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting ? <LoadingSpinner size="sm" className="border-white/30 border-t-white" /> : 'Send Reset Link'}
            </button>

            <p className="text-center text-sm text-gray-500">
              <Link to="/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
