// scripts/test-mock-data.ts
// Pure Node.js logic tests against mock CSV data.
// Run: npx tsx --tsconfig tsconfig.app.json scripts/test-mock-data.ts

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { categorizeTransactions } from '../src/lib/categorization-engine'
import { calculatePersonalTax, calculateBusinessTax, emptyBusinessExpenses } from '../src/lib/tax-estimator'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const BASE = resolve(__dirname, '../public/test-data/riverside-cafe/april-2026')

// ─── CSV HELPERS ────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) { fields.push(current); current = '' }
    else current += ch
  }
  fields.push(current)
  return fields
}

function readCSV(filename: string): { headers: string[]; rows: string[][] } {
  const text = readFileSync(resolve(BASE, filename), 'utf-8')
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1).map(parseCSVLine)
  return { headers, rows }
}

// ─── TEST TRACKING ──────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++
  } else {
    failed++
    failures.push(detail ? `${testName}: ${detail}` : testName)
  }
}

// ─── TEST 1: Bank Statement CSV ─────────────────────────────────────────────

console.log('\n── TEST 1: CSV Parser — Bank Statement ──')
const bank = readCSV('bank-statement-chase-april-2026.csv')
const bankDateIdx = bank.headers.findIndex(h => h.toLowerCase().includes('date'))
const bankDescIdx = bank.headers.findIndex(h => h.toLowerCase().includes('description'))
const bankAmtIdx = bank.headers.findIndex(h => h.toLowerCase().includes('amount'))
const bankBalIdx = bank.headers.findIndex(h => h.toLowerCase().includes('balance'))

const bankTxns = bank.rows.filter(r => {
  const amt = r[bankAmtIdx]?.trim()
  return amt && amt.length > 0
})

const allBankRows = bank.rows
const hasDate = bankTxns.every(r => r[bankDateIdx]?.trim().length > 0)
const hasDesc = bankTxns.every(r => r[bankDescIdx]?.trim().length > 0)
const hasAmt = bankTxns.every(r => r[bankAmtIdx]?.trim().length > 0)

assert(bankTxns.length > 30, 'TEST 1', `Expected >30 transactions, got ${bankTxns.length}`)
assert(hasDate && hasDesc && hasAmt, 'TEST 1', 'Some rows missing date/description/amount')

// Check debits negative, credits positive
const debits = bankTxns.filter(r => parseFloat(r[bankAmtIdx].replace(/[$,]/g, '')) < 0)
const credits = bankTxns.filter(r => parseFloat(r[bankAmtIdx].replace(/[$,]/g, '')) > 0)
assert(debits.length > 0 && credits.length > 0, 'TEST 1', 'Missing debits or credits')

// Check opening and closing balance
const openingRow = allBankRows.find(r => r[bankDescIdx]?.includes('OPENING'))
const closingRow = allBankRows.find(r => r[bankDescIdx]?.includes('CLOSING'))
assert(!!openingRow && !!closingRow, 'TEST 1', 'Missing opening or closing balance row')

const closingBal = closingRow ? parseFloat(closingRow[bankBalIdx]?.replace(/[$,]/g, '') ?? '0') : 0
console.log(`✓ Bank statement parsed: ${bankTxns.length} transactions, balance $${closingBal.toLocaleString()}`)

// ─── TEST 2: Credit Card CSV ────────────────────────────────────────────────

console.log('\n── TEST 2: CSV Parser — Credit Card ──')
const cc = readCSV('credit-card-chase-ink-april-2026.csv')
const ccAmtIdx = cc.headers.findIndex(h => h.toLowerCase().includes('amount'))
const ccDescIdx = cc.headers.findIndex(h => h.toLowerCase().includes('description'))

const ccTxns = cc.rows.filter(r => r[ccAmtIdx]?.trim().length > 0)
const ccHasAmtDesc = ccTxns.every(r => r[ccAmtIdx]?.trim().length > 0 && r[ccDescIdx]?.trim().length > 0)

assert(ccTxns.length > 20, 'TEST 2', `Expected >20 transactions, got ${ccTxns.length}`)
assert(ccHasAmtDesc, 'TEST 2', 'Some rows missing amount or description')
console.log(`✓ Credit card parsed: ${ccTxns.length} transactions`)

// ─── TEST 3: Payroll CSV ────────────────────────────────────────────────────

console.log('\n── TEST 3: CSV Parser — Payroll ──')
const payroll = readCSV('payroll-report-april-2026.csv')
const prGrossIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('gross'))
const prNetIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('net'))
const prEmpIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('employee'))
const prPeriodIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('pay period'))
const prFedIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('federal'))
const prStateIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('state'))
const prSSIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('social'))
const prMedIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('medicare'))
const prHealthIdx = payroll.headers.findIndex(h => h.toLowerCase().includes('health'))

const employees = new Set(payroll.rows.map(r => r[prEmpIdx]?.trim()))
const payPeriods = new Set(payroll.rows.map(r => r[prPeriodIdx]?.trim()))

assert(employees.size === 4, 'TEST 3', `Expected 4 employees, got ${employees.size}`)
assert(payPeriods.size === 2, 'TEST 3', `Expected 2 pay periods, got ${payPeriods.size}`)

// Check net = gross - deductions for each row
let netCheckPassed = true
for (const row of payroll.rows) {
  const gross = parseFloat(row[prGrossIdx])
  const fed = parseFloat(row[prFedIdx])
  const state = parseFloat(row[prStateIdx])
  const ss = parseFloat(row[prSSIdx])
  const med = parseFloat(row[prMedIdx])
  const health = parseFloat(row[prHealthIdx])
  const net = parseFloat(row[prNetIdx])
  const calculated = gross - fed - state - ss - med - health
  if (Math.abs(calculated - net) > 0.02) {
    netCheckPassed = false
  }
}
assert(netCheckPassed, 'TEST 3', 'Net pay does not equal gross minus deductions')

const totalGross = payroll.rows.reduce((s, r) => s + parseFloat(r[prGrossIdx]), 0)
assert(totalGross >= 8000 && totalGross <= 16000, 'TEST 3', `Total gross $${totalGross} not in expected range`)
console.log(`✓ Payroll parsed: ${employees.size} employees, total gross $${totalGross.toLocaleString()}`)

// ─── TEST 4: Categorization Engine ──────────────────────────────────────────

console.log('\n── TEST 4: Categorization Engine ──')
const testTxns = [
  { description: 'SYSCO FOOD SERVICES', amount: -2340, date: '04/01/2026' },
  { description: 'CON EDISON', amount: -420, date: '04/02/2026' },
  { description: 'SQUARE POS FEE', amount: -60, date: '04/10/2026' },
  { description: 'QUICKBOOKS', amount: -85, date: '04/04/2026' },
  { description: 'PAYROLL DIRECT DEP', amount: -4280, date: '04/05/2026' },
  { description: 'GRUBHUB COMMISSION', amount: -445, date: '04/02/2026' },
  { description: 'GOOGLE ADS', amount: -200, date: '04/04/2026' },
  { description: 'YELP ADVERTISING', amount: -150, date: '04/04/2026' },
  { description: 'SHELL OIL', amount: -68, date: '04/08/2026' },
  { description: 'AMAZON BUSINESS', amount: -234, date: '04/08/2026' },
]

// Map amount to absolute for the engine (it expects positive amounts)
const engineInput = testTxns.map(t => ({
  description: t.description,
  amount: Math.abs(t.amount),
  date: t.date,
  type: 'debit' as const,
  category: '',
}))

const catReport = categorizeTransactions(engineInput)

const expected: Record<string, string[]> = {
  'CON EDISON': ['Utilities'],
  'QUICKBOOKS': ['Software', 'Office'],
  'GOOGLE ADS': ['Marketing', 'Advertising'],
  'YELP ADVERTISING': ['Marketing', 'Advertising'],
  'SHELL OIL': ['Vehicle', 'Gas', 'Auto', 'Travel', 'Fuel'],
  'AMAZON BUSINESS': ['Office Supplies'],
  'GRUBHUB COMMISSION': ['Meals'],
  'SQUARE POS FEE': ['Banking', 'Finance', 'Software'],
  'PAYROLL DIRECT DEP': ['Payroll', 'Office'],
}

let catPassed = 0
let catFailed = 0
for (const txn of catReport.transactions) {
  const desc = txn.originalDescription
  const cat = txn.category
  const expectedCats = expected[desc]
  if (expectedCats) {
    const match = expectedCats.some(e => cat.toLowerCase().includes(e.toLowerCase()))
    if (match) {
      console.log(`  ✓ '${desc}' → ${cat}`)
      catPassed++
    } else {
      console.log(`  ✗ '${desc}' → ${cat} (expected one of: ${expectedCats.join(', ')})`)
      catFailed++
    }
  } else {
    // SYSCO has no specific expected category (not in vendor DB), just log
    console.log(`  ✓ '${desc}' → ${cat}`)
    catPassed++
  }
}

assert(catFailed === 0, 'TEST 4', `${catFailed} categorization mismatches`)
console.log(`✓ Categorization: ${catPassed}/${catReport.transactions.length} correct`)

// ─── TEST 5: Tax Estimator Math ─────────────────────────────────────────────

console.log('\n── TEST 5: Tax Estimator Math ──')

const personalResult = calculatePersonalTax({
  filingStatus: 'single',
  w2Income: 85000,
  w2Withheld: 0,
  investmentIncome: 0,
  otherIncome: 0,
  dependents: 0,
  dependentAges: [],
  priorYearRefund: 0,
  state: 'NY',
})

const fedTax = personalResult.federalTaxAfterCredits
const effRate = personalResult.effectiveRate
assert(fedTax >= 10000 && fedTax <= 18000, 'TEST 5 Personal', `Federal tax $${fedTax} not in range $10k-$18k`)
assert(effRate >= 10 && effRate <= 25, 'TEST 5 Personal', `Effective rate ${effRate}% not in range 10%-25%`)
console.log(`✓ Personal tax: $${fedTax.toLocaleString()} (${effRate}% effective)`)

const bizResult = calculateBusinessTax({
  filingStatus: 'single',
  entityType: 'sole_prop',
  grossRevenue: 120000,
  costOfGoodsSold: 0,
  expenses: emptyBusinessExpenses(),
  sCorpSalary: 0,
  sCorpDistributions: 0,
  healthInsurancePremiums: 0,
  retirementContributions: 0,
  estimatedTaxPayments: 0,
  state: 'NY',
})

const seTax = bizResult.selfEmploymentTax
const qbi = bizResult.qbiDeduction
assert(seTax >= 14000 && seTax <= 20000, 'TEST 5 Business', `SE tax $${seTax} not in range $14k-$20k`)
assert(qbi >= 18000 && qbi <= 28000, 'TEST 5 Business', `QBI deduction $${qbi} not in expected range`)
console.log(`✓ Business tax: SE tax $${seTax.toLocaleString()}, QBI deduction $${qbi.toLocaleString()}`)

// ─── TEST 6: Internal Consistency — Payroll Reconciliation ──────────────────

console.log('\n── TEST 6: Payroll Reconciliation ──')

// Bank statement payroll entries
const bankPayrollRows = bankTxns.filter(r => r[bankDescIdx]?.includes('PAYROLL'))
const bankPayrollTotal = bankPayrollRows.reduce((s, r) => s + Math.abs(parseFloat(r[bankAmtIdx].replace(/[$,]/g, ''))), 0)

// Payroll report: sum net pay
const payrollNetTotal = payroll.rows.reduce((s, r) => s + parseFloat(r[prNetIdx]), 0)

// Allow 5% variance
const variance = Math.abs(bankPayrollTotal - payrollNetTotal) / payrollNetTotal
assert(variance <= 0.05, 'TEST 6', `Variance ${(variance * 100).toFixed(1)}% exceeds 5% — bank $${bankPayrollTotal} vs payroll $${payrollNetTotal.toFixed(2)}`)
console.log(`✓ Payroll reconciles: bank $${bankPayrollTotal.toLocaleString()} vs payroll report $${payrollNetTotal.toFixed(2)}`)

// ─── SUMMARY ────────────────────────────────────────────────────────────────

console.log('\n=== TEST RESULTS ===')
console.log(`Passed: ${passed}/${passed + failed}`)
console.log(`Failed: ${failed}/${passed + failed}`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) {
    console.log(`  ✗ ${f}`)
  }
  process.exit(1)
}
