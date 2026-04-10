// src/lib/reconciliation.ts
// Smart receipt-to-bank-transaction matching engine.
// Runs entirely in the browser — no API calls, no data leaves the device.
//
// Matching strategy (3 signals combined into a score):
//   1. Amount match (within $1 tolerance, exact penny = bonus)
//   2. Date proximity (within 3 days, same day = bonus)
//   3. Vendor fuzzy match (alias dictionary + substring + Levenshtein)
// Also detects recurring transactions and supports split matching.

import type { ParsedTransaction, StatementSummary } from './parse-bank-statement'
import type { RequirementWithUploads } from '@/types'

export interface ReceiptRecord {
  id: string
  filename: string
  amount: number
  date: string
  vendor: string
  category?: string
}

export interface ReconciliationMatch {
  transaction: ParsedTransaction
  receipt: ReceiptRecord | ReceiptRecord[]  // array for split matches
  confidence: 'high' | 'medium' | 'low'
  amountDiff: number
  daysDiff: number
  matchType: 'exact' | 'fuzzy' | 'split' | 'recurring'
  vendorScore: number
}

export interface RecurringPattern {
  description: string
  amount: number
  dayOfMonth: number
  occurrences: number
  category?: string
}

export interface ReconciliationResult {
  matchRate: number
  matched: ReconciliationMatch[]
  unmatchedTransactions: ParsedTransaction[]
  unmatchedReceipts: ReceiptRecord[]
  recurringPatterns: RecurringPattern[]
  totalTransactions: number
  totalReceipts: number
  recommendation: string
  estimatedHoursSaved: number
}

// ─── VENDOR ALIAS DICTIONARY ───────────────────────────────────────────────
// Maps bank statement descriptions to normalized vendor names.

const VENDOR_ALIASES: Record<string, string> = {
  'AMZN MKTP US': 'Amazon',
  'AMZN MKTP': 'Amazon',
  'AMAZON.COM': 'Amazon',
  'AMZ*': 'Amazon',
  'CHASE BANK': 'Chase',
  'CHASE CREDIT CRD': 'Chase',
  'COMCAST CABLE': 'Comcast',
  'COMCAST BUSINESS': 'Comcast',
  'XFINITY': 'Comcast',
  'GOOGLE *CLOUD': 'Google Cloud',
  'GOOGLE*GSUITE': 'Google Workspace',
  'GUSTO PAYROLL': 'Gusto',
  'INTUIT QUICKBOOKS': 'QuickBooks',
  'QBO*INTUIT': 'QuickBooks',
  'ADOBE *CREATIVE': 'Adobe',
  'ADOBE SYSTEMS': 'Adobe',
  'FEDEX OFFICE': 'FedEx',
  'FEDEX SHIPPING': 'FedEx',
  'UPS STORE': 'UPS',
  'USPS PO': 'USPS',
  'UBER TRIP': 'Uber',
  'UBER *EATS': 'Uber Eats',
  'LYFT *RIDE': 'Lyft',
  'STARBUCKS': 'Starbucks',
  'STAPLES': 'Staples',
  'OFFICE DEPOT': 'Office Depot',
  'ATT*BILL': 'AT&T',
  'VERIZON': 'Verizon',
  'T-MOBILE': 'T-Mobile',
  'STRIPE': 'Stripe',
  'SQUARE *': 'Square',
  'PAYPAL *': 'PayPal',
}

const AMOUNT_TOLERANCE = 1.00
const DATE_TOLERANCE_DAYS = 3
const SPLIT_TOLERANCE = 0.50       // combined receipts must be within $0.50
const RECURRING_MIN_OCCURRENCES = 2 // need at least 2 to flag as recurring

// ─── MAIN RECONCILIATION ───────────────────────────────────────────────────

export function reconcileTransactionsAndReceipts(
  transactions: ParsedTransaction[],
  receipts: ReceiptRecord[],
): ReconciliationResult {
  const debits = transactions.filter(t => t.amount < 0)

  const matched: ReconciliationMatch[] = []
  const usedReceiptIds = new Set<string>()
  const unmatchedTransactions: ParsedTransaction[] = []

  // Pass 1: Exact and fuzzy matches (amount + date + vendor)
  const sortedDebits = [...debits].sort((a, b) => a.amount - b.amount)

  for (const tx of sortedDebits) {
    const txAmount = Math.abs(tx.amount)
    const txDate = parseDate(tx.date)
    const txVendor = normalizeVendor(tx.description)

    let bestMatch: {
      receipt: ReceiptRecord
      amountDiff: number
      daysDiff: number
      vendorScore: number
      totalScore: number
    } | null = null

    for (const receipt of receipts) {
      if (usedReceiptIds.has(receipt.id)) continue

      const amountDiff = Math.abs(txAmount - receipt.amount)
      if (amountDiff > AMOUNT_TOLERANCE) continue

      const receiptDate = parseDate(receipt.date)
      const daysDiff = txDate && receiptDate
        ? Math.abs(daysBetween(txDate, receiptDate))
        : 999

      if (daysDiff > DATE_TOLERANCE_DAYS) continue

      const vendorScore = computeVendorScore(txVendor, receipt.vendor)

      // Weighted score: amount precision + date proximity + vendor match
      const amountScore = 1 - (amountDiff / AMOUNT_TOLERANCE) // 0-1
      const dateScore = 1 - (daysDiff / DATE_TOLERANCE_DAYS)   // 0-1
      const totalScore = amountScore * 2 + dateScore + vendorScore * 1.5

      if (!bestMatch || totalScore > bestMatch.totalScore) {
        bestMatch = { receipt, amountDiff, daysDiff, vendorScore, totalScore }
      }
    }

    if (bestMatch) {
      const confidence = getConfidence(bestMatch.amountDiff, bestMatch.daysDiff, bestMatch.vendorScore)
      matched.push({
        transaction: tx,
        receipt: bestMatch.receipt,
        confidence,
        amountDiff: bestMatch.amountDiff,
        daysDiff: bestMatch.daysDiff,
        matchType: bestMatch.vendorScore > 0.7 ? 'exact' : 'fuzzy',
        vendorScore: bestMatch.vendorScore,
      })
      usedReceiptIds.add(bestMatch.receipt.id)
    } else {
      unmatchedTransactions.push(tx)
    }
  }

  // Pass 2: Split transaction matching
  // Try to match unmatched transactions against combinations of 2 receipts
  const stillUnmatched: ParsedTransaction[] = []
  const availableReceipts = receipts.filter(r => !usedReceiptIds.has(r.id))

  for (const tx of unmatchedTransactions) {
    const txAmount = Math.abs(tx.amount)
    const txDate = parseDate(tx.date)
    let splitFound = false

    for (let i = 0; i < availableReceipts.length && !splitFound; i++) {
      if (usedReceiptIds.has(availableReceipts[i].id)) continue
      for (let j = i + 1; j < availableReceipts.length && !splitFound; j++) {
        if (usedReceiptIds.has(availableReceipts[j].id)) continue

        const r1 = availableReceipts[i]
        const r2 = availableReceipts[j]
        const combinedAmount = r1.amount + r2.amount
        const amountDiff = Math.abs(txAmount - combinedAmount)

        if (amountDiff > SPLIT_TOLERANCE) continue

        // Check date proximity for at least one receipt
        const d1 = parseDate(r1.date)
        const d2 = parseDate(r2.date)
        const daysDiff1 = txDate && d1 ? Math.abs(daysBetween(txDate, d1)) : 999
        const daysDiff2 = txDate && d2 ? Math.abs(daysBetween(txDate, d2)) : 999

        if (Math.min(daysDiff1, daysDiff2) <= DATE_TOLERANCE_DAYS) {
          matched.push({
            transaction: tx,
            receipt: [r1, r2],
            confidence: 'medium',
            amountDiff,
            daysDiff: Math.min(daysDiff1, daysDiff2),
            matchType: 'split',
            vendorScore: 0,
          })
          usedReceiptIds.add(r1.id)
          usedReceiptIds.add(r2.id)
          splitFound = true
        }
      }
    }

    if (!splitFound) {
      stillUnmatched.push(tx)
    }
  }

  // Detect recurring patterns
  const recurringPatterns = detectRecurringPatterns(transactions)

  const unmatchedReceipts = receipts.filter(r => !usedReceiptIds.has(r.id))

  const matchRate = debits.length > 0
    ? Math.round((matched.length / debits.length) * 100)
    : 0

  // Estimate hours saved: 2 min per match, 1 min per recurring auto-flag
  const minutesSaved = matched.length * 2 + recurringPatterns.length * 1
  const estimatedHoursSaved = Math.round((minutesSaved / 60) * 10) / 10

  return {
    matchRate,
    matched,
    unmatchedTransactions: stillUnmatched,
    unmatchedReceipts,
    recurringPatterns,
    totalTransactions: transactions.length,
    totalReceipts: receipts.length,
    recommendation: getRecommendation(matchRate, stillUnmatched.length, unmatchedReceipts.length, recurringPatterns.length),
    estimatedHoursSaved,
  }
}

// ─── VENDOR MATCHING ───────────────────────────────────────────────────────

function normalizeVendor(description: string): string {
  const upper = description.toUpperCase().trim()

  // Check alias dictionary
  for (const [pattern, normalized] of Object.entries(VENDOR_ALIASES)) {
    if (upper.includes(pattern.toUpperCase())) return normalized
  }

  // Strip common bank suffixes
  return upper
    .replace(/\s*(#\d+|POS|DEBIT|PURCHASE|CARD|TRANSACTION|ACH|ONLINE)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function computeVendorScore(bankVendor: string, receiptVendor: string): number {
  if (!bankVendor || !receiptVendor) return 0

  const a = bankVendor.toLowerCase()
  const b = receiptVendor.toLowerCase()

  // Exact match
  if (a === b) return 1.0

  // Substring containment
  if (a.includes(b) || b.includes(a)) return 0.85

  // Levenshtein similarity
  const distance = levenshteinDistance(a, b)
  const maxLen = Math.max(a.length, b.length)
  const similarity = 1 - distance / maxLen

  return similarity > 0.6 ? similarity : 0
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length

  // Optimize for common cases
  if (m === 0) return n
  if (n === 0) return m
  if (a === b) return 0

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }

  return dp[m][n]
}

// ─── RECURRING DETECTION ───────────────────────────────────────────────────

function detectRecurringPatterns(transactions: ParsedTransaction[]): RecurringPattern[] {
  // Group by normalized vendor + similar amount
  const groups = new Map<string, ParsedTransaction[]>()

  for (const tx of transactions) {
    if (tx.amount >= 0) continue // only expenses
    const vendor = normalizeVendor(tx.description)
    const amountBucket = Math.round(Math.abs(tx.amount) * 100) // cents for exact grouping
    const key = `${vendor}|${amountBucket}`

    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }

  const patterns: RecurringPattern[] = []

  for (const [, txns] of groups) {
    if (txns.length < RECURRING_MIN_OCCURRENCES) continue

    // Check if they fall on roughly the same day of month
    const days = txns.map(t => {
      const d = parseDate(t.date)
      return d ? d.getDate() : 0
    }).filter(d => d > 0)

    if (days.length < RECURRING_MIN_OCCURRENCES) continue

    // Allow ±2 day variance for "same day of month"
    const avgDay = Math.round(days.reduce((s, d) => s + d, 0) / days.length)
    const allClose = days.every(d => Math.abs(d - avgDay) <= 2)

    if (allClose) {
      patterns.push({
        description: txns[0].description,
        amount: Math.abs(txns[0].amount),
        dayOfMonth: avgDay,
        occurrences: txns.length,
        category: txns[0].category,
      })
    }
  }

  return patterns.sort((a, b) => b.amount - a.amount) // largest first
}

// ─── CONFIDENCE + RECOMMENDATION ───────────────────────────────────────────

function getConfidence(amountDiff: number, daysDiff: number, vendorScore: number): 'high' | 'medium' | 'low' {
  if (amountDiff <= 0.01 && daysDiff <= 0 && vendorScore >= 0.8) return 'high'
  if (amountDiff <= 0.01 && daysDiff <= 1) return 'high'
  if (amountDiff <= 0.10 && vendorScore >= 0.5) return 'medium'
  if (amountDiff <= 0.50) return 'medium'
  return 'low'
}

function getRecommendation(matchRate: number, unmatchedTx: number, unmatchedReceipts: number, recurringCount: number): string {
  const parts: string[] = []

  if (matchRate >= 95) {
    parts.push('Excellent — nearly all transactions matched. Ready for bookkeeper review.')
  } else if (matchRate >= 80) {
    parts.push(`Good match rate. ${unmatchedTx} transaction(s) need manual review.`)
  } else if (matchRate >= 50) {
    parts.push(`Partial match. ${unmatchedTx} unmatched transaction(s) and ${unmatchedReceipts} unmatched receipt(s).`)
  } else if (matchRate > 0) {
    parts.push('Low match rate — check that receipt amounts and dates are correct.')
  } else {
    parts.push('No matches found. Upload receipts with amounts and dates that match your bank transactions.')
  }

  if (recurringCount > 0) {
    parts.push(`${recurringCount} recurring expense(s) detected — these can be auto-categorized each month.`)
  }

  return parts.join(' ')
}

// ─── RECONCILE FROM PARSED STATEMENTS ──────────────────────────────────────
// Wire real parsed data into the reconciliation engine.
// Bank/CC statements provide transactions, receipt uploads provide receipts.

export function reconcileFromParsedStatements(
  parsedStatements: StatementSummary[],
  requirements: RequirementWithUploads[],
): ReconciliationResult | null {
  // Extract all transactions from parsed bank + credit card statements
  const allTransactions: ParsedTransaction[] = []
  for (const stmt of parsedStatements) {
    if (stmt.statementType === 'bank' || stmt.statementType === 'credit_card') {
      allTransactions.push(...stmt.transactions)
    }
  }

  if (allTransactions.length === 0) return null

  // Build receipt records from receipt-type uploads
  // Each receipt upload becomes a ReceiptRecord with the info we can extract
  const receipts: ReceiptRecord[] = []
  const receiptReqs = requirements.filter(r => r.doc_type === 'receipt')

  for (const req of receiptReqs) {
    for (const upload of req.uploads) {
      // Create a receipt record from the upload metadata
      receipts.push({
        id: upload.id,
        filename: upload.filename_original,
        amount: 0, // Unknown without OCR on the receipt image
        date: new Date(upload.uploaded_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }),
        vendor: upload.filename_original.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
      })
    }
  }

  // If we have transactions but no receipts, still run reconciliation
  // to get recurring patterns and unmatched transaction list
  return reconcileTransactionsAndReceipts(allTransactions, receipts)
}

// ─── DEMO DATA ─────────────────────────────────────────────────────────────

export function getDemoReconciliation(): ReconciliationResult {
  const demoTransactions: ParsedTransaction[] = [
    { date: '03/02', description: 'STAPLES OFFICE SUPPLIES', amount: -47.82, category: 'Office Supplies', raw: '' },
    { date: '03/03', description: 'COMCAST BUSINESS', amount: -189.00, category: 'Utilities - Telecom', raw: '' },
    { date: '03/05', description: 'AMZN MKTP US', amount: -234.56, category: 'Office Supplies', raw: '' },
    { date: '03/08', description: 'GUSTO PAYROLL', amount: -4500.00, category: 'Payroll', raw: '' },
    { date: '03/10', description: 'UBER TRIP', amount: -32.40, category: 'Transportation', raw: '' },
    { date: '03/12', description: 'FEDEX SHIPPING', amount: -18.95, category: 'Shipping', raw: '' },
    { date: '03/15', description: 'DEPOSIT - CLIENT PAYMENT', amount: 8500.00, raw: '' },
    { date: '03/18', description: 'CHASE INK CARD PAYMENT', amount: -523.41, raw: '' },
    { date: '03/20', description: 'STARBUCKS', amount: -12.85, category: 'Meals & Entertainment', raw: '' },
    { date: '03/25', description: 'ADOBE SYSTEMS', amount: -54.99, category: 'Software - SaaS', raw: '' },
    // Recurring from previous month (for detection)
    { date: '04/03', description: 'COMCAST BUSINESS', amount: -189.00, category: 'Utilities - Telecom', raw: '' },
    { date: '04/08', description: 'GUSTO PAYROLL', amount: -4500.00, category: 'Payroll', raw: '' },
    { date: '04/25', description: 'ADOBE SYSTEMS', amount: -54.99, category: 'Software - SaaS', raw: '' },
  ]

  const demoReceipts: ReceiptRecord[] = [
    { id: 'r1', filename: 'staples_receipt.jpg', amount: 47.82, date: '03/02', vendor: 'Staples' },
    { id: 'r2', filename: 'comcast_bill.pdf', amount: 189.00, date: '03/01', vendor: 'Comcast' },
    { id: 'r3', filename: 'amazon_order.pdf', amount: 234.56, date: '03/05', vendor: 'Amazon' },
    { id: 'r4', filename: 'gusto_payroll_mar.pdf', amount: 4500.00, date: '03/08', vendor: 'Gusto' },
    { id: 'r5', filename: 'uber_receipt.png', amount: 32.40, date: '03/10', vendor: 'Uber' },
    { id: 'r6', filename: 'fedex_receipt.pdf', amount: 18.95, date: '03/12', vendor: 'FedEx' },
    { id: 'r7', filename: 'adobe_invoice.pdf', amount: 54.99, date: '03/25', vendor: 'Adobe' },
    // Split scenario: two receipts that add up to Chase card payment
    { id: 'r8', filename: 'office_supplies_mar.pdf', amount: 300.00, date: '03/16', vendor: 'Various' },
    { id: 'r9', filename: 'client_dinner_mar.pdf', amount: 223.41, date: '03/17', vendor: 'Restaurant' },
  ]

  return reconcileTransactionsAndReceipts(demoTransactions, demoReceipts)
}

// ─── DATE HELPERS ──────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length < 2) return null

  const month = parseInt(parts[0], 10) - 1
  const day = parseInt(parts[1], 10)
  const year = parts[2]
    ? parseInt(parts[2], 10) + (parseInt(parts[2], 10) < 100 ? 2000 : 0)
    : new Date().getFullYear()

  const date = new Date(year, month, day)
  return isNaN(date.getTime()) ? null : date
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000
  return Math.round((a.getTime() - b.getTime()) / msPerDay)
}
