// src/lib/parse-bank-statement.ts
// Client-side financial document parser using PDF.js.
// Supports: bank statements, credit card statements, payroll reports,
//           utility bills, mortgage/loan statements.
// Works offline — no API calls, no data leaves the browser.

import * as pdfjsLib from 'pdfjs-dist'

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// ─── DOCUMENT TYPE ────────────────────────────────────────────────────────

export type StatementType =
  | 'bank'
  | 'credit_card'
  | 'payroll'
  | 'utility'
  | 'mortgage'
  | 'student_loan'
  | 'unknown'

export interface ParsedTransaction {
  date: string           // MM/DD or MM/DD/YYYY as found in statement
  description: string    // payee / memo
  amount: number         // positive = credit/deposit, negative = debit/withdrawal
  balance?: number       // running balance if present
  category?: string      // auto-categorized (see categorizeVendor)
  raw: string            // original line from PDF
}

export interface CreditCardSummary {
  creditLimit: number | null
  availableCredit: number | null
  minimumPayment: number | null
  paymentDueDate: string | null
  apr: number | null          // as percentage e.g. 24.99
  previousBalance: number | null
  newCharges: number | null
  paymentsAndCredits: number | null
  newBalance: number | null
  /** Last 4 of the account number — extracted by the parser when present. Optional. */
  accountLast4: string | null
}

export interface PayrollSummary {
  payPeriodStart: string | null
  payPeriodEnd: string | null
  payDate: string | null
  grossPay: number | null
  netPay: number | null
  totalDeductions: number | null
  federalTax: number | null
  stateTax: number | null
  socialSecurity: number | null
  medicare: number | null
  healthInsurance: number | null
  retirement401k: number | null
  employeeCount: number | null
  payrollProvider: string | null   // ADP, Gusto, Paychex, etc.
}

export interface UtilityBillSummary {
  provider: string | null
  serviceType: string | null       // electric, gas, water, internet, phone
  accountNumber: string | null
  billingPeriod: string | null
  amountDue: number | null
  dueDate: string | null
  previousBalance: number | null
  usage: string | null             // e.g. "1,234 kWh" or "45 therms"
}

export interface MortgageLoanSummary {
  lender: string | null
  loanType: string | null          // mortgage, student_loan, auto
  accountNumber: string | null
  principalBalance: number | null
  interestRate: number | null
  monthlyPayment: number | null
  principalPortion: number | null
  interestPortion: number | null
  escrowPortion: number | null
  nextPaymentDue: string | null
  maturityDate: string | null
}

export interface StatementSummary {
  statementType: StatementType
  transactions: ParsedTransaction[]
  startDate: string | null
  endDate: string | null
  openingBalance: number | null
  closingBalance: number | null
  totalDebits: number
  totalCredits: number
  pageCount: number
  bankName: string | null
  // Type-specific details (populated when detected)
  creditCard?: CreditCardSummary
  payroll?: PayrollSummary
  utility?: UtilityBillSummary
  mortgageLoan?: MortgageLoanSummary
}

// Common date patterns in bank statements
const DATE_PATTERN = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/
// Amount patterns: $1,234.56 or 1,234.56 or -1234.56
const AMOUNT_PATTERN = /[-−]?\$?\d{1,3}(?:,\d{3})*\.\d{2}/g
// Balance keywords
const BALANCE_KEYWORDS = /(?:beginning|opening|starting|ending|closing|available)\s*balance/i

// ─── PDF TEXT EXTRACTION (shared by all parsers) ──────────────────────────

async function extractPDFLines(file: File): Promise<{ lines: string[]; pageCount: number }> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const allLines: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()

    // Group text items into lines by Y position
    const lineMap = new Map<number, string[]>()
    for (const item of textContent.items) {
      if (!('str' in item)) continue
      const y = Math.round(('transform' in item ? item.transform[5] : 0) * 10) / 10
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push(item.str)
    }

    // Sort by Y descending (top of page first) and join
    const sortedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(' ').trim())
      .filter(line => line.length > 0)

    allLines.push(...sortedLines)
  }

  return { lines: allLines, pageCount: pdf.numPages }
}

// ─── CSV IMPORT (bank exports — most reliable path) ──────────────────────

/** Parse a CSV bank/credit card export file (browser File wrapper over pure parser). */
export async function parseCSVStatement(file: File): Promise<StatementSummary> {
  const { parseCSVText } = await import('./parse-csv-statement')
  const text = await file.text()
  const csv = parseCSVText(text)
  return {
    statementType: 'bank',
    transactions: csv.transactions.map(t => ({
      ...t,
      category: t.category ?? categorizeVendor(t.description),
    })),
    startDate: csv.startDate,
    endDate: csv.endDate,
    openingBalance: csv.openingBalance,
    closingBalance: csv.closingBalance,
    totalDebits: csv.totalDebits,
    totalCredits: csv.totalCredits,
    pageCount: csv.pageCount,
    bankName: csv.bankName,
  }
}

// ─── MAIN PARSER (auto-detects statement type) ───────────────────────────

/** Parse any financial document PDF and extract structured data */
export async function parseBankStatementPDF(file: File): Promise<StatementSummary> {
  // CSV files go through the CSV parser
  if (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.qbo')) {
    return parseCSVStatement(file)
  }

  const { lines, pageCount } = await extractPDFLines(file)

  // Auto-detect statement type from content
  const statementType = detectStatementType(lines)
  const bankName = detectBankName(lines.slice(0, 30))

  // Route to type-specific parser
  switch (statementType) {
    case 'credit_card':
      return parseCreditCardStatement(lines, pageCount, bankName)
    case 'payroll':
      return parsePayrollReport(lines, pageCount)
    case 'utility':
      return parseUtilityBill(lines, pageCount)
    case 'mortgage':
    case 'student_loan':
      return parseMortgageLoanStatement(lines, pageCount, statementType)
    default:
      return parseBankStatement(lines, pageCount, bankName)
  }
}

// ─── STATEMENT TYPE DETECTION ─────────────────────────────────────────────

function detectStatementType(lines: string[]): StatementType {
  const text = lines.slice(0, 50).join(' ').toLowerCase()

  // Credit card signals
  const ccSignals = [
    /credit\s*card\s*statement/i,
    /minimum\s*payment/i,
    /credit\s*limit/i,
    /available\s*credit/i,
    /annual\s*percentage\s*rate|apr/i,
    /new\s*charges|purchases/i,
    /payment\s*due\s*date/i,
  ]
  const ccScore = ccSignals.filter(p => p.test(text)).length
  if (ccScore >= 2) return 'credit_card'

  // Payroll signals
  const payrollSignals = [
    /payroll\s*(report|summary|register)/i,
    /gross\s*pay/i,
    /net\s*pay/i,
    /federal\s*(income\s*)?tax/i,
    /social\s*security|fica/i,
    /pay\s*period|pay\s*date/i,
    /\b(adp|gusto|paychex|paylocity|rippling|justworks)\b/i,
    /employee\s*earnings/i,
    /deductions\s*summary/i,
    /hours\s*worked/i,
  ]
  const payrollScore = payrollSignals.filter(p => p.test(text)).length
  if (payrollScore >= 2) return 'payroll'

  // Utility bill signals
  const utilitySignals = [
    /utility\s*bill|service\s*statement/i,
    /\b(kwh|therms|gallons|ccf|mcf)\b/i,
    /meter\s*read/i,
    /usage\s*(summary|details|charges)/i,
    /\b(electric|gas|water|sewer|internet|broadband)\b.*\b(service|charges?)\b/i,
    /\b(comcast|xfinity|spectrum|at&t|verizon|pge|con\s*edison|duke\s*energy|national\s*grid)\b/i,
  ]
  const utilityScore = utilitySignals.filter(p => p.test(text)).length
  if (utilityScore >= 2) return 'utility'

  // Mortgage / loan signals
  const mortgageSignals = [
    /mortgage\s*statement/i,
    /principal\s*(balance|remaining|portion)/i,
    /escrow\s*(balance|payment|analysis)/i,
    /interest\s*rate.*\d+\.\d+%/i,
    /loan\s*(summary|details|number)/i,
    /maturity\s*date/i,
    /\b(principal|interest|escrow)\s*(and|&)\s*(interest|principal|escrow)\b/i,
  ]
  const mortgageScore = mortgageSignals.filter(p => p.test(text)).length
  if (mortgageScore >= 2) return 'mortgage'

  // Student loan signals
  const studentLoanSignals = [
    /student\s*loan/i,
    /\b(navient|nelnet|mohela|fedloan|aidvantage|great\s*lakes|sallie\s*mae)\b/i,
    /loan\s*group/i,
    /subsidized|unsubsidized/i,
    /repayment\s*plan/i,
    /income.driven\s*repayment/i,
  ]
  const studentLoanScore = studentLoanSignals.filter(p => p.test(text)).length
  if (studentLoanScore >= 2) return 'student_loan'

  return 'bank'
}

// ─── BANK STATEMENT PARSER ────────────────────────────────────────────────

function parseBankStatement(
  lines: string[],
  pageCount: number,
  bankName: string | null,
): StatementSummary {
  const transactions = extractTransactions(lines)
  const openingBalance = extractBalance(lines, 'opening')
  const closingBalance = extractBalance(lines, 'closing')

  const totalDebits = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalCredits = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const dates = transactions.map(t => t.date).filter(Boolean)

  return {
    statementType: 'bank',
    transactions,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    openingBalance,
    closingBalance,
    totalDebits: round2(totalDebits),
    totalCredits: round2(totalCredits),
    pageCount,
    bankName,
  }
}

// ─── CREDIT CARD STATEMENT PARSER ─────────────────────────────────────────

function parseCreditCardStatement(
  lines: string[],
  pageCount: number,
  bankName: string | null,
): StatementSummary {
  const transactions = extractTransactions(lines)
  const text = lines.join('\n')

  // Extract last-4 of card from common patterns: "ending in 1234", "**** 1234", "x1234".
  const last4Match = text.match(/(?:ending\s+in\s+|\*+\s*|x)(\d{4})\b/i)

  const creditCard: CreditCardSummary = {
    creditLimit: extractDollarValue(text, /credit\s*limit[:\s]*\$?([\d,]+\.?\d*)/i),
    availableCredit: extractDollarValue(text, /available\s*credit[:\s]*\$?([\d,]+\.?\d*)/i),
    minimumPayment: extractDollarValue(text, /minimum\s*payment(?:\s*due)?[:\s]*\$?([\d,]+\.?\d*)/i),
    paymentDueDate: extractDateValue(text, /(?:payment\s*)?due\s*date[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i),
    apr: extractPercentValue(text, /(?:purchase\s*)?apr[:\s]*([\d.]+)%/i),
    previousBalance: extractDollarValue(text, /previous\s*balance[:\s]*\$?([\d,]+\.?\d*)/i),
    newCharges: extractDollarValue(text, /(?:new\s*)?(?:charges|purchases)[:\s]*\$?([\d,]+\.?\d*)/i),
    paymentsAndCredits: extractDollarValue(text, /payments?\s*(?:and|&)\s*credits?[:\s]*\$?([\d,]+\.?\d*)/i),
    newBalance: extractDollarValue(text, /(?:new|statement)\s*balance[:\s]*\$?([\d,]+\.?\d*)/i),
    accountLast4: last4Match ? last4Match[1] : null,
  }

  const totalDebits = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalCredits = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const dates = transactions.map(t => t.date).filter(Boolean)

  return {
    statementType: 'credit_card',
    transactions,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    openingBalance: creditCard.previousBalance,
    closingBalance: creditCard.newBalance,
    totalDebits: round2(totalDebits),
    totalCredits: round2(totalCredits),
    pageCount,
    bankName,
    creditCard,
  }
}

// ─── PAYROLL REPORT PARSER ────────────────────────────────────────────────

function parsePayrollReport(lines: string[], pageCount: number): StatementSummary {
  const text = lines.join('\n')

  // Detect payroll provider
  const providerPatterns: [RegExp, string][] = [
    [/\badp\b/i, 'ADP'],
    [/\bgusto\b/i, 'Gusto'],
    [/\bpaychex\b/i, 'Paychex'],
    [/\bpaylocity\b/i, 'Paylocity'],
    [/\brippling\b/i, 'Rippling'],
    [/\bjustworks\b/i, 'Justworks'],
    [/\bzenefits\b/i, 'Zenefits'],
    [/\bsquare\s*payroll\b/i, 'Square Payroll'],
    [/\bquickbooks\s*payroll\b/i, 'QuickBooks Payroll'],
    [/\bwave\s*payroll\b/i, 'Wave Payroll'],
    [/\bonpay\b/i, 'OnPay'],
  ]
  let payrollProvider: string | null = null
  for (const [pattern, name] of providerPatterns) {
    if (pattern.test(text)) { payrollProvider = name; break }
  }

  // Extract pay period dates
  const periodMatch = text.match(
    /pay\s*period[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–to]+\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
  )
  const payDateMatch = text.match(/pay\s*date[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i)

  // Count employees (look for patterns like numbered rows or "employees: N")
  const employeeCountMatch = text.match(/(\d+)\s*employees?/i)
  const employeeCount = employeeCountMatch ? parseInt(employeeCountMatch[1], 10) : null

  const payroll: PayrollSummary = {
    payPeriodStart: periodMatch ? periodMatch[1] : null,
    payPeriodEnd: periodMatch ? periodMatch[2] : null,
    payDate: payDateMatch ? payDateMatch[1] : null,
    grossPay: extractDollarValue(text, /(?:total\s*)?gross\s*pay(?:roll)?[:\s]*\$?([\d,]+\.?\d*)/i),
    netPay: extractDollarValue(text, /(?:total\s*)?net\s*pay(?:roll)?[:\s]*\$?([\d,]+\.?\d*)/i),
    totalDeductions: extractDollarValue(text, /total\s*deductions?[:\s]*\$?([\d,]+\.?\d*)/i),
    federalTax: extractDollarValue(text, /federal\s*(?:income\s*)?(?:tax|withholding)[:\s]*\$?([\d,]+\.?\d*)/i),
    stateTax: extractDollarValue(text, /state\s*(?:income\s*)?(?:tax|withholding)[:\s]*\$?([\d,]+\.?\d*)/i),
    socialSecurity: extractDollarValue(text, /(?:social\s*security|fica\s*(?:ss|oasdi))[:\s]*\$?([\d,]+\.?\d*)/i),
    medicare: extractDollarValue(text, /medicare[:\s]*\$?([\d,]+\.?\d*)/i),
    healthInsurance: extractDollarValue(text, /(?:health|medical)\s*insurance[:\s]*\$?([\d,]+\.?\d*)/i),
    retirement401k: extractDollarValue(text, /(?:401\s*\(?\s*k\s*\)?|retirement)[:\s]*\$?([\d,]+\.?\d*)/i),
    employeeCount: employeeCount,
    payrollProvider,
  }

  // Build pseudo-transactions for payroll line items
  const transactions: ParsedTransaction[] = []
  const payDate = payroll.payDate ?? ''

  if (payroll.grossPay !== null) {
    transactions.push({ date: payDate, description: 'Gross Payroll', amount: -(payroll.grossPay), category: 'Payroll', raw: '' })
  }
  if (payroll.federalTax !== null) {
    transactions.push({ date: payDate, description: 'Federal Tax Withholding', amount: -(payroll.federalTax), category: 'Payroll Tax', raw: '' })
  }
  if (payroll.stateTax !== null) {
    transactions.push({ date: payDate, description: 'State Tax Withholding', amount: -(payroll.stateTax), category: 'Payroll Tax', raw: '' })
  }
  if (payroll.socialSecurity !== null) {
    transactions.push({ date: payDate, description: 'Social Security (FICA)', amount: -(payroll.socialSecurity), category: 'Payroll Tax', raw: '' })
  }
  if (payroll.medicare !== null) {
    transactions.push({ date: payDate, description: 'Medicare', amount: -(payroll.medicare), category: 'Payroll Tax', raw: '' })
  }
  if (payroll.healthInsurance !== null) {
    transactions.push({ date: payDate, description: 'Health Insurance', amount: -(payroll.healthInsurance), category: 'Insurance', raw: '' })
  }
  if (payroll.retirement401k !== null) {
    transactions.push({ date: payDate, description: '401(k) Contribution', amount: -(payroll.retirement401k), category: 'Retirement', raw: '' })
  }

  const totalDebits = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  return {
    statementType: 'payroll',
    transactions,
    startDate: payroll.payPeriodStart,
    endDate: payroll.payPeriodEnd,
    openingBalance: null,
    closingBalance: null,
    totalDebits: round2(totalDebits),
    totalCredits: 0,
    pageCount,
    bankName: payrollProvider,
    payroll,
  }
}

// ─── UTILITY BILL PARSER ──────────────────────────────────────────────────

function parseUtilityBill(lines: string[], pageCount: number): StatementSummary {
  const text = lines.join('\n')

  // Detect provider and service type
  const providerPatterns: [RegExp, string, string][] = [
    [/comcast|xfinity/i, 'Comcast/Xfinity', 'internet'],
    [/spectrum/i, 'Spectrum', 'internet'],
    [/at&t|att\b/i, 'AT&T', 'phone'],
    [/verizon/i, 'Verizon', 'phone'],
    [/t-mobile/i, 'T-Mobile', 'phone'],
    [/pge|pacific\s*gas/i, 'PG&E', 'electric_gas'],
    [/con\s*edison|coned/i, 'Con Edison', 'electric'],
    [/duke\s*energy/i, 'Duke Energy', 'electric'],
    [/national\s*grid/i, 'National Grid', 'gas'],
    [/florida\s*power/i, 'Florida Power & Light', 'electric'],
    [/southern\s*california\s*edison/i, 'SoCal Edison', 'electric'],
    [/water\s*authority|water\s*dept/i, 'Water Authority', 'water'],
  ]

  let provider: string | null = null
  let serviceType: string | null = null
  for (const [pattern, name, svc] of providerPatterns) {
    if (pattern.test(text)) { provider = name; serviceType = svc; break }
  }

  // Detect from keywords if provider not matched
  if (!serviceType) {
    if (/\bkwh\b|electric/i.test(text)) serviceType = 'electric'
    else if (/\btherms?\b|natural\s*gas/i.test(text)) serviceType = 'gas'
    else if (/\bgallons?\b|water\s*usage/i.test(text)) serviceType = 'water'
    else if (/\binternet|broadband|wifi/i.test(text)) serviceType = 'internet'
  }

  // Extract usage (e.g., "1,234 kWh", "45 therms")
  const usageMatch = text.match(/([\d,]+\.?\d*)\s*(kwh|therms?|gallons?|ccf|mcf|mbps)/i)
  const usage = usageMatch ? `${usageMatch[1]} ${usageMatch[2]}` : null

  // Account number
  const acctMatch = text.match(/account\s*(?:#|number|no\.?)[:\s]*([\w-]+)/i)

  // Billing period
  const periodMatch = text.match(
    /(?:billing|service)\s*period[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*[-–to]+\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i
  )

  const utility: UtilityBillSummary = {
    provider,
    serviceType,
    accountNumber: acctMatch ? acctMatch[1] : null,
    billingPeriod: periodMatch ? `${periodMatch[1]} - ${periodMatch[2]}` : null,
    amountDue: extractDollarValue(text, /(?:total\s*)?amount\s*due[:\s]*\$?([\d,]+\.?\d*)/i)
                ?? extractDollarValue(text, /(?:total|balance)\s*due[:\s]*\$?([\d,]+\.?\d*)/i),
    dueDate: extractDateValue(text, /(?:payment\s*)?due\s*(?:date|by)[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i),
    previousBalance: extractDollarValue(text, /previous\s*balance[:\s]*\$?([\d,]+\.?\d*)/i),
    usage,
  }

  // Create a single transaction for the bill
  const transactions: ParsedTransaction[] = []
  if (utility.amountDue !== null) {
    transactions.push({
      date: utility.dueDate ?? '',
      description: `${provider ?? 'Utility'} — ${serviceType ?? 'service'}`,
      amount: -(utility.amountDue),
      category: serviceType === 'internet' || serviceType === 'phone'
        ? 'Utilities - Telecom'
        : 'Utilities',
      raw: '',
    })
  }

  return {
    statementType: 'utility',
    transactions,
    startDate: periodMatch ? periodMatch[1] : null,
    endDate: periodMatch ? periodMatch[2] : null,
    openingBalance: utility.previousBalance,
    closingBalance: utility.amountDue !== null ? -(utility.amountDue) : null,
    totalDebits: utility.amountDue !== null ? round2(utility.amountDue) : 0,
    totalCredits: 0,
    pageCount,
    bankName: provider,
    utility,
  }
}

// ─── MORTGAGE / LOAN STATEMENT PARSER ─────────────────────────────────────

function parseMortgageLoanStatement(
  lines: string[],
  pageCount: number,
  type: 'mortgage' | 'student_loan',
): StatementSummary {
  const text = lines.join('\n')

  // Detect lender
  const lenderPatterns: [RegExp, string][] = [
    [/wells\s*fargo\s*home/i, 'Wells Fargo Home Mortgage'],
    [/chase\s*home/i, 'Chase Home Lending'],
    [/bank\s*of\s*america\s*home/i, 'Bank of America Home Loans'],
    [/quicken\s*loans|rocket\s*mortgage/i, 'Rocket Mortgage'],
    [/mr\.?\s*cooper/i, 'Mr. Cooper'],
    [/freedom\s*mortgage/i, 'Freedom Mortgage'],
    [/pennymac/i, 'PennyMac'],
    [/navient/i, 'Navient'],
    [/nelnet/i, 'Nelnet'],
    [/mohela/i, 'MOHELA'],
    [/aidvantage/i, 'Aidvantage'],
    [/great\s*lakes/i, 'Great Lakes'],
    [/sallie\s*mae/i, 'Sallie Mae'],
    [/sofi/i, 'SoFi'],
  ]
  let lender: string | null = null
  for (const [pattern, name] of lenderPatterns) {
    if (pattern.test(text)) { lender = name; break }
  }

  const acctMatch = text.match(/(?:loan|account)\s*(?:#|number|no\.?)[:\s]*([\w-]+)/i)

  const mortgageLoan: MortgageLoanSummary = {
    lender,
    loanType: type === 'student_loan' ? 'student_loan' : 'mortgage',
    accountNumber: acctMatch ? acctMatch[1] : null,
    principalBalance: extractDollarValue(text, /(?:principal|outstanding|remaining)\s*balance[:\s]*\$?([\d,]+\.?\d*)/i),
    interestRate: extractPercentValue(text, /(?:interest|annual)\s*rate[:\s]*([\d.]+)%/i),
    monthlyPayment: extractDollarValue(text, /(?:monthly\s*)?payment\s*(?:amount|due)?[:\s]*\$?([\d,]+\.?\d*)/i),
    principalPortion: extractDollarValue(text, /principal\s*(?:portion|applied|payment)[:\s]*\$?([\d,]+\.?\d*)/i),
    interestPortion: extractDollarValue(text, /interest\s*(?:portion|charged?|payment)[:\s]*\$?([\d,]+\.?\d*)/i),
    escrowPortion: type === 'mortgage'
      ? extractDollarValue(text, /escrow\s*(?:portion|payment|amount)[:\s]*\$?([\d,]+\.?\d*)/i)
      : null,
    nextPaymentDue: extractDateValue(text, /(?:next\s*)?payment\s*due(?:\s*date)?[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i),
    maturityDate: extractDateValue(text, /(?:maturity|payoff)\s*date[:\s]*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i),
  }

  // Create transaction for the monthly payment
  const transactions: ParsedTransaction[] = []
  if (mortgageLoan.monthlyPayment !== null) {
    const label = type === 'student_loan' ? 'Student Loan Payment' : 'Mortgage Payment'
    transactions.push({
      date: mortgageLoan.nextPaymentDue ?? '',
      description: `${lender ?? label} — Monthly Payment`,
      amount: -(mortgageLoan.monthlyPayment),
      category: type === 'student_loan' ? 'Student Loan' : 'Mortgage',
      raw: '',
    })

    // Sub-transactions for principal/interest/escrow breakdown
    if (mortgageLoan.principalPortion !== null) {
      transactions.push({
        date: mortgageLoan.nextPaymentDue ?? '',
        description: '  Principal',
        amount: -(mortgageLoan.principalPortion),
        category: type === 'student_loan' ? 'Student Loan - Principal' : 'Mortgage - Principal',
        raw: '',
      })
    }
    if (mortgageLoan.interestPortion !== null) {
      transactions.push({
        date: mortgageLoan.nextPaymentDue ?? '',
        description: '  Interest',
        amount: -(mortgageLoan.interestPortion),
        category: type === 'student_loan' ? 'Student Loan - Interest' : 'Mortgage - Interest',
        raw: '',
      })
    }
    if (mortgageLoan.escrowPortion !== null) {
      transactions.push({
        date: mortgageLoan.nextPaymentDue ?? '',
        description: '  Escrow (Tax & Insurance)',
        amount: -(mortgageLoan.escrowPortion),
        category: 'Mortgage - Escrow',
        raw: '',
      })
    }
  }

  const totalDebits = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)

  return {
    statementType: type,
    transactions,
    startDate: null,
    endDate: null,
    openingBalance: mortgageLoan.principalBalance,
    closingBalance: null,
    totalDebits: round2(totalDebits),
    totalCredits: 0,
    pageCount,
    bankName: lender,
    mortgageLoan,
  }
}

// ─── HELPER: empty result ─────────────────────────────────────────────────

function emptyStatementSummary(type: StatementType, pageCount: number): StatementSummary {
  return {
    statementType: type,
    transactions: [],
    startDate: null,
    endDate: null,
    openingBalance: null,
    closingBalance: null,
    totalDebits: 0,
    totalCredits: 0,
    pageCount,
    bankName: null,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── VALUE EXTRACTORS ─────────────────────────────────────────────────────

function extractDollarValue(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern)
  if (!match || !match[1]) return null
  const cleaned = match[1].replace(/,/g, '')
  const val = parseFloat(cleaned)
  return isNaN(val) ? null : val
}

function extractPercentValue(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern)
  if (!match || !match[1]) return null
  const val = parseFloat(match[1])
  return isNaN(val) ? null : val
}

function extractDateValue(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern)
  return match ? match[1] : null
}

function extractTransactions(lines: string[]): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = []

  for (const line of lines) {
    // Skip header/footer lines
    if (BALANCE_KEYWORDS.test(line)) continue
    if (line.length < 10) continue

    // Look for lines starting with a date
    const dateMatch = line.match(DATE_PATTERN)
    if (!dateMatch) continue

    // Extract amounts from the line
    const amounts = [...line.matchAll(AMOUNT_PATTERN)].map(m => {
      const cleaned = m[0].replace(/[$,]/g, '').replace('−', '-')
      return parseFloat(cleaned)
    })

    if (amounts.length === 0) continue

    // Description is everything between date and first amount
    const dateEnd = dateMatch[0].length
    const amountStr = line.match(AMOUNT_PATTERN)?.[0] ?? ''
    const amountStart = line.indexOf(amountStr)
    const description = line
      .substring(dateEnd, amountStart > dateEnd ? amountStart : undefined)
      .trim()
      .replace(/\s+/g, ' ')

    // Last amount is usually the balance, second-to-last is the transaction amount
    const amount = amounts.length >= 2 ? amounts[0] : amounts[0]
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1] : undefined

    const transaction: ParsedTransaction = {
      date: dateMatch[1],
      description,
      amount,
      balance,
      category: categorizeVendor(description),
      raw: line,
    }

    transactions.push(transaction)
  }

  return transactions
}

function extractBalance(lines: string[], type: 'opening' | 'closing'): number | null {
  const patterns = type === 'opening'
    ? [/(?:beginning|opening|starting)\s*balance/i]
    : [/(?:ending|closing|available)\s*balance/i]

  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        const amounts = [...line.matchAll(AMOUNT_PATTERN)].map(m =>
          parseFloat(m[0].replace(/[$,]/g, '').replace('−', '-'))
        )
        if (amounts.length > 0) return amounts[amounts.length - 1]
      }
    }
  }
  return null
}

function detectBankName(lines: string[]): string | null {
  const bankPatterns: [RegExp, string][] = [
    [/chase/i, 'Chase'],
    [/bank of america|bofa/i, 'Bank of America'],
    [/wells\s*fargo/i, 'Wells Fargo'],
    [/citi\s*bank/i, 'Citibank'],
    [/capital\s*one/i, 'Capital One'],
    [/td\s*bank/i, 'TD Bank'],
    [/pnc/i, 'PNC'],
    [/us\s*bank/i, 'US Bank'],
    [/regions/i, 'Regions'],
    [/fifth\s*third/i, 'Fifth Third'],
    [/huntington/i, 'Huntington'],
    [/key\s*bank/i, 'KeyBank'],
    [/american\s*express|amex/i, 'American Express'],
  ]

  for (const line of lines) {
    for (const [pattern, name] of bankPatterns) {
      if (pattern.test(line)) return name
    }
  }
  return null
}

/** Auto-categorize common vendors for QuickBooks export */
export function categorizeVendor(description: string): string {
  const lower = description.toLowerCase()

  const categories: [RegExp, string][] = [
    [/amazon|amzn/i, 'Office Supplies'],
    [/costco|sam'?s club/i, 'Supplies'],
    [/uber|lyft|taxi/i, 'Transportation'],
    [/delta|united|american air|southwest|jetblue/i, 'Travel'],
    [/marriott|hilton|hyatt|airbnb|hotel/i, 'Travel - Lodging'],
    [/comcast|verizon|at&t|t-mobile|spectrum/i, 'Utilities - Telecom'],
    [/electric|gas|water|utility|pge|con\s*ed/i, 'Utilities'],
    [/adp|gusto|paychex|payroll/i, 'Payroll'],
    [/stripe|square|paypal|venmo/i, 'Payment Processing'],
    [/google|meta|facebook|bing|ads/i, 'Advertising'],
    [/quickbooks|xero|freshbooks/i, 'Software - Accounting'],
    [/slack|zoom|microsoft|adobe|dropbox/i, 'Software - SaaS'],
    [/insurance|geico|state farm|allstate/i, 'Insurance'],
    [/rent|lease|property/i, 'Rent'],
    [/staples|office\s*depot/i, 'Office Supplies'],
    [/usps|fedex|ups|dhl/i, 'Shipping'],
    [/starbucks|dunkin|restaurant|cafe|grubhub|doordash/i, 'Meals & Entertainment'],
  ]

  for (const [pattern, category] of categories) {
    if (pattern.test(lower)) return category
  }

  return 'Uncategorized'
}

/** Export parsed transactions as a pre-categorized CSV for QuickBooks */
export function exportTransactionsCSV(
  transactions: ParsedTransaction[],
  businessName: string,
  period: string,
): void {
  const headers = ['Date', 'Description', 'Amount', 'Category', 'Balance']
  const rows = transactions.map(t => [
    t.date,
    csvEscape(t.description),
    t.amount.toFixed(2),
    t.category ?? 'Uncategorized',
    t.balance?.toFixed(2) ?? '',
  ])

  const csvLines = [
    `# ${businessName} — Parsed Bank Transactions — ${period}`,
    `# Auto-categorized by BookDrop on ${new Date().toLocaleDateString('en-US')}`,
    '',
    headers.join(','),
    ...rows.map(r => r.join(',')),
    '',
    `# Total Debits: ${transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0).toFixed(2)}`,
    `# Total Credits: ${transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0).toFixed(2)}`,
  ]

  const csv = csvLines.join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${businessName.replace(/\s+/g, '_')}_transactions_${period}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// ─── STATEMENT TYPE LABELS (for UI) ───────────────────────────────────────

export const STATEMENT_TYPE_LABELS: Record<StatementType, string> = {
  bank: 'Bank Statement',
  credit_card: 'Credit Card Statement',
  payroll: 'Payroll Report',
  utility: 'Utility Bill',
  mortgage: 'Mortgage Statement',
  student_loan: 'Student Loan Statement',
  unknown: 'Financial Document',
}

export const STATEMENT_TYPE_ICONS: Record<StatementType, string> = {
  bank: '🏦',
  credit_card: '💳',
  payroll: '📋',
  utility: '⚡',
  mortgage: '🏠',
  student_loan: '🎓',
  unknown: '📄',
}
