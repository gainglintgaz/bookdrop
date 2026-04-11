import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { tenantConfig } from '@/lib/tenant.config'
import { isDemoMode } from '@/lib/mode'
import { generateDemoPackage } from '@/lib/finance-prep'
import {
  Upload,
  Camera,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Receipt,
  ShieldCheck,
  Search,
  Sparkles,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Package,
  Send,
} from 'lucide-react'

// ─── DEMO DATA ────────────────────────────────────────────────────────────────

const DEMO_SNAPSHOT = {
  income: 15_200,
  expenses: 11_800,
  taxDeductions: 4_350,
  netCashFlow: 3_400,
}

const DEMO_CLIENT_PATH = '/clients/demo-acme-supplies'

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getCurrentMonthYear(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function BusinessOwnerDashboard() {
  const [bookkeeperCost, setBookkeeperCost] = useState(500)
  const [generatingPackage, setGeneratingPackage] = useState(false)
  const [packageGenerated, setPackageGenerated] = useState(false)

  const handleGeneratePackage = async () => {
    setGeneratingPackage(true)
    try {
      await generateDemoPackage()
      setPackageGenerated(true)
      setTimeout(() => setPackageGenerated(false), 5000)
    } finally {
      setGeneratingPackage(false)
    }
  }

  const hasData = isDemoMode // In demo mode we show sample data
  // Estimate — assumes BookDrop handles ~45% of typical prep work
  const savings = Math.round(bookkeeperCost * 0.45)
  const yearlySavings = savings * 12

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">

      {/* ── 1. Welcome Header ──────────────────────────────────────────────── */}
      <section className="mb-10">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Your Business Finances
        </h1>
        <p className="mt-1 text-sm font-medium text-gray-500">{getCurrentMonthYear()}</p>
        <p className="mt-2 text-base text-gray-600">
          Upload, categorize, and prepare — save hours on bookkeeper costs
        </p>
      </section>

      {/* ── 2. Quick Actions ───────────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionCard
            to={`${DEMO_CLIENT_PATH}?tab=analysis`}
            icon={Upload}
            title="Upload Statements"
            description="Upload bank or credit card statements"
            accent="bg-emerald-50 text-emerald-600"
          />
          <QuickActionCard
            to={`${DEMO_CLIENT_PATH}?tab=analysis`}
            icon={Camera}
            title="Scan Receipts"
            description="Photograph or upload paper receipts"
            accent="bg-blue-50 text-blue-600"
          />
          <QuickActionCard
            to={`${DEMO_CLIENT_PATH}?tab=analysis`}
            icon={BarChart3}
            title="View Reports"
            description="See your spending patterns and trends"
            accent="bg-violet-50 text-violet-600"
          />
          <QuickActionCard
            to={`${DEMO_CLIENT_PATH}?tab=export`}
            icon={Package}
            title="Finance Prep Package"
            description="One-click package for your bookkeeper"
            accent="bg-amber-50 text-amber-600"
          />
        </div>
      </section>

      {/* ── 3. Financial Snapshot ──────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Financial Snapshot</h2>

        {hasData ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard
                label="Monthly Income"
                value={formatCurrency(DEMO_SNAPSHOT.income)}
                icon={TrendingUp}
                color="text-emerald-600"
                bg="bg-emerald-50"
              />
              <StatCard
                label="Monthly Expenses"
                value={formatCurrency(DEMO_SNAPSHOT.expenses)}
                icon={TrendingDown}
                color="text-red-500"
                bg="bg-red-50"
              />
              <StatCard
                label="Categorized Expenses"
                value={formatCurrency(DEMO_SNAPSHOT.taxDeductions)}
                icon={Receipt}
                color="text-violet-600"
                bg="bg-violet-50"
              />
            </div>

            {/* Health indicator */}
            <div className={cn(
              'mt-4 flex items-center gap-2 rounded-lg border px-4 py-3',
              DEMO_SNAPSHOT.netCashFlow > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700',
            )}>
              {DEMO_SNAPSHOT.netCashFlow > 0 ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
              ) : (
                <ShieldCheck className="h-5 w-5 flex-shrink-0" />
              )}
              <span className="text-sm font-medium">
                {DEMO_SNAPSHOT.netCashFlow > 0
                  ? `Your finances look healthy — net cash flow is ${formatCurrency(DEMO_SNAPSHOT.netCashFlow)} this month`
                  : 'Watch your spending — expenses are outpacing income this month'}
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center">
            <Upload className="mx-auto mb-3 h-10 w-10 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-700">
              Upload your first bank statement to see your financial snapshot
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              We'll auto-categorize every transaction and surface insights instantly.
            </p>
            <Link
              to={`${DEMO_CLIENT_PATH}?tab=analysis`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
            >
              <Upload className="h-4 w-4" />
              Upload Statement
            </Link>
          </div>
        )}
      </section>

      {/* ── Finance Prep Package ─────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
              <Package className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">
                {tenantConfig.productName} Finance Prep
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Generate a ready-to-send package with all your transactions categorized,
                expenses categorized, and reconciliation complete. Your bookkeeper
                will love you for it — and you'll save hours off their bill.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleGeneratePackage}
                  disabled={generatingPackage}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {generatingPackage ? (
                    'Generating...'
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Ready-to-Send Package
                    </>
                  )}
                </button>
                {packageGenerated && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Package downloaded!
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. What BookDrop Does For You ──────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          What {tenantConfig.productName} Does For You
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ValuePropCard
            icon={Sparkles}
            text="Auto-categorizes every transaction (automates manual categorization work)"
          />
          <ValuePropCard
            icon={Search}
            text="Flags categorization issues and potential expense mismatches"
          />
          <ValuePropCard
            icon={ShieldCheck}
            text="Catches duplicate charges and errors before they cost you"
          />
          <ValuePropCard
            icon={Send}
            text="Generates bookkeeper-ready packages (helps reduce bookkeeper prep time)"
          />
        </div>
      </section>

      {/* ── 5. Savings Calculator ──────────────────────────────────────────── */}
      <section className="mb-12">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">
            <Calculator className="mr-2 inline-block h-5 w-5 text-emerald-600" />
            How much could you save?
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            See how pre-processing your documents reduces bookkeeper hours.
          </p>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            {/* Input */}
            <div className="flex-1">
              <label
                htmlFor="bookkeeper-cost"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                What do you pay your bookkeeper per month?
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  $
                </span>
                <input
                  id="bookkeeper-cost"
                  type="number"
                  min={0}
                  step={50}
                  value={bookkeeperCost}
                  onChange={e => setBookkeeperCost(Math.max(0, Number(e.target.value)))}
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-7 pr-3 text-gray-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 sm:max-w-xs"
                />
              </div>
            </div>

            {/* Output */}
            <div className="flex-1 rounded-lg bg-emerald-50 px-5 py-4">
              <p className="text-sm text-emerald-700">
                With {tenantConfig.productName}, you could save approximately (estimated)
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">
                {formatCurrency(savings)}/month
              </p>
              <p className="mt-1 text-sm font-medium text-emerald-600">
                That's {formatCurrency(yearlySavings)}/year in potential savings.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. CTA Footer ─────────────────────────────────────────────────── */}
      <section className="mb-8 text-center">
        <h2 className="mb-2 text-xl font-bold text-gray-900">Ready to get started?</h2>
        <p className="mb-6 text-sm text-gray-500">
          See how it works in 5 minutes.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={`${DEMO_CLIENT_PATH}?tab=analysis`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <Upload className="h-4 w-4" />
            Upload Your First Statement
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Learn More
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

interface QuickActionCardProps {
  to: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  accent: string
}

function QuickActionCard({ to, icon: Icon, title, description, accent }: QuickActionCardProps) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md"
    >
      <div className={cn('mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg', accent)}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900 group-hover:text-emerald-700">
        {title}
      </h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>
    </Link>
  )
}

interface StatCardProps {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
}

function StatCard({ label, value, icon: Icon, color, bg }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className={cn('text-xl font-bold', color)}>{value}</p>
      </div>
    </div>
  )
}

interface ValuePropCardProps {
  icon: React.ComponentType<{ className?: string }>
  text: string
}

function ValuePropCard({ icon: Icon, text }: ValuePropCardProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100">
        <Icon className="h-4 w-4 text-emerald-600" />
      </div>
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  )
}
