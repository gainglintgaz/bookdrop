// src/pages/PersonalTaxEstimatorPage.tsx
// Personal Tax Estimator — W-2, investment, retirement income ONLY.
// NO business income, NO Schedule C, NO self-employment.
// 100% client-side. No data sent anywhere.

import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  calculatePersonalTax,
  STATES,
  FILING_STATUS_LABELS,
  type FilingStatus,
  type PersonalTaxInput,
  type PersonalTaxResult,
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
  PiggyBank,
  Receipt,
  Lock,
  ShieldCheck,
} from 'lucide-react'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function PersonalTaxEstimatorPage() {
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single')
  const [w2Income, setW2Income] = useState('')
  const [w2Withheld, setW2Withheld] = useState('')
  const [investmentIncome, setInvestmentIncome] = useState('')
  const [otherIncome, setOtherIncome] = useState('')
  const [dependents, setDependents] = useState(0)
  const [dependentAges, setDependentAges] = useState<('under17' | '17to23' | 'other')[]>([])
  const [state, setState] = useState('GA')
  const [priorYearRefund, setPriorYearRefund] = useState('')
  const [result, setResult] = useState<PersonalTaxResult | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const handleDependentCountChange = useCallback((count: number) => {
    const validCount = Math.max(0, Math.min(10, count))
    setDependents(validCount)
    setDependentAges(prev => {
      if (validCount > prev.length) {
        return [...prev, ...Array(validCount - prev.length).fill('under17') as ('under17' | '17to23' | 'other')[]]
      }
      return prev.slice(0, validCount)
    })
  }, [])

  const handleDependentAgeChange = useCallback((index: number, value: 'under17' | '17to23' | 'other') => {
    setDependentAges(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const handleCalculate = useCallback(() => {
    const input: PersonalTaxInput = {
      filingStatus,
      w2Income: parseFloat(w2Income) || 0,
      w2Withheld: parseFloat(w2Withheld) || 0,
      investmentIncome: parseFloat(investmentIncome) || 0,
      otherIncome: parseFloat(otherIncome) || 0,
      dependents,
      dependentAges,
      priorYearRefund: parseFloat(priorYearRefund) || 0,
      state,
    }
    setResult(calculatePersonalTax(input))
    setTimeout(() => {
      document.getElementById('tax-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, [filingStatus, w2Income, w2Withheld, investmentIncome, otherIncome, dependents, dependentAges, state, priorYearRefund])

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
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100">
            <Calculator className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Personal Tax Estimator
            </h1>
            <p className="text-sm text-gray-500">
              2025 Tax Year — W-2, Investment &amp; Other Personal Income
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
            This estimator is for <strong>personal income only</strong> (W-2 wages, investments, retirement).
            For self-employment or business income, use the{' '}
            <Link to="/tax-estimator/business" className="font-medium text-emerald-600 underline hover:text-emerald-700">
              Business Tax Estimator
            </Link>.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Filing Status */}
        <div>
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Users className="h-4 w-4 text-gray-400" />
            Filing Status
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.entries(FILING_STATUS_LABELS) as [FilingStatus, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilingStatus(value)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-xs font-medium transition-all',
                  filingStatus === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500/20'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Income */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Briefcase className="h-4 w-4 text-gray-400" />
            Personal Income
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CurrencyInput
              label="W-2 Wages (Box 1)"
              hint="Total wages from all W-2 forms"
              value={w2Income}
              onChange={setW2Income}
            />
            <CurrencyInput
              label="Federal Tax Withheld (W-2 Box 2)"
              hint="Total federal income tax withheld"
              value={w2Withheld}
              onChange={setW2Withheld}
            />
            <CurrencyInput
              label="Investment Income"
              hint="1099-INT, 1099-DIV, capital gains"
              value={investmentIncome}
              onChange={setInvestmentIncome}
            />
            <CurrencyInput
              label="Other Income"
              hint="Unemployment, alimony, pensions, Social Security, etc."
              value={otherIncome}
              onChange={setOtherIncome}
            />
            <CurrencyInput
              label="Last Year's Refund (optional)"
              hint="For comparison only — doesn't affect calculation"
              value={priorYearRefund}
              onChange={setPriorYearRefund}
            />
          </div>
        </div>

        {/* Dependents */}
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <PiggyBank className="h-4 w-4 text-gray-400" />
            Dependents &amp; Credits
          </h3>
          <div className="space-y-3">
            <div className="max-w-xs">
              <label className="mb-1 block text-xs font-medium text-gray-500">Number of Dependents</label>
              <input
                type="number"
                min={0}
                max={10}
                value={dependents}
                onChange={e => handleDependentCountChange(parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            {dependents > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {dependentAges.map((age, i) => (
                  <div key={i}>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Dependent {i + 1}
                    </label>
                    <select
                      value={age}
                      onChange={e => handleDependentAgeChange(i, e.target.value as 'under17' | '17to23' | 'other')}
                      className="w-full rounded-lg border border-gray-300 px-2 py-2 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="under17">Under 17 ($2,000 credit)</option>
                      <option value="17to23">17-23 ($500 credit)</option>
                      <option value="other">Other ($500 credit)</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
        >
          <Sparkles className="h-5 w-5" />
          Calculate Personal Tax Estimate
        </button>
      </div>

      {/* Results */}
      {result && (
        <div id="tax-results" className="mt-8 space-y-6">
          {/* Big Result */}
          <div className={cn(
            'rounded-xl border-2 p-6 sm:p-8',
            result.refundOrOwed >= 0
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white'
              : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white',
          )}>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">
                Estimated 2025 Personal Tax Outcome
              </p>
              {result.refundOrOwed >= 0 ? (
                <>
                  <div className="mt-2 flex items-center justify-center gap-3">
                    <TrendingUp className="h-8 w-8 text-emerald-500" />
                    <p className="text-5xl font-extrabold text-emerald-600">
                      {formatCurrency(result.refundOrOwed)}
                    </p>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-emerald-700">Estimated Refund</p>
                </>
              ) : (
                <>
                  <div className="mt-2 flex items-center justify-center gap-3">
                    <TrendingDown className="h-8 w-8 text-amber-500" />
                    <p className="text-5xl font-extrabold text-amber-600">
                      {formatCurrency(Math.abs(result.refundOrOwed))}
                    </p>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-amber-700">Estimated Amount Owed</p>
                </>
              )}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Effective Rate" value={`${result.effectiveRate}%`} />
              <MiniStat label="Marginal Bracket" value={result.marginalBracket} />
              <MiniStat label="Federal Tax" value={formatCurrency(result.federalTaxAfterCredits)} />
              <MiniStat label="State Tax" value={formatCurrency(result.stateTax)} />
            </div>
          </div>

          {/* Insights */}
          {result.insights.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Sparkles className="h-4 w-4 text-blue-500" />
                Actionable Insights
              </h3>
              <div className="space-y-3">
                {result.insights.map((insight, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                    <ArrowRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
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
                Detailed Tax Breakdown
              </span>
              {showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showBreakdown && (
              <div className="border-t border-gray-100 px-5 pb-5">
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    <BreakdownRow label="Gross Income" value={result.grossIncome} />
                    <BreakdownRow label="Adjusted Gross Income (AGI)" value={result.adjustedGrossIncome} bold />
                    <BreakdownRow label={`Standard Deduction (${FILING_STATUS_LABELS[filingStatus]})`} value={-result.standardDeduction} />
                    <BreakdownRow label="Taxable Income" value={result.taxableIncome} bold />
                    <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Federal Tax</td></tr>
                    <BreakdownRow label={`Federal tax (${result.marginalBracket} marginal bracket)`} value={result.federalTaxBeforeCredits} />
                    {result.childTaxCredit > 0 && (
                      <BreakdownRow label="Child Tax Credit" value={-result.childTaxCredit} color="text-emerald-600" />
                    )}
                    {result.otherDependentCredit > 0 && (
                      <BreakdownRow label="Other Dependent Credit" value={-result.otherDependentCredit} color="text-emerald-600" />
                    )}
                    {result.earnedIncomeCredit > 0 && (
                      <BreakdownRow label="Earned Income Credit (est.)" value={-result.earnedIncomeCredit} color="text-emerald-600" />
                    )}
                    <BreakdownRow label="Federal Tax After Credits" value={result.federalTaxAfterCredits} bold />
                    <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">State Tax</td></tr>
                    <BreakdownRow label={result.stateLabel} value={result.stateTax} />
                    <tr><td colSpan={2} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Summary</td></tr>
                    <BreakdownRow label="Total Tax" value={result.totalTaxOwed} bold />
                    <BreakdownRow label="Total Withheld (from W-2)" value={-result.totalTaxWithheld} color="text-emerald-600" />
                    <BreakdownRow
                      label={result.refundOrOwed >= 0 ? 'Estimated Refund' : 'Estimated Amount Owed'}
                      value={Math.abs(result.refundOrOwed)}
                      bold
                      color={result.refundOrOwed >= 0 ? 'text-emerald-600' : 'text-amber-600'}
                    />
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/tax-estimator/business"
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-700 shadow-sm transition hover:bg-amber-100"
            >
              <Briefcase className="h-4 w-4" />
              Also have business income? Use Business Estimator
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
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-8 pr-3 text-sm text-gray-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
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
