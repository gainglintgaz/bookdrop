import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tenantConfig } from '@/lib/tenant.config'
import { cn } from '@/lib/utils'
import {
  FileText, Zap, Shield, Send, BarChart3,
  CheckCircle, ArrowRight, Users, Star, Brain,
  Camera, Package, ChevronRight,
} from 'lucide-react'

// ---- Data ----

const howItWorks = [
  {
    step: '1',
    title: 'Add your clients',
    description: 'Create client profiles and define which documents you need each month — bank statements, credit cards, payroll, receipts.',
    icon: Users,
  },
  {
    step: '2',
    title: 'Clients upload via unique links',
    description: 'Each client gets a personal upload link. No accounts, no passwords, no friction. They drag, drop, and done.',
    icon: FileText,
  },
  {
    step: '3',
    title: 'Review ready-made packages',
    description: 'Documents are auto-categorized, parsed, and reconciled. Download everything as a bookkeeper-ready ZIP or export to QuickBooks.',
    icon: CheckCircle,
  },
]

const features = [
  {
    icon: Zap,
    title: 'Smart Statement Parser',
    description: 'Auto-extract transactions, balances, and dates from bank and credit card statements. CSV and PDF supported.',
  },
  {
    icon: BarChart3,
    title: 'Auto-Categorization',
    description: '200+ vendor database with IRS deduction mapping. Transactions categorized automatically on upload.',
  },
  {
    icon: Brain,
    title: 'Smart Document Analysis',
    description: 'Flag personal expenses mixed with business, surface patterns, and organize documents by category automatically.',
  },
  {
    icon: Camera,
    title: 'Receipt Scanner',
    description: 'Clients can snap photos, upload files, or paste from clipboard. OCR extracts vendor, amount, and date.',
  },
  {
    icon: Package,
    title: 'Bookkeeper Packages',
    description: 'Export reconciled data to QuickBooks, Xero, or OFX. Download complete monthly packages as ZIP.',
  },
  {
    icon: Send,
    title: 'Smart Reminders',
    description: 'Auto-escalating email reminders on your schedule. Friendly first, then firm. Manual one-click reminders too.',
  },
]

const socialProof = [
  { value: '200+', label: 'Vendor database' },
  { value: '5', label: 'Export formats' },
  { value: '11', label: 'Intelligence engines' },
  { value: '16', label: 'Built-in analysis engines' },
]

const pricing = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try it out with a few clients',
    features: [
      'Up to 3 clients',
      'Unique upload links',
      'Statement parser',
      'Readiness checks',
      'CSV & ZIP exports',
    ],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Starter',
    price: '$39',
    period: '/month',
    description: 'For solo bookkeepers growing their practice',
    features: [
      'Up to 15 clients',
      'Everything in Free',
      'Auto-reminders',
      'ZIP downloads',
      'Auto-reconciliation',
      'Bookkeeper packages',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/month',
    description: 'For established practices',
    features: [
      'Unlimited clients',
      'Everything in Starter',
      'Late-rate insights',
      'White-label emails',
      'Priority support',
      'Custom branding',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
]

const soloPricing = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'For small businesses doing their own books',
    features: [
      '1 business entity',
      'Financial tracking & reports',
      'Receipt scanner (basic)',
      'Categorization engine',
      'CSV export',
    ],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Plus',
    price: '$19',
    period: '/month',
    description: 'Full analysis suite for growing businesses',
    features: [
      '1 business entity',
      'Everything in Free',
      'Full 16-engine analysis pipeline',
      'Finance prep packages',
      'QuickBooks / Xero export',
      'Cash flow forecasting',
    ],
    cta: 'Start Free Trial',
    highlighted: true,
  },
  {
    name: 'Growth',
    price: '$29',
    period: '/month',
    description: 'For businesses with multiple entities',
    features: [
      'Up to 3 business entities',
      'Everything in Plus',
      'Multi-entity support',
      'Quarterly report packages',
      'Priority support',
    ],
    cta: 'Start Free Trial',
    highlighted: false,
  },
]

// ---- Component ----

export function LandingPage() {
  const [pricingAudience, setPricingAudience] = useState<'practitioner' | 'solo'>('practitioner')
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-svh bg-white">
      {/* ---- Navigation ---- */}
      <nav className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-bold text-emerald-700">{tenantConfig.productName}</h1>
          <div className="hidden items-center gap-6 sm:flex">
            <button
              onClick={() => scrollTo('features')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => scrollTo('pricing')}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              Pricing
            </button>
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Login
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Sign Up
            </Link>
          </div>
          {/* Mobile nav */}
          <div className="flex items-center gap-3 sm:hidden">
            <Link to="/login" className="text-sm font-medium text-gray-600">
              Login
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* ---- Hero Section ---- */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/80 via-white to-emerald-50/40" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700">
              <Zap className="h-3.5 w-3.5" />
              For bookkeepers and business owners
            </div>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Stop chasing clients{' '}
              <br className="hidden sm:block" />
              <span className="text-emerald-600">for documents</span>
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl">
              Stop chasing clients for documents. Or handle your own books without a bookkeeper.
              Set it up in 5 minutes.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/signup"
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all hover:shadow-xl hover:shadow-emerald-600/30"
              >
                Start Free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/signup"
                className="flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-7 py-3.5 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                Get Started Free
              </Link>
            </div>
            <p className="mt-5 text-sm text-gray-400">
              Free for up to 3 clients. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* ---- How It Works ---- */}
      <section className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
              How it works
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
              Three steps to organized documents
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-gray-500">
              No complex setup. No training required. Get started in under 5 minutes.
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {howItWorks.map(item => (
              <div key={item.step} className="relative rounded-2xl border border-gray-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-emerald-700">
                  {item.step}
                </div>
                <h3 className="mb-3 text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Features Grid ---- */}
      <section id="features" className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
              Features
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
              Everything you need, nothing you don't
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-gray-500">
              Built specifically for solo bookkeepers and small practices. Powerful enough for 100 clients, simple enough for 3.
            </p>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(f => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
                  <f.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-gray-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-600">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Social Proof / Stats ---- */}
      <section className="border-t border-gray-100 bg-emerald-600">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-14 sm:grid-cols-4">
          {socialProof.map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-white sm:text-4xl">{stat.value}</p>
              <p className="mt-1 text-sm text-emerald-100">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Pricing ---- */}
      <section id="pricing" className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
              Pricing
            </p>
            <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
              Simple, transparent pricing
            </h2>
            {/* Audience toggle */}
            <div className="mt-8 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setPricingAudience('practitioner')}
                className={cn(
                  'rounded-lg px-5 py-2 text-sm font-medium transition-all',
                  pricingAudience === 'practitioner'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                For Bookkeepers
              </button>
              <button
                onClick={() => setPricingAudience('solo')}
                className={cn(
                  'rounded-lg px-5 py-2 text-sm font-medium transition-all',
                  pricingAudience === 'solo'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                For Business Owners
              </button>
            </div>
            <p className="mx-auto mt-4 max-w-md text-gray-500">
              {pricingAudience === 'practitioner'
                ? 'Start free. Upgrade when you need more clients or automation.'
                : 'Start free. Upgrade for the full analysis pipeline and multi-entity support.'}
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {(pricingAudience === 'practitioner' ? pricing : soloPricing).map(plan => (
              <div
                key={plan.name}
                className={cn(
                  'relative rounded-2xl border p-8',
                  plan.highlighted
                    ? 'border-emerald-300 bg-white shadow-xl ring-2 ring-emerald-600/20'
                    : 'border-gray-200 bg-white shadow-sm',
                )}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                      <Star className="h-3 w-3" />
                      Most Popular
                    </span>
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-sm text-gray-500">{plan.period}</span>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">{plan.description}</p>
                </div>
                <ul className="mt-8 space-y-3">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-gray-700">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/signup"
                  className={cn(
                    'mt-8 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all',
                    plan.highlighted
                      ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50',
                  )}
                >
                  {plan.cta}
                  {plan.highlighted && <ChevronRight className="h-4 w-4" />}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section className="border-t border-gray-100 bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <Shield className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Ready to stop chasing documents?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg text-gray-600">
            Stop chasing clients for documents. Set it up in 5 minutes.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
            >
              Get Started Free
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
          <p className="mt-5 text-sm text-gray-400">
            Free plan includes 3 clients. No credit card required.
          </p>
        </div>
      </section>

      {/* ---- Footer ---- */}
      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-bold text-gray-900">{tenantConfig.productName}</p>
              <p className="mt-1 text-sm text-gray-500">Document collection for bookkeepers. Financial analysis for business owners.</p>
            </div>
            <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
              <Link to="/login" className="text-gray-500 hover:text-gray-900 transition-colors">Sign In</Link>
              <Link to="/signup" className="text-gray-500 hover:text-gray-900 transition-colors">Create Account</Link>
              <button onClick={() => scrollTo('features')} className="text-left text-gray-500 hover:text-gray-900 transition-colors">Features</button>
              <button onClick={() => scrollTo('pricing')} className="text-left text-gray-500 hover:text-gray-900 transition-colors">Pricing</button>
            </div>
          </div>
          <div className="mt-10 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} {tenantConfig.productName}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
