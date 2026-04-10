// ─── MONTH-OVER-MONTH TREND ANALYSIS ENGINE ────────────────────────────────
// Compares financial data across months to spot patterns bookkeepers
// would otherwise miss. Surfaces spending spikes, vendor changes,
// category trends, and generates human-readable narratives.

import type { StatementSummary } from './parse-bank-statement'

// ─── TYPES ─────────────────────────────────────────────────────────────────

export interface MonthComparison {
  currentMonth: { year: number; month: number; label: string }
  previousMonth: { year: number; month: number; label: string }
  income: { current: number; previous: number; change: number; changePercent: number }
  expenses: { current: number; previous: number; change: number; changePercent: number }
  netCashFlow: { current: number; previous: number; change: number; changePercent: number }
  transactionCount: { current: number; previous: number; change: number }
}

export interface CategoryTrend {
  category: string
  months: Array<{ year: number; month: number; total: number }>
  trend: 'increasing' | 'stable' | 'decreasing'
  avgMonthly: number
  changePercent: number  // latest vs 3-month avg
  alert: string | null  // "Meals spending up 45% this month"
}

export interface VendorTrend {
  vendor: string
  months: Array<{ year: number; month: number; total: number; count: number }>
  isNew: boolean  // first time seeing this vendor
  isGone: boolean  // was regular, now disappeared
  priceChange: number | null  // % change in avg transaction amount
  alert: string | null
}

export interface TrendReport {
  monthOverMonth: MonthComparison | null
  categoryTrends: CategoryTrend[]
  vendorTrends: VendorTrend[]
  newVendors: string[]
  droppedVendors: string[]
  growthRate: number | null  // income growth rate
  burnRateChange: number | null  // expense growth rate
  alerts: TrendAlert[]
  narrative: string  // 2-3 sentence AI-style summary of what changed
}

export interface TrendAlert {
  type: 'spending-spike' | 'income-drop' | 'new-expense' | 'vendor-change' | 'positive'
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** Sort key for year+month: multiply year by 100 and add month */
function monthKey(year: number, month: number): number {
  return year * 100 + month
}

/**
 * Derive the period { month, year } from a StatementSummary.
 * Uses startDate or endDate (MM/DD or MM/DD/YYYY format), falling back
 * to the first transaction date.
 */
function derivePeriod(stmt: StatementSummary): { year: number; month: number } | null {
  // Try endDate first (more representative of the statement period)
  const dateStr = stmt.endDate ?? stmt.startDate
  if (dateStr) {
    const parsed = parseDateString(dateStr)
    if (parsed) return parsed
  }
  // Fall back to first transaction date
  if (stmt.transactions.length > 0) {
    const parsed = parseDateString(stmt.transactions[0].date)
    if (parsed) return parsed
  }
  return null
}

function parseDateString(dateStr: string): { year: number; month: number } | null {
  // Handles MM/DD/YYYY, MM/DD/YY, MM/DD
  const parts = dateStr.split('/')
  if (parts.length < 2) return null
  const month = parseInt(parts[0], 10)
  if (isNaN(month) || month < 1 || month > 12) return null

  let year: number
  if (parts.length >= 3) {
    year = parseInt(parts[2], 10)
    if (isNaN(year)) return null
    if (year < 100) year += 2000
  } else {
    // No year in date — use current year as fallback
    year = new Date().getFullYear()
  }
  return { year, month }
}

/** Normalize a vendor/description for grouping */
function normalizeVendor(description: string): string {
  return description
    .replace(/\s+/g, ' ')
    .replace(/\d{4,}/g, '') // strip long numbers (card refs, IDs)
    .replace(/\s*#\d+/g, '') // strip # references
    .trim()
    .toLowerCase()
    .split(' ')
    .slice(0, 3) // keep first 3 words for grouping
    .join(' ')
}

function formatCurrency(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toFixed(0)}`
  return amount < 0 ? `-${formatted}` : formatted
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / Math.abs(previous)) * 100
}

// ─── INTERNAL STRUCTURES ───────────────────────────────────────────────────

interface MonthBucket {
  year: number
  month: number
  income: number
  expenses: number
  transactions: Array<{ description: string; amount: number; category: string }>
}

// ─── MAIN ANALYSIS FUNCTION ────────────────────────────────────────────────

export function analyzeTrends(statements: StatementSummary[]): TrendReport {
  if (statements.length === 0) {
    return emptyReport()
  }

  // 1. Group all transactions by month
  const buckets = buildMonthBuckets(statements)

  if (buckets.length === 0) {
    return emptyReport()
  }

  // Sort buckets chronologically
  buckets.sort((a, b) => monthKey(a.year, a.month) - monthKey(b.year, b.month))

  // 2. Month-over-month comparison (latest two months)
  const monthOverMonth = buckets.length >= 2
    ? buildMonthComparison(buckets[buckets.length - 1], buckets[buckets.length - 2])
    : null

  // 3. Category trends
  const categoryTrends = buildCategoryTrends(buckets)

  // 4. Vendor trends
  const vendorTrends = buildVendorTrends(buckets)

  // 5. New and dropped vendors
  const newVendors = vendorTrends.filter(v => v.isNew).map(v => v.vendor)
  const droppedVendors = vendorTrends.filter(v => v.isGone).map(v => v.vendor)

  // 6. Growth and burn rates
  const growthRate = computeGrowthRate(buckets, 'income')
  const burnRateChange = computeGrowthRate(buckets, 'expenses')

  // 7. Alerts
  const alerts = gatherAlerts(monthOverMonth, categoryTrends, vendorTrends, growthRate)

  // 8. Narrative
  const narrative = generateNarrative(monthOverMonth, categoryTrends, vendorTrends, newVendors, buckets)

  return {
    monthOverMonth,
    categoryTrends,
    vendorTrends,
    newVendors,
    droppedVendors,
    growthRate,
    burnRateChange,
    alerts,
    narrative,
  }
}

// ─── BUCKET BUILDING ───────────────────────────────────────────────────────

function buildMonthBuckets(statements: StatementSummary[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>()

  for (const stmt of statements) {
    const period = derivePeriod(stmt)
    if (!period) continue

    const key = `${period.year}-${period.month}`
    let bucket = map.get(key)
    if (!bucket) {
      bucket = {
        year: period.year,
        month: period.month,
        income: 0,
        expenses: 0,
        transactions: [],
      }
      map.set(key, bucket)
    }

    for (const txn of stmt.transactions) {
      const category = txn.category ?? 'Uncategorized'
      bucket.transactions.push({
        description: txn.description,
        amount: txn.amount,
        category,
      })
      if (txn.amount > 0) {
        bucket.income += txn.amount
      } else {
        bucket.expenses += Math.abs(txn.amount)
      }
    }
  }

  return Array.from(map.values())
}

// ─── MONTH-OVER-MONTH ──────────────────────────────────────────────────────

function buildMonthComparison(current: MonthBucket, previous: MonthBucket): MonthComparison {
  const currentNet = current.income - current.expenses
  const previousNet = previous.income - previous.expenses

  return {
    currentMonth: { year: current.year, month: current.month, label: monthLabel(current.year, current.month) },
    previousMonth: { year: previous.year, month: previous.month, label: monthLabel(previous.year, previous.month) },
    income: {
      current: current.income,
      previous: previous.income,
      change: current.income - previous.income,
      changePercent: percentChange(current.income, previous.income),
    },
    expenses: {
      current: current.expenses,
      previous: previous.expenses,
      change: current.expenses - previous.expenses,
      changePercent: percentChange(current.expenses, previous.expenses),
    },
    netCashFlow: {
      current: currentNet,
      previous: previousNet,
      change: currentNet - previousNet,
      changePercent: percentChange(currentNet, previousNet),
    },
    transactionCount: {
      current: current.transactions.length,
      previous: previous.transactions.length,
      change: current.transactions.length - previous.transactions.length,
    },
  }
}

// ─── CATEGORY TRENDS ───────────────────────────────────────────────────────

function buildCategoryTrends(buckets: MonthBucket[]): CategoryTrend[] {
  // Collect all categories across all months
  const categoryMonthMap = new Map<string, Map<string, number>>()

  for (const bucket of buckets) {
    const key = `${bucket.year}-${bucket.month}`
    for (const txn of bucket.transactions) {
      if (txn.amount >= 0) continue // only track expenses for category trends
      const cat = txn.category
      if (!categoryMonthMap.has(cat)) {
        categoryMonthMap.set(cat, new Map())
      }
      const monthTotals = categoryMonthMap.get(cat)!
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + Math.abs(txn.amount))
    }
  }

  const results: CategoryTrend[] = []

  for (const [category, monthTotals] of Array.from(categoryMonthMap.entries())) {
    const months: Array<{ year: number; month: number; total: number }> = []
    for (const bucket of buckets) {
      const key = `${bucket.year}-${bucket.month}`
      const total = monthTotals.get(key) ?? 0
      if (total > 0) {
        months.push({ year: bucket.year, month: bucket.month, total })
      }
    }

    if (months.length === 0) continue

    // Calculate average
    const avgMonthly = months.reduce((sum, m) => sum + m.total, 0) / months.length

    // 3-month average (excluding latest) for comparison
    const recentMonths = months.slice(-4, -1) // 3 months before latest
    const threeMonthAvg = recentMonths.length > 0
      ? recentMonths.reduce((sum, m) => sum + m.total, 0) / recentMonths.length
      : avgMonthly

    const latestTotal = months[months.length - 1].total
    const changePercent = percentChange(latestTotal, threeMonthAvg)

    // Determine trend direction
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable'
    if (months.length >= 2) {
      const recent = months.slice(-3)
      if (recent.length >= 2) {
        const diffs = []
        for (let i = 1; i < recent.length; i++) {
          diffs.push(recent[i].total - recent[i - 1].total)
        }
        const avgDiff = diffs.reduce((s, d) => s + d, 0) / diffs.length
        const threshold = avgMonthly * 0.1
        if (avgDiff > threshold) trend = 'increasing'
        else if (avgDiff < -threshold) trend = 'decreasing'
      }
    }

    // Generate alert if 30%+ jump
    let alert: string | null = null
    if (Math.abs(changePercent) >= 30 && months.length >= 2) {
      const direction = changePercent > 0 ? 'up' : 'down'
      alert = `${category} spending ${direction} ${Math.abs(Math.round(changePercent))}% this month`
    }

    results.push({ category, months, trend, avgMonthly, changePercent, alert })
  }

  // Sort by absolute changePercent descending (biggest movers first)
  results.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))

  return results
}

// ─── VENDOR TRENDS ─────────────────────────────────────────────────────────

function buildVendorTrends(buckets: MonthBucket[]): VendorTrend[] {
  if (buckets.length === 0) return []

  // Map: normalized vendor -> per-month totals and counts
  const vendorMonthMap = new Map<string, Map<string, { total: number; count: number; rawName: string }>>()

  for (const bucket of buckets) {
    const key = `${bucket.year}-${bucket.month}`
    for (const txn of bucket.transactions) {
      if (txn.amount >= 0) continue // only track expense vendors
      const normalized = normalizeVendor(txn.description)
      if (!normalized) continue

      if (!vendorMonthMap.has(normalized)) {
        vendorMonthMap.set(normalized, new Map())
      }
      const monthData = vendorMonthMap.get(normalized)!
      const existing = monthData.get(key) ?? { total: 0, count: 0, rawName: txn.description }
      existing.total += Math.abs(txn.amount)
      existing.count += 1
      monthData.set(key, existing)
    }
  }

  const latestBucket = buckets[buckets.length - 1]
  const latestKey = `${latestBucket.year}-${latestBucket.month}`
  const earlierBuckets = buckets.slice(0, -1)
  const earlierKeys = new Set(earlierBuckets.map(b => `${b.year}-${b.month}`))

  const results: VendorTrend[] = []

  for (const [normalized, monthData] of Array.from(vendorMonthMap.entries())) {
    // Pick the best raw name (from latest month if available)
    let displayName = normalized
    for (const [, data] of Array.from(monthData.entries())) {
      displayName = data.rawName
    }
    if (monthData.has(latestKey)) {
      displayName = monthData.get(latestKey)!.rawName
    }

    const months: Array<{ year: number; month: number; total: number; count: number }> = []
    for (const bucket of buckets) {
      const key = `${bucket.year}-${bucket.month}`
      const data = monthData.get(key)
      if (data) {
        months.push({ year: bucket.year, month: bucket.month, total: data.total, count: data.count })
      }
    }

    // Is this vendor new? (only appears in the latest month)
    const appearsInEarlier = Array.from(monthData.keys()).some(k => earlierKeys.has(k))
    const appearsInLatest = monthData.has(latestKey)
    const isNew = appearsInLatest && !appearsInEarlier

    // Is this vendor gone? (appeared in 2+ earlier months but not latest)
    const earlierAppearances = Array.from(monthData.keys()).filter(k => earlierKeys.has(k)).length
    const isGone = !appearsInLatest && earlierAppearances >= 2

    // Price change: compare avg transaction amount latest vs previous months
    let priceChange: number | null = null
    if (months.length >= 2 && appearsInLatest) {
      const latestAvg = months[months.length - 1].total / months[months.length - 1].count
      const previousMonths = months.slice(0, -1)
      const previousTotal = previousMonths.reduce((s, m) => s + m.total, 0)
      const previousCount = previousMonths.reduce((s, m) => s + m.count, 0)
      if (previousCount > 0) {
        const previousAvg = previousTotal / previousCount
        priceChange = percentChange(latestAvg, previousAvg)
      }
    }

    // Generate alert
    let alert: string | null = null
    if (isNew) {
      const amount = monthData.get(latestKey)!.total
      alert = `New vendor: ${displayName} (${formatCurrency(amount)})`
    } else if (isGone) {
      alert = `${displayName} — no longer appearing (was a regular vendor)`
    } else if (priceChange !== null && Math.abs(priceChange) >= 25) {
      const direction = priceChange > 0 ? 'increased' : 'decreased'
      alert = `${displayName} avg transaction ${direction} ${Math.abs(Math.round(priceChange))}%`
    }

    results.push({
      vendor: displayName,
      months,
      isNew,
      isGone,
      priceChange,
      alert,
    })
  }

  // Sort: new vendors first, then gone vendors, then by absolute price change
  results.sort((a, b) => {
    if (a.isNew !== b.isNew) return a.isNew ? -1 : 1
    if (a.isGone !== b.isGone) return a.isGone ? -1 : 1
    return Math.abs(b.priceChange ?? 0) - Math.abs(a.priceChange ?? 0)
  })

  return results
}

// ─── GROWTH / BURN RATE ────────────────────────────────────────────────────

function computeGrowthRate(buckets: MonthBucket[], field: 'income' | 'expenses'): number | null {
  if (buckets.length < 2) return null

  const values = buckets.map(b => field === 'income' ? b.income : b.expenses)
  // Simple: compare average of last half vs first half
  const mid = Math.floor(values.length / 2)
  const firstHalf = values.slice(0, mid)
  const secondHalf = values.slice(mid)

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length

  if (avgFirst === 0) return avgSecond === 0 ? 0 : 100
  return ((avgSecond - avgFirst) / Math.abs(avgFirst)) * 100
}

// ─── ALERTS ────────────────────────────────────────────────────────────────

function gatherAlerts(
  mom: MonthComparison | null,
  categoryTrends: CategoryTrend[],
  vendorTrends: VendorTrend[],
  growthRate: number | null,
): TrendAlert[] {
  const alerts: TrendAlert[] = []

  // Income drop
  if (mom && mom.income.changePercent < -15) {
    alerts.push({
      type: 'income-drop',
      severity: mom.income.changePercent < -30 ? 'critical' : 'warning',
      title: 'Income decreased',
      detail: `Income dropped ${Math.abs(Math.round(mom.income.changePercent))}% from ${mom.previousMonth.label} to ${mom.currentMonth.label} (${formatCurrency(mom.income.change)}).`,
    })
  }

  // Spending spike
  if (mom && mom.expenses.changePercent > 20) {
    alerts.push({
      type: 'spending-spike',
      severity: mom.expenses.changePercent > 50 ? 'critical' : 'warning',
      title: 'Expenses increased significantly',
      detail: `Total expenses rose ${Math.round(mom.expenses.changePercent)}% from ${mom.previousMonth.label} to ${mom.currentMonth.label} (+${formatCurrency(mom.expenses.change)}).`,
    })
  }

  // Category spikes (30%+)
  for (const ct of categoryTrends) {
    if (ct.alert && ct.changePercent > 30) {
      alerts.push({
        type: 'spending-spike',
        severity: ct.changePercent > 60 ? 'critical' : 'warning',
        title: `${ct.category} spending spike`,
        detail: ct.alert,
      })
    }
  }

  // New vendors
  const newVendorAlerts = vendorTrends.filter(v => v.isNew)
  if (newVendorAlerts.length > 0) {
    alerts.push({
      type: 'new-expense',
      severity: 'info',
      title: `${newVendorAlerts.length} new vendor${newVendorAlerts.length > 1 ? 's' : ''} detected`,
      detail: newVendorAlerts.map(v => v.vendor).join(', '),
    })
  }

  // Dropped vendors
  const droppedAlerts = vendorTrends.filter(v => v.isGone)
  if (droppedAlerts.length > 0) {
    alerts.push({
      type: 'vendor-change',
      severity: 'info',
      title: `${droppedAlerts.length} regular vendor${droppedAlerts.length > 1 ? 's' : ''} no longer appearing`,
      detail: droppedAlerts.map(v => v.vendor).join(', '),
    })
  }

  // Positive: income growth
  if (growthRate !== null && growthRate > 10) {
    alerts.push({
      type: 'positive',
      severity: 'info',
      title: 'Income trending upward',
      detail: `Income has grown approximately ${Math.round(growthRate)}% over the analyzed period.`,
    })
  }

  // Positive: expenses decreasing
  if (mom && mom.expenses.changePercent < -10) {
    alerts.push({
      type: 'positive',
      severity: 'info',
      title: 'Expenses decreased',
      detail: `Total expenses dropped ${Math.abs(Math.round(mom.expenses.changePercent))}% — nice work keeping costs down.`,
    })
  }

  return alerts
}

// ─── NARRATIVE GENERATION ──────────────────────────────────────────────────

function generateNarrative(
  mom: MonthComparison | null,
  categoryTrends: CategoryTrend[],
  _vendorTrends: VendorTrend[],
  newVendors: string[],
  buckets: MonthBucket[],
): string {
  if (!mom) {
    if (buckets.length === 1) {
      const b = buckets[0]
      return `${monthLabel(b.year, b.month)}: ${formatCurrency(b.income)} income, ${formatCurrency(b.expenses)} expenses across ${b.transactions.length} transactions. Add more months to see trends.`
    }
    return 'Not enough data to generate a trend narrative. Upload at least two months of statements.'
  }

  const parts: string[] = []

  // Expense change
  const expDir = mom.expenses.changePercent > 0 ? 'rose' : 'fell'
  parts.push(
    `${mom.currentMonth.label} expenses ${expDir} ${Math.abs(Math.round(mom.expenses.changePercent))}% vs ${mom.previousMonth.label}`
  )

  // Biggest category driver
  const biggestCategory = categoryTrends.find(ct => Math.abs(ct.changePercent) >= 20)
  if (biggestCategory) {
    const latestTotal = biggestCategory.months[biggestCategory.months.length - 1]?.total ?? 0
    const previousMonths = biggestCategory.months.slice(0, -1)
    const previousAvg = previousMonths.length > 0
      ? previousMonths.reduce((s, m) => s + m.total, 0) / previousMonths.length
      : 0
    const diff = latestTotal - previousAvg
    if (Math.abs(diff) > 0) {
      parts[0] += `, driven by a ${formatCurrency(Math.abs(diff))} ${diff > 0 ? 'increase' : 'decrease'} in ${biggestCategory.category}`
    }
  }
  parts[0] += '.'

  // New vendors
  if (newVendors.length > 0) {
    const displayed = newVendors.slice(0, 3)
    parts.push(
      `${newVendors.length} new vendor${newVendors.length > 1 ? 's' : ''} appeared: ${displayed.join(' and ')}${newVendors.length > 3 ? ` and ${newVendors.length - 3} more` : ''}.`
    )
  }

  // Income summary
  if (Math.abs(mom.income.changePercent) < 5) {
    parts.push(`Income was stable at ${formatCurrency(mom.income.current)}.`)
  } else {
    const incDir = mom.income.changePercent > 0 ? 'increased' : 'decreased'
    parts.push(
      `Income ${incDir} ${Math.abs(Math.round(mom.income.changePercent))}% to ${formatCurrency(mom.income.current)}.`
    )
  }

  return parts.join(' ')
}

// ─── EMPTY REPORT ──────────────────────────────────────────────────────────

function emptyReport(): TrendReport {
  return {
    monthOverMonth: null,
    categoryTrends: [],
    vendorTrends: [],
    newVendors: [],
    droppedVendors: [],
    growthRate: null,
    burnRateChange: null,
    alerts: [],
    narrative: 'No statement data available for trend analysis.',
  }
}
