// parse-csv-statement.ts — pure CSV bank export parser (Node + browser).
// No PDF.js, no File API required. Used by browser upload path and server prep.

export interface CsvParsedTransaction {
  date: string
  description: string
  amount: number
  balance?: number
  category?: string
  raw: string
}

export interface CsvStatementSummary {
  statementType: 'bank'
  transactions: CsvParsedTransaction[]
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Lightweight vendor categorize for CSV path (subset of full engine). */
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

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

function emptyCsvSummary(): CsvStatementSummary {
  return {
    statementType: 'bank',
    transactions: [],
    startDate: null,
    endDate: null,
    openingBalance: null,
    closingBalance: null,
    totalDebits: 0,
    totalCredits: 0,
    pageCount: 0,
    bankName: null,
  }
}

/**
 * Parse bank/credit-card CSV text into transactions.
 * Never fabricates rows — empty/malformed input returns empty summary.
 */
export function parseCSVText(text: string): CsvStatementSummary {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)

  if (lines.length < 2) {
    return emptyCsvSummary()
  }

  const headerLine = lines[0].toLowerCase()
  const hasHeader =
    headerLine.includes('date') ||
    headerLine.includes('description') ||
    headerLine.includes('amount')
  const dataLines = hasHeader ? lines.slice(1) : lines

  const transactions: CsvParsedTransaction[] = []

  for (const line of dataLines) {
    const fields = parseCSVLine(line)
    if (fields.length < 2) continue

    const dateIdx = fields.findIndex(
      f => DATE_PATTERN.test(f.trim()) || /^\d{4}-\d{2}-\d{2}/.test(f.trim()),
    )
    if (dateIdx === -1) continue

    const amountFields = fields
      .map((f, i) => ({
        idx: i,
        val: f.trim().replace(/[$,]/g, '').replace('−', '-'),
      }))
      .filter(f => f.idx !== dateIdx && /^-?\d+(\.\d{2})?$/.test(f.val))

    if (amountFields.length === 0) continue

    const descIdx = fields.findIndex(
      (f, i) =>
        i !== dateIdx &&
        !amountFields.some(a => a.idx === i) &&
        f.trim().length > 0 &&
        !/^\d+(\.\d{2})?$/.test(f.trim().replace(/[$,]/g, '')),
    )

    const date = fields[dateIdx].trim()
    const description = descIdx >= 0 ? fields[descIdx].trim() : ''
    const amount = parseFloat(amountFields[0].val)

    if (isNaN(amount)) continue

    transactions.push({
      date,
      description,
      amount,
      category: categorizeVendorLite(description),
      raw: line,
    })
  }

  const totalDebits = transactions
    .filter(t => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalCredits = transactions
    .filter(t => t.amount > 0)
    .reduce((s, t) => s + t.amount, 0)
  const dates = transactions.map(t => t.date).filter(Boolean)

  return {
    statementType: 'bank',
    transactions,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    openingBalance: null,
    closingBalance: null,
    totalDebits: round2(totalDebits),
    totalCredits: round2(totalCredits),
    pageCount: 0,
    bankName: null,
  }
}

export function isCsvFilename(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.csv') || lower.endsWith('.qbo') || lower.endsWith('.txt')
}
