import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { tenantConfig } from '@/lib/tenant.config'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { cn } from '@/lib/utils'
import { isDemoMode } from '@/lib/mode'
import type { AccountType } from '@/types'
import { CheckCircle, Users, Clock, Download, Briefcase, Calculator, Receipt, BarChart3 } from 'lucide-react'

const practitionerBenefits = [
  { icon: Users, text: 'Free plan — up to 3 clients' },
  { icon: Clock, text: 'Set up in under 2 minutes' },
  { icon: Download, text: 'Parse, reconcile, and export instantly' },
  { icon: CheckCircle, text: 'No credit card required' },
]

const soloBenefits = [
  { icon: Receipt, text: 'Receipt scanning & categorization' },
  { icon: BarChart3, text: 'Financial tracking & reports' },
  { icon: CheckCircle, text: 'Organize your books yourself' },
  { icon: Calculator, text: 'Free plan available' },
]

export function SignupPage() {
  const navigate = useNavigate()
  const signUp = useAuthStore(state => state.signUp)
  const signUpSolo = useAuthStore(state => state.signUpSolo)

  const [accountType, setAccountType] = useState<AccountType>('practitioner')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSolo = accountType === 'solo'
  const benefits = isSolo ? soloBenefits : practitionerBenefits

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (isSolo && !businessName.trim()) {
      setError('Business name is required.')
      return
    }

    setSubmitting(true)
    const result = isSolo
      ? await signUpSolo(email, password, fullName, businessName)
      : await signUp(email, password, fullName)
    setSubmitting(false)

    if (result.error) {
      setError(result.error)
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
          <p className="mt-1 text-sm text-white/70">
            {isSolo ? 'Smart finance tools for business owners' : 'Document collection for bookkeepers'}
          </p>
        </div>

        <div>
          <h2 className="text-3xl font-bold leading-tight text-white">
            {isSolo ? (
              <>Automate your<br />bookkeeping.</>
            ) : (
              <>Your clients upload.<br />You stay organized.</>
            )}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/80">
            {isSolo
              ? 'Receipt scanning, categorization, and financial tracking — all in one place. Organize your own books.'
              : 'Create your free account in 30 seconds. Add clients, share upload links, and start collecting documents today.'}
          </p>
          <div className="mt-8 space-y-4">
            {benefits.map(item => (
              <div key={item.text} className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <item.icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm text-white/90">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-white/40">Upgrade anytime · Cancel anytime</p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Link to="/" className="text-2xl font-bold text-primary-dark lg:hidden">{tenantConfig.productName}</Link>
            <h2 className="mt-2 text-xl font-bold text-gray-900 lg:mt-0">Create your account</h2>
            <p className="mt-1 text-sm text-gray-500">
              {isSolo ? 'Free receipt scanning & financial tracking' : 'Free forever for up to 3 clients'}
            </p>
          </div>

          {/* Account type toggle */}
          <div className="mb-6 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              type="button"
              onClick={() => setAccountType('practitioner')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                accountType === 'practitioner'
                  ? 'bg-white text-primary-dark shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Users className="h-4 w-4" />
              Bookkeeper / CPA
            </button>
            <button
              type="button"
              onClick={() => setAccountType('solo')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all',
                accountType === 'solo'
                  ? 'bg-white text-primary-dark shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              <Briefcase className="h-4 w-4" />
              Business Owner
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isDemoMode && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                <strong>Demo mode</strong> — fill in anything and click Create Account to explore the app.
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">Full Name</label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className={inputClasses}
                placeholder={isSolo ? 'Mike Torres' : 'Jane Smith'}
              />
            </div>

            {isSolo && (
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">Business Name</label>
                <input
                  id="businessName"
                  type="text"
                  required
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  className={inputClasses}
                  placeholder="Acme Supplies LLC"
                />
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
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClasses}
                placeholder="Minimum 8 characters"
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
              {submitting ? <LoadingSpinner size="sm" className="border-white/30 border-t-white" /> : 'Create Account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
