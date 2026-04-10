// src/lib/tax-estimator.ts
// Preliminary 2025 Tax Refund / Liability Estimator
//
// IMPORTANT: Personal and Business tax estimation are COMPLETELY SEPARATE.
// They have distinct input types, distinct calculation functions, and distinct
// result types. They must NEVER be mixed in the same form or page.
// This is a legal, compliance, and IRS requirement.

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED TYPES & DATA
// ═══════════════════════════════════════════════════════════════════════════════

export type FilingStatus = 'single' | 'married_jointly' | 'married_separately' | 'head_of_household'

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  married_jointly: 'Married Filing Jointly',
  married_separately: 'Married Filing Separately',
  head_of_household: 'Head of Household',
}

// ─── 2025 Federal Tax Brackets ────────────────────────────────────────────────

interface TaxBracket {
  min: number
  max: number
  rate: number
}

const BRACKETS_2025: Record<FilingStatus, TaxBracket[]> = {
  single: [
    { min: 0,       max: 11_925,   rate: 0.10 },
    { min: 11_925,   max: 48_475,   rate: 0.12 },
    { min: 48_475,   max: 103_350,  rate: 0.22 },
    { min: 103_350,  max: 197_300,  rate: 0.24 },
    { min: 197_300,  max: 250_525,  rate: 0.32 },
    { min: 250_525,  max: 626_350,  rate: 0.35 },
    { min: 626_350,  max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0,        max: 23_850,   rate: 0.10 },
    { min: 23_850,   max: 96_950,   rate: 0.12 },
    { min: 96_950,   max: 206_700,  rate: 0.22 },
    { min: 206_700,  max: 394_600,  rate: 0.24 },
    { min: 394_600,  max: 501_050,  rate: 0.32 },
    { min: 501_050,  max: 751_600,  rate: 0.35 },
    { min: 751_600,  max: Infinity, rate: 0.37 },
  ],
  married_separately: [
    { min: 0,        max: 11_925,   rate: 0.10 },
    { min: 11_925,   max: 48_475,   rate: 0.12 },
    { min: 48_475,   max: 103_350,  rate: 0.22 },
    { min: 103_350,  max: 197_300,  rate: 0.24 },
    { min: 197_300,  max: 250_525,  rate: 0.32 },
    { min: 250_525,  max: 375_800,  rate: 0.35 },
    { min: 375_800,  max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0,        max: 17_000,   rate: 0.10 },
    { min: 17_000,   max: 64_850,   rate: 0.12 },
    { min: 64_850,   max: 103_350,  rate: 0.22 },
    { min: 103_350,  max: 197_300,  rate: 0.24 },
    { min: 197_300,  max: 250_500,  rate: 0.32 },
    { min: 250_500,  max: 626_350,  rate: 0.35 },
    { min: 626_350,  max: Infinity, rate: 0.37 },
  ],
}

// ─── 2025 Standard Deduction ──────────────────────────────────────────────────

const STANDARD_DEDUCTION_2025: Record<FilingStatus, number> = {
  single: 15_000,
  married_jointly: 30_000,
  married_separately: 15_000,
  head_of_household: 22_500,
}

// ─── State Income Tax Rates (approximate effective rates) ─────────────────────

const STATE_TAX_RATES: Record<string, { rate: number; label: string }> = {
  AL: { rate: 0.04, label: 'Alabama' },
  AK: { rate: 0, label: 'Alaska (no state income tax)' },
  AZ: { rate: 0.025, label: 'Arizona' },
  AR: { rate: 0.039, label: 'Arkansas' },
  CA: { rate: 0.0725, label: 'California' },
  CO: { rate: 0.044, label: 'Colorado' },
  CT: { rate: 0.05, label: 'Connecticut' },
  DE: { rate: 0.055, label: 'Delaware' },
  FL: { rate: 0, label: 'Florida (no state income tax)' },
  GA: { rate: 0.0549, label: 'Georgia' },
  HI: { rate: 0.065, label: 'Hawaii' },
  ID: { rate: 0.058, label: 'Idaho' },
  IL: { rate: 0.0495, label: 'Illinois' },
  IN: { rate: 0.0305, label: 'Indiana' },
  IA: { rate: 0.044, label: 'Iowa' },
  KS: { rate: 0.046, label: 'Kansas' },
  KY: { rate: 0.04, label: 'Kentucky' },
  LA: { rate: 0.03, label: 'Louisiana' },
  ME: { rate: 0.055, label: 'Maine' },
  MD: { rate: 0.05, label: 'Maryland' },
  MA: { rate: 0.05, label: 'Massachusetts' },
  MI: { rate: 0.0425, label: 'Michigan' },
  MN: { rate: 0.0585, label: 'Minnesota' },
  MS: { rate: 0.047, label: 'Mississippi' },
  MO: { rate: 0.048, label: 'Missouri' },
  MT: { rate: 0.059, label: 'Montana' },
  NE: { rate: 0.0501, label: 'Nebraska' },
  NV: { rate: 0, label: 'Nevada (no state income tax)' },
  NH: { rate: 0, label: 'New Hampshire (no state income tax)' },
  NJ: { rate: 0.055, label: 'New Jersey' },
  NM: { rate: 0.049, label: 'New Mexico' },
  NY: { rate: 0.065, label: 'New York' },
  NC: { rate: 0.045, label: 'North Carolina' },
  ND: { rate: 0.0195, label: 'North Dakota' },
  OH: { rate: 0.035, label: 'Ohio' },
  OK: { rate: 0.0475, label: 'Oklahoma' },
  OR: { rate: 0.0875, label: 'Oregon' },
  PA: { rate: 0.0307, label: 'Pennsylvania' },
  RI: { rate: 0.0475, label: 'Rhode Island' },
  SC: { rate: 0.0625, label: 'South Carolina' },
  SD: { rate: 0, label: 'South Dakota (no state income tax)' },
  TN: { rate: 0, label: 'Tennessee (no state income tax)' },
  TX: { rate: 0, label: 'Texas (no state income tax)' },
  UT: { rate: 0.0465, label: 'Utah' },
  VT: { rate: 0.055, label: 'Vermont' },
  VA: { rate: 0.0575, label: 'Virginia' },
  WA: { rate: 0, label: 'Washington (no state income tax)' },
  WV: { rate: 0.05, label: 'West Virginia' },
  WI: { rate: 0.053, label: 'Wisconsin' },
  WY: { rate: 0, label: 'Wyoming (no state income tax)' },
  DC: { rate: 0.06, label: 'District of Columbia' },
}

// ─── Helper: Calculate progressive tax ────────────────────────────────────────

function calculateProgressiveTax(
  taxableIncome: number,
  brackets: TaxBracket[],
): { tax: number; marginalBracket: string } {
  let tax = 0
  let marginalBracket = '10%'

  for (const bracket of brackets) {
    if (taxableIncome <= bracket.min) break
    const taxableInBracket = Math.min(taxableIncome, bracket.max) - bracket.min
    tax += taxableInBracket * bracket.rate
    marginalBracket = `${(bracket.rate * 100).toFixed(0)}%`
  }

  return { tax: Math.round(tax), marginalBracket }
}

// ─── State list for dropdown ──────────────────────────────────────────────────

export const STATES = Object.entries(STATE_TAX_RATES)
  .map(([code, info]) => ({ code, label: info.label, rate: info.rate }))
  .sort((a, b) => a.label.localeCompare(b.label))


// ═══════════════════════════════════════════════════════════════════════════════
// PERSONAL TAX ESTIMATOR
// For W-2 employees, retirees, investors — NO business income
// ═══════════════════════════════════════════════════════════════════════════════

export interface PersonalTaxInput {
  filingStatus: FilingStatus
  w2Income: number
  w2Withheld: number
  investmentIncome: number
  otherIncome: number
  dependents: number
  dependentAges: ('under17' | '17to23' | 'other')[]
  priorYearRefund: number
  state: string
}

export interface PersonalTaxResult {
  grossIncome: number
  adjustedGrossIncome: number
  standardDeduction: number
  taxableIncome: number
  federalTaxBeforeCredits: number
  childTaxCredit: number
  otherDependentCredit: number
  earnedIncomeCredit: number
  totalCredits: number
  federalTaxAfterCredits: number
  stateTax: number
  stateLabel: string
  totalTaxWithheld: number
  totalTaxOwed: number
  refundOrOwed: number
  effectiveRate: number
  marginalBracket: string
  insights: string[]
  disclaimer: string
}

export function calculatePersonalTax(input: PersonalTaxInput): PersonalTaxResult {
  const insights: string[] = []

  // 1. Gross income (personal sources only — NO business income)
  const grossIncome = input.w2Income + input.investmentIncome + input.otherIncome

  // 2. AGI (no above-the-line deductions for pure personal)
  const adjustedGrossIncome = grossIncome

  // 3. Standard deduction
  const standardDeduction = STANDARD_DEDUCTION_2025[input.filingStatus]

  // 4. Taxable income
  const taxableIncome = Math.max(0, adjustedGrossIncome - standardDeduction)

  // 5. Federal tax
  const brackets = BRACKETS_2025[input.filingStatus]
  const { tax: federalTaxBeforeCredits, marginalBracket } = calculateProgressiveTax(taxableIncome, brackets)

  // 6. Credits
  const childrenUnder17 = input.dependentAges.filter(a => a === 'under17').length
  const childTaxCredit = childrenUnder17 * 2_000

  const otherDeps = input.dependentAges.filter(a => a !== 'under17').length
  const otherDependentCredit = otherDeps * 500

  let earnedIncomeCredit = 0
  if (input.w2Income > 0 && input.w2Income < 63_000 && input.dependents > 0) {
    if (input.w2Income < 20_000) earnedIncomeCredit = Math.min(3_500, Math.round(input.w2Income * 0.15))
    else if (input.w2Income < 45_000) earnedIncomeCredit = Math.round(2_000 * Math.max(0, 1 - (input.w2Income - 20_000) / 25_000))
  }

  const totalCredits = childTaxCredit + otherDependentCredit + earnedIncomeCredit
  const federalTaxAfterCredits = Math.max(0, federalTaxBeforeCredits - totalCredits)

  // 7. State tax
  const stateInfo = STATE_TAX_RATES[input.state] ?? { rate: 0.05, label: input.state }
  const stateTax = Math.round(taxableIncome * stateInfo.rate)

  // 8. Total
  const totalTaxOwed = federalTaxAfterCredits + stateTax
  const totalTaxWithheld = input.w2Withheld
  const refundOrOwed = totalTaxWithheld - totalTaxOwed

  const effectiveRate = grossIncome > 0
    ? Math.round((totalTaxOwed / grossIncome) * 1000) / 10
    : 0

  // 9. Insights
  if (refundOrOwed > 0) {
    insights.push(`You may be getting a refund of approximately $${refundOrOwed.toLocaleString()}. Consider adjusting your W-4 withholding to keep more money in each paycheck.`)
  } else if (refundOrOwed < 0) {
    insights.push(`You may owe approximately $${Math.abs(refundOrOwed).toLocaleString()}. Consider making an estimated tax payment before the April deadline to avoid penalties.`)
  }

  if (childTaxCredit > 0) {
    insights.push(`Child Tax Credit saves you $${childTaxCredit.toLocaleString()} for ${childrenUnder17} child${childrenUnder17 !== 1 ? 'ren' : ''} under 17.`)
  }

  if (earnedIncomeCredit > 0) {
    insights.push(`You may qualify for an Earned Income Credit of approximately $${earnedIncomeCredit.toLocaleString()}. File to claim it — many eligible taxpayers miss this.`)
  }

  if (stateInfo.rate === 0) {
    insights.push(`${stateInfo.label} — you pay no state income tax.`)
  } else if (stateInfo.rate > 0.06) {
    insights.push(`${stateInfo.label} has a high state tax rate (${(stateInfo.rate * 100).toFixed(1)}%).`)
  }

  if (input.filingStatus === 'single' && input.dependents > 0) {
    insights.push('You may qualify for Head of Household status (lower tax rates + higher standard deduction) if you maintained a home for your dependent for more than half the year.')
  }

  if (grossIncome > 200_000 && input.filingStatus === 'single') {
    insights.push('At your income level, you may be subject to the 3.8% Net Investment Income Tax (NIIT) on investment income. This is not included in this estimate.')
  }

  if (input.investmentIncome > 50_000) {
    insights.push('Consider tax-loss harvesting — selling underperforming investments to offset capital gains and reduce your tax bill.')
  }

  if (input.w2Income > 0 && input.w2Withheld === 0) {
    insights.push('You have W-2 income but no withholding reported. Double-check your W-2 Box 2 — most employers withhold federal income tax.')
  }

  return {
    grossIncome,
    adjustedGrossIncome,
    standardDeduction,
    taxableIncome,
    federalTaxBeforeCredits,
    childTaxCredit,
    otherDependentCredit,
    earnedIncomeCredit,
    totalCredits,
    federalTaxAfterCredits,
    stateTax,
    stateLabel: stateInfo.label,
    totalTaxWithheld,
    totalTaxOwed,
    refundOrOwed,
    effectiveRate,
    marginalBracket,
    insights,
    disclaimer: 'This is a preliminary estimate for personal income tax only (W-2, investment, other income). It uses the standard deduction and does not account for itemized deductions, AMT, NIIT, education credits, HSA/IRA contributions, or other tax situations. This estimate does NOT include any business or self-employment income. Consult a qualified tax professional for official tax advice.',
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS TAX ESTIMATOR
// For sole proprietors, LLCs, S-Corps, C-Corps, partnerships
// Self-employment income, Schedule C, business deductions, QBI
// ═══════════════════════════════════════════════════════════════════════════════

export type BusinessEntityType = 'sole_proprietor' | 'single_member_llc' | 'partnership' | 's_corp' | 'c_corp'

export const ENTITY_TYPE_LABELS: Record<BusinessEntityType, string> = {
  sole_proprietor: 'Sole Proprietor',
  single_member_llc: 'Single-Member LLC',
  partnership: 'Partnership / Multi-Member LLC',
  s_corp: 'S-Corporation',
  c_corp: 'C-Corporation',
}

export const ENTITY_TYPE_DESCRIPTIONS: Record<BusinessEntityType, string> = {
  sole_proprietor: 'Report on Schedule C. Subject to SE tax on all net profit.',
  single_member_llc: 'Treated as sole proprietor by IRS. Schedule C filing.',
  partnership: 'Pass-through income on K-1. Subject to SE tax on your share.',
  s_corp: 'Salary (W-2) + distributions (K-1). SE tax only on salary portion.',
  c_corp: 'Separate corporate return (Form 1120). 21% flat corporate tax rate.',
}

export interface BusinessExpenses {
  advertisingMarketing: number
  vehicleMiles: number           // IRS rate: 70c/mile for 2025
  vehicleActualExpense: number   // alternative to mileage
  homeOfficeSquareFeet: number   // simplified: $5/sq ft, max 300 sq ft
  homeOfficeActualExpense: number
  insurance: number
  officeSupplies: number
  phoneInternet: number
  softwareSubscriptions: number
  professionalServices: number
  rentLease: number
  travelMeals: number           // 50% meals deduction
  equipmentPurchases: number    // Section 179 / bonus depreciation
  education: number
  contractLabor: number
  otherExpenses: number
}

export function emptyBusinessExpenses(): BusinessExpenses {
  return {
    advertisingMarketing: 0,
    vehicleMiles: 0,
    vehicleActualExpense: 0,
    homeOfficeSquareFeet: 0,
    homeOfficeActualExpense: 0,
    insurance: 0,
    officeSupplies: 0,
    phoneInternet: 0,
    softwareSubscriptions: 0,
    professionalServices: 0,
    rentLease: 0,
    travelMeals: 0,
    equipmentPurchases: 0,
    education: 0,
    contractLabor: 0,
    otherExpenses: 0,
  }
}

export interface BusinessTaxInput {
  // Owner's personal filing status (affects brackets for pass-through income)
  filingStatus: FilingStatus
  entityType: BusinessEntityType
  // Revenue
  grossRevenue: number          // Total business revenue
  costOfGoodsSold: number       // COGS for product-based businesses
  // Expenses
  expenses: BusinessExpenses
  // S-Corp specific
  sCorpSalary: number           // Reasonable salary (W-2 to yourself)
  sCorpDistributions: number    // K-1 distributions
  // Self-employed deductions (above-the-line)
  healthInsurancePremiums: number
  retirementContributions: number  // SEP-IRA, Solo 401(k)
  // Payments already made
  estimatedTaxPayments: number
  // State
  state: string
}

export interface BusinessTaxResult {
  // Revenue & profit
  grossRevenue: number
  totalExpenses: number
  costOfGoodsSold: number
  netBusinessIncome: number

  // Entity-specific
  entityType: BusinessEntityType
  entityLabel: string

  // Self-employment tax (sole prop, LLC, partnership)
  selfEmploymentTax: number
  selfEmploymentDeduction: number
  seSubjectIncome: number

  // S-Corp breakdown
  sCorpSalary: number
  sCorpDistributions: number
  sCorpSETaxSavings: number

  // C-Corp
  corporateTax: number
  corporateTaxableIncome: number

  // Pass-through to personal return
  passThruIncome: number         // Amount that flows to personal 1040
  qbiDeduction: number           // 20% QBI deduction

  // Above-the-line deductions
  healthInsuranceDeduction: number
  retirementDeduction: number
  maxRetirementContribution: number

  // Personal tax on business income
  adjustedGrossIncome: number
  standardDeduction: number
  taxableIncome: number
  federalTax: number
  stateTax: number
  stateLabel: string
  effectiveRate: number
  marginalBracket: string

  // Total & quarterly
  totalTaxOwed: number
  estimatedTaxPayments: number
  remainingOwed: number          // positive = still owe, negative = overpaid
  quarterlyPaymentNeeded: number

  // Insights
  insights: string[]
  disclaimer: string
}

function calculateTotalExpenses(exp: BusinessExpenses): number {
  const vehicleDeduction = exp.vehicleMiles > 0
    ? exp.vehicleMiles * 0.70
    : exp.vehicleActualExpense

  const homeOfficeDeduction = exp.homeOfficeSquareFeet > 0
    ? Math.min(exp.homeOfficeSquareFeet, 300) * 5
    : exp.homeOfficeActualExpense

  const mealsDeduction = exp.travelMeals * 0.5

  return Math.round(
    exp.advertisingMarketing +
    vehicleDeduction +
    homeOfficeDeduction +
    exp.insurance +
    exp.officeSupplies +
    exp.phoneInternet +
    exp.softwareSubscriptions +
    exp.professionalServices +
    exp.rentLease +
    mealsDeduction +
    exp.equipmentPurchases +
    exp.education +
    exp.contractLabor +
    exp.otherExpenses
  )
}

export function calculateBusinessTax(input: BusinessTaxInput): BusinessTaxResult {
  const insights: string[] = []
  const entity = input.entityType
  const isPassThrough = entity !== 'c_corp'
  const isCCorp = entity === 'c_corp'
  const isSCorp = entity === 's_corp'

  // ── 1. Net business income ─────────────────────────────────────────────────
  const expenseTotal = calculateTotalExpenses(input.expenses)
  const netBusinessIncome = Math.max(0, input.grossRevenue - expenseTotal - input.costOfGoodsSold)

  // ── 2. SE tax calculation ──────────────────────────────────────────────────
  let seSubjectIncome: number
  let passThruIncome: number
  let sCorpSETaxSavings = 0

  if (isSCorp) {
    // S-Corp: salary is W-2 (employer pays half of payroll tax)
    // Distributions are NOT subject to SE tax
    seSubjectIncome = 0  // SE tax doesn't apply — payroll tax on salary handled separately
    passThruIncome = input.sCorpSalary + input.sCorpDistributions
    // Calculate savings vs if all income were SE
    const hypotheticalSE = Math.round(netBusinessIncome * 0.9235 * 0.153)
    const actualPayrollOnSalary = Math.round(input.sCorpSalary * 0.153) // approximate employer + employee
    sCorpSETaxSavings = Math.max(0, hypotheticalSE - actualPayrollOnSalary)
  } else if (isCCorp) {
    seSubjectIncome = 0
    passThruIncome = 0  // C-Corp income stays in entity
  } else {
    // Sole prop, LLC, partnership — all net income is SE income
    seSubjectIncome = netBusinessIncome
    passThruIncome = netBusinessIncome
  }

  const seIncomeBase = seSubjectIncome * 0.9235
  const selfEmploymentTax = seSubjectIncome > 0
    ? Math.round(Math.min(seIncomeBase, 176_100) * 0.153 + Math.max(0, seIncomeBase - 176_100) * 0.029)
    : 0
  const selfEmploymentDeduction = Math.round(selfEmploymentTax / 2)

  // ── 3. Above-the-line deductions ───────────────────────────────────────────
  const healthInsuranceDeduction = seSubjectIncome > 0 || isSCorp
    ? Math.min(input.healthInsurancePremiums, passThruIncome > 0 ? passThruIncome : netBusinessIncome)
    : 0

  const maxRetirementContribution = isPassThrough
    ? Math.min(netBusinessIncome * 0.25, 69_000)
    : 69_000
  const retirementDeduction = Math.min(input.retirementContributions, maxRetirementContribution)

  // ── 4. AGI ─────────────────────────────────────────────────────────────────
  const adjustedGrossIncome = Math.max(0, passThruIncome - selfEmploymentDeduction - healthInsuranceDeduction - retirementDeduction)

  // ── 5. QBI Deduction (20% for pass-through) ───────────────────────────────
  let qbiDeduction = 0
  if (isPassThrough && passThruIncome > 0) {
    const tentativeQBI = Math.round(passThruIncome * 0.20)
    const phaseOutStart = input.filingStatus === 'married_jointly' ? 383_900 : 191_950
    if (adjustedGrossIncome <= phaseOutStart) {
      qbiDeduction = tentativeQBI
    } else {
      const phaseOutRange = 50_000
      const reduction = Math.min(1, (adjustedGrossIncome - phaseOutStart) / phaseOutRange)
      qbiDeduction = Math.round(tentativeQBI * (1 - reduction))
    }
  }

  // ── 6. Taxable income ──────────────────────────────────────────────────────
  const standardDeduction = STANDARD_DEDUCTION_2025[input.filingStatus]
  const taxableIncome = Math.max(0, adjustedGrossIncome - standardDeduction - qbiDeduction)

  // ── 7. Federal tax ─────────────────────────────────────────────────────────
  const brackets = BRACKETS_2025[input.filingStatus]
  const { tax: federalTax, marginalBracket } = calculateProgressiveTax(taxableIncome, brackets)

  // ── 8. C-Corp tax ──────────────────────────────────────────────────────────
  let corporateTax = 0
  let corporateTaxableIncome = 0
  if (isCCorp && netBusinessIncome > 0) {
    corporateTaxableIncome = netBusinessIncome
    corporateTax = Math.round(corporateTaxableIncome * 0.21)
  }

  // ── 9. State tax ───────────────────────────────────────────────────────────
  const stateInfo = STATE_TAX_RATES[input.state] ?? { rate: 0.05, label: input.state }
  const stateSubjectIncome = isCCorp ? corporateTaxableIncome : taxableIncome
  const stateTax = Math.round(stateSubjectIncome * stateInfo.rate)

  // ── 10. Total & quarterly ──────────────────────────────────────────────────
  const totalTaxOwed = federalTax + selfEmploymentTax + stateTax + corporateTax
  const remainingOwed = totalTaxOwed - input.estimatedTaxPayments

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const quartersRemaining = currentMonth <= 3 ? 4 : currentMonth <= 6 ? 3 : currentMonth <= 9 ? 2 : 1
  const quarterlyPaymentNeeded = remainingOwed > 0
    ? Math.round(remainingOwed / quartersRemaining)
    : 0

  const effectiveRate = (isCCorp ? netBusinessIncome : passThruIncome) > 0
    ? Math.round((totalTaxOwed / (isCCorp ? netBusinessIncome : passThruIncome)) * 1000) / 10
    : 0

  // ── 11. Insights ───────────────────────────────────────────────────────────

  // Expense insights
  if (expenseTotal > 0) {
    const expenseRatio = Math.round((expenseTotal / input.grossRevenue) * 100)
    insights.push(`Business deductions of $${expenseTotal.toLocaleString()} (${expenseRatio}% of revenue) reduce your taxable income. Keep receipts for all expenses.`)
  } else if (input.grossRevenue > 0) {
    insights.push('You reported no business expenses. Even home-based businesses can deduct home office, internet, phone, software, supplies, and mileage. These deductions can save thousands.')
  }

  if (input.expenses.homeOfficeSquareFeet === 0 && input.expenses.homeOfficeActualExpense === 0 && netBusinessIncome > 0) {
    insights.push('Home office deduction: If you use part of your home exclusively for business, deduct $5/sq ft (up to 300 sq ft = $1,500) using the simplified method.')
  }

  if (input.expenses.vehicleMiles === 0 && input.expenses.vehicleActualExpense === 0 && netBusinessIncome > 0) {
    insights.push('Vehicle deduction: If you drive for business, the 2025 IRS mileage rate is $0.70/mile. A tracking app like MileIQ can automate this.')
  }

  // Entity-specific insights
  if ((entity === 'sole_proprietor' || entity === 'single_member_llc') && netBusinessIncome > 60_000) {
    insights.push('With net income over $60K, consider S-Corp election. You\'d pay yourself a reasonable salary and take the rest as distributions — saving 15.3% SE tax on the distribution portion.')
  }

  if (isSCorp) {
    const totalSCorpIncome = input.sCorpSalary + input.sCorpDistributions
    if (totalSCorpIncome > 0) {
      const salaryPercent = Math.round((input.sCorpSalary / totalSCorpIncome) * 100)
      if (salaryPercent < 40) {
        insights.push(`Your S-Corp salary is ${salaryPercent}% of total income. The IRS requires "reasonable compensation." If salary is too low, you risk reclassification of distributions as wages.`)
      } else if (salaryPercent > 80) {
        insights.push(`Your S-Corp salary is ${salaryPercent}% of total income. Consider taking more as distributions to maximize SE tax savings (while maintaining reasonable salary).`)
      }
    }
    if (sCorpSETaxSavings > 0) {
      insights.push(`S-Corp structure saves you approximately $${sCorpSETaxSavings.toLocaleString()} in self-employment tax compared to filing as a sole proprietor.`)
    }
  }

  if (isCCorp) {
    insights.push(`C-Corp tax: $${corporateTax.toLocaleString()} at 21% flat rate. Dividends paid to you are taxed again on your personal return (double taxation). Consider S-Corp election for small businesses.`)
  }

  // QBI
  if (qbiDeduction > 0) {
    insights.push(`Qualified Business Income (QBI) deduction saves you $${qbiDeduction.toLocaleString()} — that's 20% of qualified pass-through income.`)
  }

  // SE tax
  if (selfEmploymentTax > 0) {
    insights.push(`Self-employment tax: $${selfEmploymentTax.toLocaleString()} (15.3% of net SE income). Half ($${selfEmploymentDeduction.toLocaleString()}) is deductible above the line.`)
  }

  // Health insurance
  if (healthInsuranceDeduction > 0) {
    insights.push(`Self-employed health insurance deduction: $${healthInsuranceDeduction.toLocaleString()} reduces your AGI.`)
  } else if (netBusinessIncome > 0) {
    insights.push('If you pay for your own health insurance, the premiums are deductible above the line as a self-employed individual.')
  }

  // Retirement
  if (retirementDeduction > 0) {
    insights.push(`Retirement deduction: $${retirementDeduction.toLocaleString()}. Max SEP-IRA for your income: $${Math.round(maxRetirementContribution).toLocaleString()}.`)
  } else if (netBusinessIncome > 30_000) {
    insights.push(`Consider a SEP-IRA or Solo 401(k) — contribute up to $${Math.round(maxRetirementContribution).toLocaleString()} (25% of net income, max $69,000) to reduce taxable income.`)
  }

  // Quarterly payments
  if (quarterlyPaymentNeeded > 0) {
    insights.push(`Estimated quarterly payment needed: $${quarterlyPaymentNeeded.toLocaleString()}/quarter. Due: April 15, June 15, Sept 15, Jan 15. Pay via IRS Direct Pay or EFTPS.`)
  }

  if (input.estimatedTaxPayments > 0 && remainingOwed <= 0) {
    insights.push(`Your estimated payments of $${input.estimatedTaxPayments.toLocaleString()} exceed your estimated liability. You may receive a refund of $${Math.abs(remainingOwed).toLocaleString()}.`)
  }

  // State
  if (stateInfo.rate === 0) {
    insights.push(`${stateInfo.label} — no state income tax on business income.`)
  }

  return {
    grossRevenue: input.grossRevenue,
    totalExpenses: expenseTotal,
    costOfGoodsSold: input.costOfGoodsSold,
    netBusinessIncome,
    entityType: entity,
    entityLabel: ENTITY_TYPE_LABELS[entity],
    selfEmploymentTax,
    selfEmploymentDeduction,
    seSubjectIncome,
    sCorpSalary: input.sCorpSalary,
    sCorpDistributions: input.sCorpDistributions,
    sCorpSETaxSavings: sCorpSETaxSavings,
    corporateTax,
    corporateTaxableIncome,
    passThruIncome,
    qbiDeduction,
    healthInsuranceDeduction,
    retirementDeduction,
    maxRetirementContribution,
    adjustedGrossIncome,
    standardDeduction,
    taxableIncome,
    federalTax,
    stateTax,
    stateLabel: stateInfo.label,
    effectiveRate,
    marginalBracket,
    totalTaxOwed,
    estimatedTaxPayments: input.estimatedTaxPayments,
    remainingOwed,
    quarterlyPaymentNeeded,
    insights,
    disclaimer: 'This is a preliminary estimate for business income tax only. It uses simplified calculations for SE tax, QBI deduction, and entity-level taxation. It does NOT include any personal W-2 income, investment income, or personal credits. Business and personal taxes are filed on separate schedules — consult a qualified CPA or tax professional for official advice.',
  }
}
