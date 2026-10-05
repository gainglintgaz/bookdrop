// src/lib/insights.ts
// Smart insights engine — analyzes parsed statements to produce
// spending breakdowns, vendor analysis, cash flow, anomalies, and advice.

import type { StatementSummary, ParsedTransaction } from './parse-bank-statement'

// ─── OUTPUT TYPES ────────────────────────────────────────────────────────────

export interface SpendingCategory {
  category: string
  total: number
  count: number
  percentage: number
  transactions: ParsedTransaction[]
}

export interface VendorSummary {
  name: string
  total: number
  count: number
  avgAmount: number
  isRecurring: boolean
  category: string | undefined
}

export interface CashFlowSummary {
  totalIncome: number
  totalExpenses: number
  netCashFlow: number
  dailyAvgExpense: number
  largestExpense: ParsedTransaction | null
  largestDeposit: ParsedTransaction | null
}

export interface Anomaly {
  type: 'large_transaction' | 'unusual_vendor' | 'duplicate_suspect' | 'round_number' | 'weekend_transaction'
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
  transaction: ParsedTransaction
}

export interface SmartAdvice {
  id: string
  category: 'savings' | 'efficiency' | 'compliance' | 'risk'
  title: string
  description: string
  impact: 'low' | 'medium' | 'high'
}

export interface MonthlyInsights {
  period: string
  cashFlow: CashFlowSummary
  spendingByCategory: SpendingCategory[]
  topVendors: VendorSummary[]
  anomalies: Anomaly[]
  advice: SmartAdvice[]
  transactionCount: number
  statementCount: number
  daysCovered: number
}

// ─── MAIN FUNCTION ───────────────────────────────────────────────────────────

export function generateInsights(
  statements: StatementSummary[],
  year: number,
  month: number,
): MonthlyInsights {
  const allTransactions = statements.flatMap(s => s.transactions)
  const debits = allTransactions.filter(t => t.amount < 0)
  const credits = allTransactions.filter(t => t.amount > 0)

  const totalIncome = credits.reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = Math.abs(debits.reduce((sum, t) => sum + t.amount, 0))

  // Days covered (estimate from date range)
  const daysCovered = estimateDaysCovered(allTransactions, year, month)

  const cashFlow: CashFlowSummary = {
    totalIncome,
    totalExpenses,
    netCashFlow: totalIncome - totalExpenses,
    dailyAvgExpense: daysCovered > 0 ? totalExpenses / daysCovered : 0,
    largestExpense: debits.length > 0
      ? debits.reduce((max, t) => t.amount < max.amount ? t : max)
      : null,
    largestDeposit: credits.length > 0
      ? credits.reduce((max, t) => t.amount > max.amount ? t : max)
      : null,
  }

  const spendingByCategory = buildCategoryBreakdown(debits, totalExpenses)
  const topVendors = buildVendorSummary(debits)
  const anomalies = detectAnomalies(allTransactions, totalExpenses)
  const advice = generateAdvice(cashFlow, spendingByCategory, topVendors, anomalies)

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return {
    period: `${monthNames[month - 1]} ${year}`,
    cashFlow,
    spendingByCategory,
    topVendors: topVendors.slice(0, 15),
    anomalies,
    advice,
    transactionCount: allTransactions.length,
    statementCount: statements.length,
    daysCovered,
  }
}

// ─── CATEGORY BREAKDOWN ──────────────────────────────────────────────────────

function buildCategoryBreakdown(debits: ParsedTransaction[], totalExpenses: number): SpendingCategory[] {
  const map = new Map<string, ParsedTransaction[]>()

  for (const t of debits) {
    const cat = t.category ?? 'Uncategorized'
    const list = map.get(cat) ?? []
    list.push(t)
    map.set(cat, list)
  }

  const categories: SpendingCategory[] = []
  for (const [category, transactions] of map) {
    const total = Math.abs(transactions.reduce((s, t) => s + t.amount, 0))
    categories.push({
      category,
      total,
      count: transactions.length,
      percentage: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0,
      transactions,
    })
  }

  return categories.sort((a, b) => b.total - a.total)
}

// ─── VENDOR SUMMARY ──────────────────────────────────────────────────────────

function buildVendorSummary(debits: ParsedTransaction[]): VendorSummary[] {
  const map = new Map<string, ParsedTransaction[]>()

  for (const t of debits) {
    const name = normalizeVendorName(t.description)
    const list = map.get(name) ?? []
    list.push(t)
    map.set(name, list)
  }

  const vendors: VendorSummary[] = []
  for (const [name, transactions] of map) {
    const total = Math.abs(transactions.reduce((s, t) => s + t.amount, 0))
    vendors.push({
      name,
      total,
      count: transactions.length,
      avgAmount: total / transactions.length,
      isRecurring: transactions.length >= 2,
      category: transactions[0].category,
    })
  }

  return vendors.sort((a, b) => b.total - a.total)
}

function normalizeVendorName(description: string): string {
  // Remove common prefixes, transaction IDs, dates
  let name = description
    .replace(/^(POS|ACH|DEBIT|CREDIT|CHECK|WIRE|XFER|PMT|PYMT)\s*/i, '')
    .replace(/\s*#\d+.*$/, '')
    .replace(/\s*\d{2}\/\d{2}.*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Capitalize first letter of each word
  name = name.split(' ').map(w =>
    w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()
  ).join(' ')

  return name || description
}

// ─── ANOMALY DETECTION ───────────────────────────────────────────────────────

function detectAnomalies(transactions: ParsedTransaction[], totalExpenses: number): Anomaly[] {
  const anomalies: Anomaly[] = []
  const amounts = transactions.filter(t => t.amount < 0).map(t => Math.abs(t.amount))
  const avgExpense = amounts.length > 0 ? amounts.reduce((s, a) => s + a, 0) / amounts.length : 0
  const stdDev = Math.sqrt(
    amounts.reduce((s, a) => s + Math.pow(a - avgExpense, 2), 0) / Math.max(amounts.length, 1)
  )

  for (const t of transactions) {
    const absAmount = Math.abs(t.amount)

    // Large transaction (>3 std deviations from mean, or >20% of total)
    if (t.amount < 0 && absAmount > avgExpense + 3 * stdDev && absAmount > 500) {
      anomalies.push({
        type: 'large_transaction',
        severity: absAmount > totalExpenses * 0.2 ? 'critical' : 'warning',
        title: 'Unusually large expense',
        detail: `$${absAmount.toFixed(2)} to "${t.description}" is ${(absAmount / avgExpense).toFixed(1)}x the average expense`,
        transaction: t,
      })
    }

    // Round numbers (potential estimate or manual entry)
    if (absAmount >= 1000 && absAmount % 100 === 0) {
      anomalies.push({
        type: 'round_number',
        severity: 'info',
        title: 'Round-number transaction',
        detail: `$${absAmount.toFixed(2)} to "${t.description}" — may be an estimate or manual entry`,
        transaction: t,
      })
    }
  }

  // Duplicate detection (same amount + similar description within 3 days)
  for (let i = 0; i < transactions.length; i++) {
    for (let j = i + 1; j < transactions.length; j++) {
      const a = transactions[i]
      const b = transactions[j]
      if (
        Math.abs(a.amount) === Math.abs(b.amount) &&
        Math.abs(a.amount) > 50 &&
        a.description.substring(0, 10).toLowerCase() === b.description.substring(0, 10).toLowerCase()
      ) {
        anomalies.push({
          type: 'duplicate_suspect',
          severity: 'warning',
          title: 'Possible duplicate',
          detail: `Two transactions of $${Math.abs(a.amount).toFixed(2)} to "${a.description.substring(0, 30)}"`,
          transaction: a,
        })
        break // Only flag once per pair
      }
    }
  }

  return anomalies.slice(0, 20) // Cap at 20
}

// ─── SMART ADVICE ────────────────────────────────────────────────────────────

function generateAdvice(
  cashFlow: CashFlowSummary,
  categories: SpendingCategory[],
  vendors: VendorSummary[],
  anomalies: Anomaly[],
): SmartAdvice[] {
  const advice: SmartAdvice[] = []

  // Negative cash flow warning
  if (cashFlow.netCashFlow < 0) {
    advice.push({
      id: 'negative-cashflow',
      category: 'risk',
      title: 'Negative cash flow this month',
      description: `Expenses ($${cashFlow.totalExpenses.toFixed(0)}) exceeded income ($${cashFlow.totalIncome.toFixed(0)}) by $${Math.abs(cashFlow.netCashFlow).toFixed(0)}. Review large expenses and recurring subscriptions.`,
      impact: 'high',
    })
  }

  // Uncategorized spending
  const uncategorized = categories.find(c => c.category === 'Uncategorized')
  if (uncategorized && uncategorized.percentage > 30) {
    advice.push({
      id: 'high-uncategorized',
      category: 'efficiency',
      title: `${uncategorized.percentage}% of spending is uncategorized`,
      description: `${uncategorized.count} transactions totaling $${uncategorized.total.toFixed(0)} couldn't be auto-categorized. Review these for proper categorization.`,
      impact: 'medium',
    })
  }

  // Top vendor concentration
  if (vendors.length > 0) {
    const topVendorPct = cashFlow.totalExpenses > 0
      ? (vendors[0].total / cashFlow.totalExpenses) * 100
      : 0
    if (topVendorPct > 30) {
      advice.push({
        id: 'vendor-concentration',
        category: 'risk',
        title: `${topVendorPct.toFixed(0)}% of spending goes to one vendor`,
        description: `"${vendors[0].name}" accounts for $${vendors[0].total.toFixed(0)} of total expenses — ${topVendorPct.toFixed(0)}% of all spending this period.`,
        impact: 'medium',
      })
    }
  }

  // Recurring subscriptions
  const recurring = vendors.filter(v => v.isRecurring && v.avgAmount < 500)
  if (recurring.length > 5) {
    const totalRecurring = recurring.reduce((s, v) => s + v.total, 0)
    advice.push({
      id: 'many-subscriptions',
      category: 'savings',
      title: `${recurring.length} recurring charges detected`,
      description: `Monthly recurring expenses total ~$${totalRecurring.toFixed(0)} across ${recurring.length} vendors.`,
      impact: 'medium',
    })
  }

  // Anomaly count
  const criticalAnomalies = anomalies.filter(a => a.severity === 'critical')
  if (criticalAnomalies.length > 0) {
    advice.push({
      id: 'critical-anomalies',
      category: 'compliance',
      title: `${criticalAnomalies.length} unusual transaction(s) need review`,
      description: 'Large or unusual transactions were flagged. Review them in the Anomalies section to ensure they are legitimate and properly documented.',
      impact: 'high',
    })
  }

  // Good cash flow
  if (cashFlow.netCashFlow > 0 && cashFlow.totalIncome > 0) {
    const margin = (cashFlow.netCashFlow / cashFlow.totalIncome) * 100
    if (margin > 20) {
      advice.push({
        id: 'healthy-margin',
        category: 'savings',
        title: `Healthy ${margin.toFixed(0)}% profit margin`,
        description: `Net cash flow of $${cashFlow.netCashFlow.toFixed(0)} this month with a ${margin.toFixed(0)}% margin.`,
        impact: 'low',
      })
    }
  }

  return advice
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function estimateDaysCovered(transactions: ParsedTransaction[], year: number, month: number): number {
  // Try to parse dates from transactions
  const days = new Set<number>()
  for (const t of transactions) {
    const match = t.date.match(/(\d{1,2})\/(\d{1,2})/)
    if (match) {
      const day = parseInt(match[2], 10)
      if (day >= 1 && day <= 31) days.add(day)
    }
  }
  if (days.size > 0) return days.size

  // Fallback: days in month
  return new Date(year, month, 0).getDate()
}

// ─── EXPORT: MONTHLY REPORT HTML ─────────────────────────────────────────────

export function generateClientReport(
  insights: MonthlyInsights,
  businessName: string,
  bookkeeperName: string,
): void {
  const { cashFlow, spendingByCategory, topVendors, advice } = insights

  const categoryRows = spendingByCategory.slice(0, 10).map(c => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${c.category}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">$${c.total.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">${c.percentage}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">${c.count}</td>
    </tr>
  `).join('')

  const vendorRows = topVendors.slice(0, 10).map(v => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${v.name}${v.isRecurring ? ' <span style="color:#7c3aed;font-size:10px">RECURRING</span>' : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">$${v.total.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">${v.count}x</td>
    </tr>
  `).join('')

  const adviceRows = advice.map(a => `
    <div style="padding:12px;border-left:3px solid ${a.impact === 'high' ? '#ef4444' : a.impact === 'medium' ? '#f59e0b' : '#22c55e'};background:#fafafa;margin-bottom:8px;border-radius:0 6px 6px 0">
      <strong style="font-size:13px">${a.title}</strong>
      <p style="margin:4px 0 0;font-size:12px;color:#666">${a.description}</p>
    </div>
  `).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${businessName} — Monthly Report ${insights.period}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 16px; color: #555; margin-top: 32px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
  .summary-card .label { font-size: 11px; color: #888; text-transform: uppercase; }
  .summary-card .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .positive { color: #16a34a; }
  .negative { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; background: #f3f4f6; border-bottom: 2px solid #e5e7eb; font-size: 11px; text-transform: uppercase; color: #666; }
  .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #e5e7eb; padding-top: 16px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${businessName}</h1>
  <p style="color:#888;font-size:14px">Monthly Financial Summary — ${insights.period}</p>
  <p style="color:#888;font-size:12px">Prepared by ${bookkeeperName} · ${insights.transactionCount} transactions from ${insights.statementCount} statement(s)</p>

  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Income</div>
      <div class="value positive">$${cashFlow.totalIncome.toFixed(0)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Expenses</div>
      <div class="value negative">$${cashFlow.totalExpenses.toFixed(0)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Net Cash Flow</div>
      <div class="value ${cashFlow.netCashFlow >= 0 ? 'positive' : 'negative'}">$${cashFlow.netCashFlow.toFixed(0)}</div>
    </div>
    <div class="summary-card">
      <div class="label">Daily Avg Expense</div>
      <div class="value">$${cashFlow.dailyAvgExpense.toFixed(0)}</div>
    </div>
  </div>

  <h2>Spending by Category</h2>
  <table>
    <thead><tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:right">% of Total</th><th style="text-align:right">Transactions</th></tr></thead>
    <tbody>${categoryRows}</tbody>
  </table>

  <h2>Top Vendors</h2>
  <table>
    <thead><tr><th>Vendor</th><th style="text-align:right">Total Spent</th><th style="text-align:right">Count</th></tr></thead>
    <tbody>${vendorRows}</tbody>
  </table>

  ${advice.length > 0 ? `<h2>Observations</h2>${adviceRows}` : ''}

  <div class="footer">
    Generated by BookDrop · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
  </div>
</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${businessName.replace(/\s+/g, '_')}_${insights.period.replace(' ', '_')}_report.html`
  a.click()
  URL.revokeObjectURL(url)
}
