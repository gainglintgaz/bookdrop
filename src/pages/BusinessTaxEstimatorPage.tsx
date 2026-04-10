// src/pages/BusinessTaxEstimatorPage.tsx
// Business Tax Estimator — Self-employment, Schedule C, S-Corp, C-Corp ONLY.
// NO personal W-2 income, NO investment income, NO personal credits.
// 100% client-side. No data sent anywhere.

import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  calculateBusinessTax,
  emptyBusinessExpenses,
  STATES,
  FILING_STATUS_LABELS,
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_DESCRIPTIONS,
  type FilingStatus,
  type BusinessEntityType,
  type BusinessExpenses,
  type BusinessTaxInput,
  type BusinessTaxResult,
} from '@/lib/tax-estimator'
import {
  Calculator,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Info,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileText,
  Users,
  Building2,
  Briefcase,
  Receipt,
  Lock,
  ShieldCheck,
  Store,
  Home,
  Car,
  Wrench,
  Heart,
  CalendarClock,
  User,
} from 'lucide-react'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function BusinessTaxEstimatorPage() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single')
  const [entityType, setEntityType] = useState<BusinessEntityType>('sole_proprietor')
  const [grossRevenue, setGrossRevenue] = useState('')
  const [costOfGoodsSold, setCostOfGoodsSold] = useState('')
  const [sCorpSalary, setSCorpSalary] = useState('')
  const [sCorpDistributions, setSCorpDistributions] = useState('')
  const [expenses, setExpenses] = useState<BusinessExpenses>(emptyBusinessExpenses())
  const [healthInsurancePremiums, setHealthInsurancePremiums] = useState('')
  const [retirementContributions, setRetirementContributions] = useState('')
  const [estimatedTaxPayments, setEstimatedTaxPayments] = useState('')
  const [state, setState] = useState('GA')
  const [result, setResult] = useState<BusinessTaxResult | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [showExpenses, setShowExpenses] = useState(false)

  const isSCorp = entityType === 's_corp'

  const updateExpense = useCallback((field: keyof BusinessExpenses, value: string) => {
    setExpenses(prev => ({ ...prev, [field]: parseFloat(value) || 0 }))
  }, [])

  const handleCalculate = useCallback(() => {
    const input: BusinessTaxInput = {
      filingStatus,
      entityType,
      grossRevenue: parseFloat(grossRevenue) || 0,
      costOfGoodsSold: parseFloat(costOfGoodsSold) || 0,
      sCorpSalary: parseFloat(sCorpSalary) || 0,
      sCorpDistributions: parseFloat(sCorpDistributions) || 0,
      expenses,
      healthInsurancePremiums: parseFloat(healthInsurancePremiums) || 0,
      retirementContributions: parseFloat(retirementContributions) || 0,
      estimatedTaxPayments: parseFloat(estimatedTaxPayments) || 0,
      state,
    }
    setResult(calculateBusinessTax(input))
    setTimeout(() => {
      document.getElementById('tax-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [filingStatus, entityType, grossRevenue, costOfGoodsSold, sCorpSalary, sCorpDistributions, expenses, healthInsurancePremiums, retirementContributions, estimatedTaxPayments, state])

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/tax-estimator"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Tax Estimator
        </Link>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100">
            <Briefcase className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Business Tax Estimator
            </h1>
            <p className="text-sm text-gray-500">
              2025 Tax Year — Self-Employment, Schedule C, S-Corp, C-Corp
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
          <p className="text-xs text-blue-700">
            <strong>100% private.</strong> All calculations run in your browser. No data is sent to any server.
          </p>
        </div>

        <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
          <p className="text-xs text-gray-500">
            This estimator is for <strong>business income only</strong> (self-employment, 1099, Schedule C, S-Corp, C-Corp).
            For W-2 wages or investment income, use the{' '}
            <Link to="/tax-estimator/personal" className="font-medium text-blue-600 underline hover:text-blue-700">
              Personal Tax Estimator
            </Link>.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">

        {/* Business Entity Type — FIRST so the rest of the form is context-aware */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Store className="h-4 w-4 text-gray-400" />
            Business Entity Type
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.entries(ENTITY_TYPE_LABELS) as [BusinessEntityType, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setEntityType(value)}
                className={cn(
                  'rounded-lg border px-3 py-3 text-left transition-all',
                  entityType === value
                    ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500/20'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                <p className={cn(
                  'text-xs font-semibold',
                  entityType === value ? 'text-amber-700' : 'text-gray-700',
                )}>
                  {label}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {ENTITY_TYPE_DESCRIPTIONS[value]}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Pass-through bracket selector — only shown for pass-through entities, hidden for C-Corp */}
        {entityType !== 'c_corp' && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-4">
            <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Users className="h-4 w-4 text-gray-400" />
              Owner's Tax Bracket
            </label>
            <p className="mb-3 text-[11px] text-gray-500">
              <strong>Why is this here?</strong> For {ENTITY_TYPE_LABELS[entityType]}s, the IRS taxes business
              profit on the owner's personal Form 1040 (Schedule C / K-1). Your marital status determines
              which bracket thresholds apply to that pass-through income.
              This is <em>not</em> your personal tax return — it only sets the income tax rate for your
              business profit.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilingStatus(value)}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-xs font-medium transition-all',
                    filingStatus === value
                      ? 'border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-500/20'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* C-Corp note — flat 21% rate, personal brackets irrelevant */}
        {entityType === 'c_corp' && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-500">
              <strong>C-Corporation:</strong> Corporate income tax is a flat <strong>21%</strong> on net profit — filing
              status and personal tax brackets do not apply to the corporate return. If the corporation pays
              you a salary or dividends, those are taxed separately on your personal return.
            </p>
          </div>
        )}

        {/* Revenue */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Calculator className="h-4 w-4 text-gray-400" />
            Business Revenue
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {isSCorp ? (
              <>
                <CurrencyInput
                  label="S-Corp Officer Salary (W-2)"
                  hint="Reasonable salary paid to yourself — subject to payroll tax"
                  value={sCorpSalary}
                  onChange={setSCorpSalary}
                />
                <CurrencyInput
                  label="S-Corp Distributions (K-1)"
                  hint="Distributions — NOT subject to SE tax"
                  value={sCorpDistributions}
                  onChange={setSCorpDistributions}
                />
              </>
            ) : (
              <CurrencyInput
                label="Gross Business Revenue"
                hint="Total business revenue / 1099 income before expenses"
                value={grossRevenue}
                onChange={setGrossRevenue}
              />
            )}
            <CurrencyInput
              label="Cost of Goods Sold (COGS)"
              hint="Materials, inventory, manufacturing — for product businesses"
              value={costOfGoodsSold}
              onChange={setCostOfGoodsSold}
            />
          </div>
        </div>

        {/* Business Expenses (collapsible) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50">
          <button
            type="button"
            onClick={() => setShowExpenses(!showExpenses)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-50"
          >
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-500" />
              Business Deductions (Schedule C)
              <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Reduces Taxable Income
              </span>
            </span>
            {showExpenses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showExpenses && (
            <div className="border-t border-amber-200 px-4 pb-4 pt-3 space-y-4">
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <Home className="h-3.5 w-3.5" />
                  Office &amp; Workspace
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <NumberInput
                    label="Home Office (sq ft)"
                    hint="$5/sq ft simplified method, max 300 sq ft = $1,500"
                    value={expenses.homeOfficeSquareFeet || ''}
                    onChange={v => updateExpense('homeOfficeSquareFeet', v)}
                    suffix="sq ft"
                  />
                  <CurrencyInput
                    label="Office Rent / Lease"
                    hint="Co-working, office rent, warehouse"
                    value={expenses.rentLease ? String(expenses.rentLease) : ''}
                    onChange={v => updateExpense('rentLease', v)}
                  />
                  <CurrencyInput
                    label="Office Supplies"
                    hint="Paper, ink, desk supplies, furniture"
                    value={expenses.officeSupplies ? String(expenses.officeSupplies) : ''}
                    onChange={v => updateExpense('officeSupplies', v)}
                  />
                  <CurrencyInput
                    label="Phone &amp; Internet"
                    hint="Business % of phone/internet bills"
                    value={expenses.phoneInternet ? String(expenses.phoneInternet) : ''}
                    onChange={v => updateExpense('phoneInternet', v)}
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <Car className="h-3.5 w-3.5" />
                  Vehicle &amp; Travel
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <NumberInput
                    label="Business Miles Driven"
                    hint="2025 rate: $0.70/mile. Track with MileIQ or similar."
                    value={expenses.vehicleMiles || ''}
                    onChange={v => updateExpense('vehicleMiles', v)}
                    suffix="miles"
                  />
                  <CurrencyInput
                    label="Travel &amp; Meals"
                    hint="Business travel, hotels, meals (50% deductible)"
                    value={expenses.travelMeals ? String(expenses.travelMeals) : ''}
                    onChange={v => updateExpense('travelMeals', v)}
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <Wrench className="h-3.5 w-3.5" />
                  Operations
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <CurrencyInput
                    label="Software &amp; Subscriptions"
                    hint="SaaS, cloud services, tools, apps"
                    value={expenses.softwareSubscriptions ? String(expenses.softwareSubscriptions) : ''}
                    onChange={v => updateExpense('softwareSubscriptions', v)}
                  />
                  <CurrencyInput
                    label="Advertising &amp; Marketing"
                    hint="Ads, website, social media, business cards"
                    value={expenses.advertisingMarketing ? String(expenses.advertisingMarketing) : ''}
                    onChange={v => updateExpense('advertisingMarketing', v)}
                  />
                  <CurrencyInput
                    label="Equipment Purchases"
                    hint="Computers, tools, machinery (Section 179)"
                    value={expenses.equipmentPurchases ? String(expenses.equipmentPurchases) : ''}
                    onChange={v => updateExpense('equipmentPurchases', v)}
                  />
                  <CurrencyInput
                    label="Contract Labor / Subcontractors"
                    hint="1099 payments to freelancers, agencies"
                    value={expenses.contractLabor ? String(expenses.contractLabor) : ''}
                    onChange={v => updateExpense('contractLabor', v)}
                  />
                  <CurrencyInput
                    label="Business Insurance"
                    hint="Liability, E&amp;O, property insurance"
                    value={expenses.insurance ? String(expenses.insurance) : ''}
                    onChange={v => updateExpense('insurance', v)}
                  />
                  <CurrencyInput
                    label="Professional Services"
                    hint="Legal, accounting, bookkeeping fees"
                    value={expenses.professionalServices ? String(expenses.professionalServices) : ''}
                    onChange={v => updateExpense('professionalServices', v)}
                  />
                  <CurrencyInput
                    label="Education &amp; Training"
                    hint="Conferences, courses, certifications"
                    value={expenses.education ? String(expenses.education) : ''}
                    onChange={v => updateExpense('education', v)}
                  />
                  <CurrencyInput
                    label="Other Business Expenses"
                    hint="Any other ordinary &amp; necessary expenses"
                    value={expenses.otherExpenses ? String(expenses.otherExpenses) : ''}
                    onChange={v => updateExpense('otherExpenses', v)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Self-Employed Deductions */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Heart className="h-4 w-4 text-gray-400" />
            Self-Employed Deductions
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CurrencyInput
              label="Health Insurance Premiums"
              hint="Self-employed health insurance (above-the-line deduction)"
              value={healthInsurancePremiums}
              onChange={setHealthInsurancePremiums}
            />
            <CurrencyInput
              label="Retirement Contributions"
              hint="SEP-IRA, Solo 401(k), SIMPLE IRA"
              value={retirementContributions}
              onChange={setRetirementContributions}
            />
          </div>
        </div>

        {/* Estimated Payments */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            Estimated Tax Payments Already Made
          </h3>
          <div className="max-w-xs">
            <CurrencyInput
              label="Total Estimated Payments (Q1-Q4)"
              hint="Quarterly payments already sent to IRS this tax year"
              value={estimatedTaxPayments}
              onChange={setEstimatedTaxPayments}
            />
          </div>
        </div>

        {/* State */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Building2 className="h-4 w-4 text-gray-400" />
            State
          </h3>
          <div className="max-w-xs">
            <select
              value={state}
              onChange={e => setState(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              {STATES.map(s => (
                <option key={s.code} value={s.code}>
                  {s.label}{s.rate === 0 ? '' : ` (${(s.rate * 100).toFixed(1)}%)`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Calculate */}
        <button
          type="button"
          onClick={handleCalculate}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-4 text-base font-bold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.99]"
        >
          <Sparkles className="h-5 w-5" />
          Calculate Business Tax Estimate
        </button>
      </div>

      {/* ─── Results ──────────────────────────────────────────────────────── */}
      {result && (
        <div id="tax-results" className="mt-8 space-y-6">
          {/* Big Result */}
          <div className={cn(
            'rounded-xl border-2 p-6 sm:p-8',
            result.remainingOwed <= 0
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
              : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
          )}>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">
                Estimated 2025 Business Tax
                <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                  {result.entityLabel}
                </span>
              </p>

              <div className="mt-2 flex items-center justify-center gap-3">
                <p className="text-5xl font-extrabold text-gray-900">
                  {formatCurrency(result.totalTaxOwed)}
                </p>
              </div>
              <p className="mt-1 text-sm text-gray-500">Total estimated tax liability</p>

              {result.estimatedTaxPayments > 0 && (
                <div className="mt-3">
                  {result.remainingOwed <= 0 ? (
                    <div className="flex items-center justify-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                      <p className="text-lg font-bold text-emerald-600">
                        {formatCurrency(Math.abs(result.remainingOwed))} overpaid
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <TrendingDown className="h-5 w-5 text-amber-500" />
                      <p className="text-lg font-bold text-amber-600">
                        {formatCurrency(result.remainingOwed)} still owed
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Net Business Income" value={formatCurrency(result.netBusinessIncome)} />
              <MiniStat label="Business Deductions" value={formatCurrency(result.totalExpenses + result.costOfGoodsSold)} />
              <MiniStat label="Effective Rate" value={`${result.effectiveRate}%`} />
              <MiniStat label="Marginal Bracket" value={result.marginalBracket} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {result.selfEmploymentTax > 0 && (
                <MiniStat label="SE Tax" value={formatCurrency(result.selfEmploymentTax)} />
              )}
              {result.qbiDeduction > 0 && (
                <MiniStat label="QBI Deduction" value={formatCurrency(result.qbiDeduction)} />
              )}
              {result.corporateTax > 0 && (
                <MiniStat label="Corp Tax (21%)" value={formatCurrency(result.corporateTax)} />
              )}
              {result.quarterlyPaymentNeeded > 0 && (
                <MiniStat label="Quarterly Payment" value={formatCurrency(result.quarterlyPaymentNeeded)} />
              )}
              {result.sCorpSETaxSavings > 0 && (
                <MiniStat label="S-Corp SE Savings" value={formatCurrency(result.sCorpSETaxSavings)} />
              )}
            </div>
          </div>

          {/* Insights */}
          {result.insights.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Business Tax Insights
              </h3>
              <div className="space-y-3">
                {result.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <p>{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed Breakdown */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="flex w-full items-center justify-between px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-gray-400" />
                Detailed Business Tax Breakdown
              </span>
              {showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showBreakdown && (
              <div className="border-t border-gray-100 px-5 pb-5">
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {/* Business P&L */}
                    <tr><td colSpan={2} className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Business Profit &amp; Loss</td></tr>
                    <BreakdownRow label="Gross Business Revenue" value={result.grossRevenue} />
                    {result.costOfGoodsSold > 0 && (
                      <BreakdownRow label="Cost of Goods Sold" value={-result.costOfGoodsSold} color="text-amber-600" />
                    )}
                    {result.totalExpenses > 0 && (
                      <BreakdownRow label="Business Deductions" value={-result.totalExpenses} color="text-amber-600" />
                    )}
                    <BreakdownRow label="Net Business Income" value={result.netBusinessIncome} bold />

                    {/* S-Corp breakdown */}
                    {isSCorp && (
                      <>
                        <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">S-Corp Breakdown</td></tr>
                        <BreakdownRow label="Officer Salary (W-2)" value={result.sCorpSalary} />
                        <BreakdownRow label="Distributions (K-1)" value={result.sCorpDistributions} />
                        <BreakdownRow label="Pass-Through to Personal" value={result.passThruIncome} bold />
                      </>
                    )}

                    {/* SE Tax */}
                    {result.selfEmploymentTax > 0 && (
                      <>
                        <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Self-Employment Tax</td></tr>
                        <BreakdownRow label="SE Income Subject to Tax" value={result.seSubjectIncome} />
                        <BreakdownRow label="SE Tax (15.3%)" value={result.selfEmploymentTax} />
                        <BreakdownRow label="SE Tax Deduction (50%)" value={-result.selfEmploymentDeduction} color="text-emerald-600" />
                      </>
                    )}

                    {/* C-Corp */}
                    {result.corporateTax > 0 && (
                      <>
                        <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Corporate Tax</td></tr>
                        <BreakdownRow label="Corporate Taxable Income" value={result.corporateTaxableIncome} />
                        <BreakdownRow label="C-Corp Tax (21% flat)" value={result.corporateTax} bold />
                      </>
                    )}

                    {/* Above-the-line */}
                    {(result.healthInsuranceDeduction > 0 || result.retirementDeduction > 0) && (
                      <>
                        <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Above-the-Line Deductions</td></tr>
                        {result.healthInsuranceDeduction > 0 && (
                          <BreakdownRow label="Health Insurance" value={-result.healthInsuranceDeduction} color="text-emerald-600" />
                        )}
                        {result.retirementDeduction > 0 && (
                          <BreakdownRow label="Retirement Contributions" value={-result.retirementDeduction} color="text-emerald-600" />
                        )}
                      </>
                    )}

                    {/* Personal tax on pass-through */}
                    {result.passThruIncome > 0 && (
                      <>
                        <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Income Tax (on Pass-Through)</td></tr>
                        <BreakdownRow label="Adjusted Gross Income" value={result.adjustedGrossIncome} />
                        <BreakdownRow label={`Standard Deduction (${FILING_STATUS_LABELS[filingStatus]})`} value={-result.standardDeduction} color="text-emerald-600" />
                        {result.qbiDeduction > 0 && (
                          <BreakdownRow label="QBI Deduction (20%)" value={-result.qbiDeduction} color="text-emerald-600" />
                        )}
                        <BreakdownRow label="Taxable Income" value={result.taxableIncome} bold />
                        <BreakdownRow label={`Federal Tax (${result.marginalBracket} bracket)`} value={result.federalTax} />
                      </>
                    )}

                    {/* State */}
                    <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">State Tax</td></tr>
                    <BreakdownRow label={result.stateLabel} value={result.stateTax} />

                    {/* Summary */}
                    <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</td></tr>
                    <BreakdownRow label="Total Tax Liability" value={result.totalTaxOwed} bold />
                    {result.estimatedTaxPayments > 0 && (
                      <BreakdownRow label="Estimated Payments Made" value={-result.estimatedTaxPayments} color="text-emerald-600" />
                    )}
                    <BreakdownRow
                      label={result.remainingOwed > 0 ? 'Remaining Amount Owed' : 'Overpayment (potential refund)'}
                      value={Math.abs(result.remainingOwed)}
                      bold
                      color={result.remainingOwed > 0 ? 'text-amber-600' : 'text-emerald-600'}
                    />
                    {result.quarterlyPaymentNeeded > 0 && (
                      <BreakdownRow
                        label="Quarterly Payment Needed"
                        value={result.quarterlyPaymentNeeded}
                        bold
                        color="text-amber-600"
                      />
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/tax-estimator/personal"
              className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-100"
            >
              <User className="h-4 w-4" />
              Also have W-2 income? Use Personal Estimator
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
            >
              <FileText className="h-4 w-4" />
              Upload Tax Documents
            </Link>
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
            <p className="text-xs leading-relaxed text-gray-500">
              {result.disclaimer}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function CurrencyInput({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {hint && <p className="mb-1.5 text-[10px] text-gray-400">{hint}</p>}
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
          <DollarSign className="h-3.5 w-3.5" />
        </span>
        <input
          type="number"
          min={0}
          step={100}
          placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-8 pr-3 text-sm text-gray-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
      </div>
    </div>
  )
}

function NumberInput({ label, hint, value, onChange, suffix }: {
  label: string; hint?: string; value: string | number; onChange: (v: string) => void; suffix?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">{label}</label>
      {hint && <p className="mb-1.5 text-[10px] text-gray-400">{hint}</p>}
      <div className="relative">
        <input
          type="number"
          min={0}
          placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 py-2.5 px-3 pr-12 text-sm text-gray-900 shadow-sm transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/60 px-3 py-2 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-800">{value}</p>
    </div>
  )
}

function BreakdownRow({ label, value, bold, color }: {
  label: string; value: number; bold?: boolean; color?: string
}) {
  return (
    <tr>
      <td className={cn('py-1.5 text-gray-600', bold && 'font-semibold text-gray-900')}>{label}</td>
      <td className={cn('py-1.5 text-right tabular-nums', bold && 'font-semibold', color ?? 'text-gray-900')}>
        {value < 0 ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}
      </td>
    </tr>
  )
}
