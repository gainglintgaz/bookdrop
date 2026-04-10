// src/pages/TaxEstimatorPage.tsx
// Tax Estimator Hub — clean separation between Personal and Business tax estimation.
// These are legally, practically, and architecturally separate workflows.

import { Link } from 'react-router-dom'
import { tenantConfig } from '@/lib/tenant.config'
import {
  Calculator,
  Briefcase,
  User,
  ArrowRight,
  Lock,
  ShieldCheck,
} from 'lucide-react'

export function TaxEstimatorPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
          <Calculator className="h-7 w-7 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {tenantConfig.productName} Tax Prep Brain
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          2025 Tax Year — Preliminary Estimate
        </p>
      </div>

      {/* Privacy badge */}
      <div className="mb-8 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
        <p className="text-xs text-blue-700">
          <strong>100% private.</strong> All calculations run in your browser. No data is sent to any server.
        </p>
      </div>

      {/* Separation notice */}
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
        <p className="text-xs text-amber-700">
          <strong>Personal and business taxes are separate estimators.</strong> The IRS requires distinct treatment of personal income (W-2, investments) and business income (Schedule C, S-Corp, C-Corp).
          Mixing them in one calculation would produce inaccurate results and does not reflect how taxes are actually filed.
        </p>
      </div>

      {/* Two cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Personal */}
        <Link
          to="/tax-estimator/personal"
          className="group rounded-xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 transition-colors group-hover:bg-blue-200">
            <User className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Personal Taxes</h2>
          <p className="mt-1 text-sm text-gray-500">
            W-2 wages, investment income, dependents, credits
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              W-2 income &amp; withholding
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Investment &amp; dividend income
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Child Tax Credit &amp; dependent credits
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Earned Income Credit
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-blue-400" />
              Standard deduction by filing status
            </li>
          </ul>
          <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
            Start Personal Estimate
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>

        {/* Business */}
        <Link
          to="/tax-estimator/business"
          className="group rounded-xl border-2 border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-400 hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 transition-colors group-hover:bg-amber-200">
            <Briefcase className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Business Taxes</h2>
          <p className="mt-1 text-sm text-gray-500">
            Self-employment, Schedule C, S-Corp, C-Corp
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-gray-500">
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              Sole proprietor, LLC, partnership
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              S-Corp salary vs. distributions
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              Schedule C business deductions (15 categories)
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              QBI deduction (20% pass-through)
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              Quarterly estimated payments
            </li>
          </ul>
          <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
            Start Business Estimate
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>

      {/* FAQ note */}
      <div className="mt-8 rounded-lg bg-gray-50 px-5 py-4 text-center">
        <p className="text-xs text-gray-500">
          <strong>Have both W-2 and business income?</strong> Run each estimator separately.
          Your CPA/bookkeeper will combine them on your final return (Form 1040 + Schedule C/K-1).
          Running them separately gives you the clearest picture of where each tax dollar comes from.
        </p>
      </div>
    </div>
  )
}
