// parse-statement-from-lines.ts — pure bank/CC line parser (Node + browser).
// No PDF.js. Used after text extraction (browser PDF.js or server pdf extract).

export interface LineParsedTransaction {
  date: string
  description: string
  amount: number
  balance?: number
  category?: string
  raw: string
}

export interface LineStatementSummary {
  statementType: 'bank'
  transactions: LineParsedTransaction[]
  startDate: string | null
  endDate: string | null
  openingBalance: number | null
  closingBalance: number | null
  totalDebits: number
  totalCredits: number
  pageCount: number
  bankName: string | null
}

const DATE_PATTERN = /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/
const AMOUNT_PATTERN = /[-−]?\$?\d{1,3}(?:,\d{3})*\.\d{2}/g
const BALANCE_KEYWORDS = /(?:beginning|opening|starting|ending|closing|available)\s*balance/i

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function categorizeVendorLite(description: string): string {
  const d = description.toLowerCase()
  if (/aws|amazon web|google cloud|microsoft|adobe|github|slack|zoom|notion/.test(d)) {
    return 'Software'
  }
  if (/office depot|staples|amazon|costco|walmart/.test(d)) return 'Office Supplies'
  if (/uber|lyft|delta|united|southwest|marriott|hilton/.test(d)) return 'Travel'
  if (/starbucks|mcdonald|restaurant|cafe|doordash|grubhub/.test(d)) return 'Meals'
  if (/att|verizon|comcast|utility|electric|gas|water/.test(d)) return 'Utilities'
  return 'Uncategorized'
}

function extractBalance(lines: string[], type: 'opening' | 'closing'): number | null {
  const patterns =
    type === 'opening'
      ? [/(?:beginning|opening|starting)\s*balance/i]
      : [/(?:ending|closing|available)\s*balance/i]

  for (const line of lines) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        const amounts = [...line.matchAll(AMOUNT_PATTERN)].map(m =>
          parseFloat(m[0].replace(/[$,]/g, '').replace('−', '-')),
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
    [/american\s*express|amex/i, 'American Express'],
  ]

  for (const line of lines.slice(0, 40)) {
    for (const [pattern, name] of bankPatterns) {
      if (pattern.test(line)) return name
    }
  }
  return null
}

function extractTransactions(lines: string[]): LineParsedTransaction[] {
  const transactions: LineParsedTransaction[] = []

  for (const line of lines) {
    if (BALANCE_KEYWORDS.test(line)) continue
    if (line.length < 10) continue

    const dateMatch = line.match(DATE_PATTERN)
    if (!dateMatch) continue

    const amounts = [...line.matchAll(AMOUNT_PATTERN)].map(m => {
      const cleaned = m[0].replace(/[$,]/g, '').replace('−', '-')
      return parseFloat(cleaned)
    })
    if (amounts.length === 0) continue

    const dateEnd = dateMatch[0].length
    const amountStr = line.match(AMOUNT_PATTERN)?.[0] ?? ''
    const amountStart = line.indexOf(amountStr)
    const description = line
      .substring(dateEnd, amountStart > dateEnd ? amountStart : undefined)
      .trim()
      .replace(/\s+/g, ' ')

    const amount = amounts[0]
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1] : undefined

    transactions.push({
      date: dateMatch[1],
      description,
      amount,
      balance,
      category: categorizeVendorLite(description),
      raw: line,
    })
  }

  return transactions
}

/**
 * Parse already-extracted statement text lines into a bank summary.
 * Never fabricates rows — empty/malformed input returns empty summary.
 */
export function parseStatementFromLines(
  lines: string[],
  pageCount = 0,
): LineStatementSummary {
  const cleaned = lines.map(l => l.trim()).filter(l => l.length > 0)
  if (cleaned.length === 0) {
    return {
      statementType: 'bank',
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

  const transactions = extractTransactions(cleaned)
  const openingBalance = extractBalance(cleaned, 'opening')
  const closingBalance = extractBalance(cleaned, 'closing')
  const bankName = detectBankName(cleaned)

  const totalDebits = transactions
    .filter(t => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalCredits = transactions
    .filter(t => t.amount >= 0)
    .reduce((s, t) => s + t.amount, 0)
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

export function isPdfFilename(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf')
}
