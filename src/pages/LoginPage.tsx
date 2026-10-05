import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { tenantConfig } from '@/lib/tenant.config'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { cn } from '@/lib/utils'
import { isDemoMode } from '@/lib/mode'
import { FileText, Zap, Shield } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const signIn = useAuthStore(state => state.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)

    if (signInError) {
      setError(signInError)
    } else {
      navigate('/dashboard')
    }
  }

  const inputClasses = cn(
    'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm',
    'focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none',
  )

  return (
    <div className="flex min-h-svh">
      {/* Left — value prop */}
      <div className="hidden w-[45%] bg-gradient-to-br from-primary-dark to-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div>
          <Link to="/" className="text-2xl font-bold text-white">{tenantConfig.productName}</Link>
          <p className="mt-1 text-sm text-white/70">Document collection for bookkeepers</p>
        </div>

        <div>
          <h2 className="text-3xl font-bold leading-tight text-white">
            Stop chasing clients<br />for documents.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">
            Unique upload links, auto-reminders, statement parsing, reconciliation — everything
            you need to collect and process client documents in one place.
          </p>
          <div className="mt-8 space-y-3">
            {[
              { icon: FileText, text: 'Clients upload via unique links — no accounts needed' },
              { icon: Zap, text: 'Auto-parse bank and credit card statements' },
              { icon: Shield, text: 'Readiness checks before you start bookkeeping' },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm text-white/90">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">Free plan · 3 clients · No credit card required</p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Link to="/" className="text-2xl font-bold text-primary-dark lg:hidden">{tenantConfig.productName}</Link>
            <h2 className="mt-2 text-xl font-bold text-gray-900 lg:mt-0">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isDemoMode && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <strong>Demo mode</strong> — click Sign In with any email/password to explore the app.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClasses}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot?</Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClasses}
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white',
                'hover:bg-primary-light focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:outline-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {submitting ? <LoadingSpinner size="sm" className="border-white/30 border-t-white" /> : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
