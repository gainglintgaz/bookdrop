/**
 * QuickBooks-compatible export formats for BookDrop.
 *
 * Replaces manual data entry into accounting software that bookkeepers
 * spend hours on. Supports IIF, QBO CSV, Xero CSV, Journal Entries, and OFX.
 */

// ---------------------------------------------------------------------------
// Shared types & helpers
// ---------------------------------------------------------------------------

interface Transaction {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  category?: string
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Sanitise a business name for use in filenames. */
function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
}

/** Return current YYYY_MM for filename suffixes. */
function dateSuffix(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}_${m}`
}

/** Parse a date string into a Date object (accepts ISO, MM/DD/YYYY, etc.). */
function parseDate(raw: string): Date {
  const d = new Date(raw)
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${raw}`)
  }
  return d
}

/** Format date as MM/DD/YYYY (US-style, used by QuickBooks). */
function formatDateUS(raw: string): string {
  const d = parseDate(raw)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

/** Format date as DD/MM/YYYY (used by Xero). */
function formatDateXero(raw: string): string {
  const d = parseDate(raw)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Format date as YYYYMMDDHHMMSS for OFX. */
function formatDateOFX(raw: string): string {
  const d = parseDate(raw)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}120000`
}

/** Map a category string to a QuickBooks chart-of-accounts name. */
function mapCategoryToQBAccount(category: string | undefined, type: 'credit' | 'debit'): string {
  if (!category) {
    return type === 'debit' ? 'Expenses' : 'Income'
  }

  const lower = category.toLowerCase()
  const mapping: Record<string, string> = {
    rent: 'Rent Expense',
    utilities: 'Utilities',
    payroll: 'Payroll Expenses',
    supplies: 'Office Supplies',
    travel: 'Travel Expense',
    meals: 'Meals and Entertainment',
    insurance: 'Insurance Expense',
    advertising: 'Advertising',
    professional: 'Professional Fees',
    bank: 'Bank Charges',
    income: 'Income',
    sales: 'Sales',
    services: 'Service Revenue',
    interest: 'Interest Income',
    refund: 'Refunds',
  }

  for (const [key, value] of Object.entries(mapping)) {
    if (lower.includes(key)) return value
  }

  return type === 'debit' ? 'Miscellaneous Expense' : 'Other Income'
}

/** Format a number to exactly 2 decimal places. */
function amt(n: number): string {
  return n.toFixed(2)
}

/** Simple pseudo-unique ID for OFX FITIDs. */
function generateFitId(index: number, dateStr: string): string {
  const d = parseDate(dateStr)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(index).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// QuickBooks IIF (Intuit Interchange Format)
// ---------------------------------------------------------------------------

export function exportQuickBooksIIF(
  transactions: Transaction[],
  businessName: string,
  accountName?: string,
): void {
  const account = accountName ?? 'Checking'
  const TAB = '\t'
  const lines: string[] = []

  // Header rows — define column names for TRNS and SPL rows
  lines.push(['!TRNS', 'TRNSID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'MEMO'].join(TAB))
  lines.push(['!SPL', 'SPLID', 'TRNSTYPE', 'DATE', 'ACCNT', 'NAME', 'AMOUNT', 'MEMO'].join(TAB))
  lines.push('!ENDTRNS')

  transactions.forEach((tx, idx) => {
    const date = formatDateUS(tx.date)
    const signedAmount = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount)
    const offsetAccount = mapCategoryToQBAccount(tx.category, tx.type)
    const id = String(idx + 1)

    // TRNS line — the bank/primary account side
    lines.push(
      ['TRNS', id, 'GENERAL JOURNAL', date, account, '', amt(signedAmount), tx.description].join(TAB),
    )

    // SPL line — the offset/category account side (opposite sign)
    lines.push(
      ['SPL', id, 'GENERAL JOURNAL', date, offsetAccount, '', amt(-signedAmount), tx.description].join(TAB),
    )

    lines.push('ENDTRNS')
  })

  const content = lines.join('\r\n') + '\r\n'
  const filename = `${safeFilename(businessName)}_quickbooks_${dateSuffix()}.iif`
  downloadFile(content, filename, 'application/x-iif')
}

// ---------------------------------------------------------------------------
// QuickBooks Online CSV
// ---------------------------------------------------------------------------

export function exportQBOCSV(
  transactions: Transaction[],
  businessName: string,
): void {
  const lines: string[] = []

  // QBO expects: Date, Description, Amount (negative = expense)
  lines.push('Date,Description,Amount')

  for (const tx of transactions) {
    const date = formatDateUS(tx.date)
    const amount = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount)
    // Escape description for CSV
    const desc = tx.description.includes(',') || tx.description.includes('"')
      ? `"${tx.description.replace(/"/g, '""')}"`
      : tx.description
    lines.push(`${date},${desc},${amt(amount)}`)
  }

  const content = lines.join('\r\n') + '\r\n'
  const filename = `${safeFilename(businessName)}_qbo_${dateSuffix()}.csv`
  downloadFile(content, filename, 'text/csv')
}

// ---------------------------------------------------------------------------
// Xero CSV
// ---------------------------------------------------------------------------

export function exportXeroCSV(
  transactions: Transaction[],
  businessName: string,
): void {
  const lines: string[] = []

  // Xero expects: *Date, *Amount, Description, Reference, Payee
  lines.push('*Date,*Amount,Description,Reference,Payee')

  for (const tx of transactions) {
    const date = formatDateXero(tx.date)
    const amount = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount)
    const desc = tx.description.includes(',') || tx.description.includes('"')
      ? `"${tx.description.replace(/"/g, '""')}"`
      : tx.description
    const reference = tx.category ?? ''
    lines.push(`${date},${amt(amount)},${desc},${reference},`)
  }

  const content = lines.join('\r\n') + '\r\n'
  const filename = `${safeFilename(businessName)}_xero_${dateSuffix()}.csv`
  downloadFile(content, filename, 'text/csv')
}

// ---------------------------------------------------------------------------
// Generic Journal Entries (double-entry)
// ---------------------------------------------------------------------------

export function exportJournalEntries(
  transactions: Transaction[],
  businessName: string,
): void {
  const lines: string[] = []

  lines.push('Date,Account,Debit,Credit,Memo')

  for (const tx of transactions) {
    const date = formatDateUS(tx.date)
    const absAmount = Math.abs(tx.amount)
    const offsetAccount = mapCategoryToQBAccount(tx.category, tx.type)
    const memo = tx.description.includes(',') || tx.description.includes('"')
      ? `"${tx.description.replace(/"/g, '""')}"`
      : tx.description

    if (tx.type === 'debit') {
      // Debit the expense account, credit the bank
      lines.push(`${date},${offsetAccount},${amt(absAmount)},,${memo}`)
      lines.push(`${date},Checking,,${amt(absAmount)},${memo}`)
    } else {
      // Debit the bank, credit the income account
      lines.push(`${date},Checking,${amt(absAmount)},,${memo}`)
      lines.push(`${date},${offsetAccount},,${amt(absAmount)},${memo}`)
    }
  }

  const content = lines.join('\r\n') + '\r\n'
  const filename = `${safeFilename(businessName)}_journal_${dateSuffix()}.csv`
  downloadFile(content, filename, 'text/csv')
}

// ---------------------------------------------------------------------------
// OFX (Open Financial Exchange)
// ---------------------------------------------------------------------------

export function exportOFX(
  transactions: Array<{ date: string; description: string; amount: number; type: 'credit' | 'debit' }>,
  accountName: string,
  businessName: string,
): void {
  const now = new Date()
  const dtServer = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}120000`

  // Find date range for the statement
  let minDate = now
  let maxDate = new Date(0)
  for (const tx of transactions) {
    const d = parseDate(tx.date)
    if (d < minDate) minDate = d
    if (d > maxDate) maxDate = d
  }

  const dtStart = formatDateOFX(minDate.toISOString())
  const dtEnd = formatDateOFX(maxDate.toISOString())

  const stmtTrns = transactions.map((tx, i) => {
    const signedAmount = tx.type === 'debit' ? -Math.abs(tx.amount) : Math.abs(tx.amount)
    const trnType = tx.type === 'debit' ? 'DEBIT' : 'CREDIT'
    const dtPosted = formatDateOFX(tx.date)
    const fitId = generateFitId(i, tx.date)

    return `<STMTTRN>
<TRNTYPE>${trnType}
<DTPOSTED>${dtPosted}
<TRNAMT>${amt(signedAmount)}
<FITID>${fitId}
<NAME>${tx.description}
</STMTTRN>`
  }).join('\n')

  // OFX uses SGML (not XML) for v1 — no closing tags, which is correct per spec
  const content = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${dtServer}
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>0
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>000000000
<ACCTID>${accountName}
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${dtStart}
<DTEND>${dtEnd}
${stmtTrns}
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>0.00
<DTASOF>${dtServer}
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`

  const filename = `${safeFilename(businessName)}_${safeFilename(accountName)}_${dateSuffix()}.ofx`
  downloadFile(content, filename, 'application/x-ofx')
}
