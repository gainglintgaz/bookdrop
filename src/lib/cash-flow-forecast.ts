// ─── CASH FLOW FORECASTING ENGINE ──────────────────────────────────────────
// Predicts future months based on parsed statement data.
// Replaces manual spreadsheet forecasting bookkeepers do.

import type { StatementSummary } from './parse-bank-statement'

// ─── TYPES ─────────────────────────────────────────────────────────────────

export interface ForecastMonth {
  year: number
  month: number
  label: string // "May 2025"
  predictedIncome: number
  predictedExpenses: number
  predictedNetCashFlow: number
  confidenceLevel: 'high' | 'medium' | 'low'
  basis: string // "Based on 3-month average" or "Based on recurring pattern"
}

export interface RecurringItem {
  description: string
  amount: number
  frequency: 'monthly' | 'quarterly' | 'annual'
  dayOfMonth: number
  category: string
  isIncome: boolean
  confidence: 'high' | 'medium' | 'low'
  lastSeen: string // date
}

export interface CashFlowForecast {
  currentMonth: { year: number; month: number }
  forecast: ForecastMonth[] // next 3 months
  recurringIncome: RecurringItem[]
  recurringExpenses: RecurringItem[]
  seasonalPatterns: string[] // human-readable insights
  runwayMonths: number | null // months until cash runs out if net < 0
  alerts: ForecastAlert[]
}

export interface ForecastAlert {
  type: 'cash-crunch' | 'seasonal-spike' | 'missing-income' | 'expense-trend' | 'positive'
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
}

// ─── INTERNAL HELPERS ──────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function advanceMonth(year: number, month: number, n: number): { year: number; month: number } {
  const total = (year * 12 + (month - 1)) + n
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

/** Normalise a description for grouping: lowercase, collapse whitespace, strip trailing numbers/dates */
function normaliseDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, '') // strip dates
    .replace(/\s+/g, ' ')
    .replace(/#\d+/g, '') // strip reference numbers
    .replace(/\s+$/, '')
    .replace(/^\s+/, '')
    .trim()
}

/** Parse a date string (MM/DD, MM/DD/YY, MM/DD/YYYY) into { year, month, day } */
function parseTransactionDate(
  dateStr: string,
  fallbackYear: number
): { year: number; month: number; day: number } | null {
  const parts = dateStr.split('/')
  if (parts.length < 2) return null
  const month = parseInt(parts[0], 10)
  const day = parseInt(parts[1], 10)
  let year = fallbackYear
  if (parts.length === 3) {
    year = parseInt(parts[2], 10)
    if (year < 100) year += 2000
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** Extract the period (year, month) from a StatementSummary using its date fields */
function extractPeriod(
  statement: StatementSummary
): { year: number; month: number } | null {
  // Try endDate first (more representative of the statement period)
  const dateStr = statement.endDate ?? statement.startDate
  if (!dateStr) return null
  const parsed = parseTransactionDate(dateStr, new Date().getFullYear())
  if (!parsed) return null
  return { year: parsed.year, month: parsed.month }
}

interface MonthBucket {
  year: number
  month: number
  income: number
  expenses: number
  transactions: Array<{
    description: string
    normDescription: string
    amount: number
    isIncome: boolean
    day: number
    category: string
  }>
}

/** Bucket all transactions by month */
function bucketByMonth(statements: StatementSummary[]): Map<string, MonthBucket> {
  const buckets = new Map<string, MonthBucket>()

  for (const statement of statements) {
    const period = extractPeriod(statement)
    const fallbackYear = period?.year ?? new Date().getFullYear()

    for (const tx of statement.transactions) {
      const parsed = parseTransactionDate(tx.date, fallbackYear)
      if (!parsed) continue

      const key = `${parsed.year}-${parsed.month}`
      let bucket = buckets.get(key)
      if (!bucket) {
        bucket = { year: parsed.year, month: parsed.month, income: 0, expenses: 0, transactions: [] }
        buckets.set(key, bucket)
      }

      const isIncome = tx.amount > 0
      if (isIncome) {
        bucket.income += tx.amount
      } else {
        bucket.expenses += Math.abs(tx.amount)
      }

      bucket.transactions.push({
        description: tx.description,
        normDescription: normaliseDescription(tx.description),
        amount: Math.abs(tx.amount),
        isIncome,
        day: parsed.day,
        category: tx.category ?? 'uncategorized',
      })
    }
  }

  return buckets
}

// ─── RECURRING DETECTION ───────────────────────────────────────────────────

interface RecurringCandidate {
  normDescription: string
  description: string // best raw description
  occurrences: Array<{ year: number; month: number; amount: number; day: number }>
  isIncome: boolean
  category: string
}

function detectRecurring(buckets: Map<string, MonthBucket>): RecurringCandidate[] {
  // Group transactions across all months by normalised description + income/expense
  const groups = new Map<string, RecurringCandidate>()

  for (const bucket of buckets.values()) {
    for (const tx of bucket.transactions) {
      const groupKey = `${tx.normDescription}|${tx.isIncome ? 'in' : 'out'}`
      let group = groups.get(groupKey)
      if (!group) {
        group = {
          normDescription: tx.normDescription,
          description: tx.description,
          occurrences: [],
          isIncome: tx.isIncome,
          category: tx.category,
        }
        groups.set(groupKey, group)
      }
      // Use the longest description as the display name
      if (tx.description.length > group.description.length) {
        group.description = tx.description
      }
      group.occurrences.push({
        year: bucket.year,
        month: bucket.month,
        amount: tx.amount,
        day: tx.day,
      })
    }
  }

  // Filter to items appearing in at least 2 distinct months with amount within 10% variance
  const recurring: RecurringCandidate[] = []

  for (const group of groups.values()) {
    // Deduplicate by month (take first occurrence per month)
    const byMonth = new Map<string, (typeof group.occurrences)[0]>()
    for (const occ of group.occurrences) {
      const mk = `${occ.year}-${occ.month}`
      if (!byMonth.has(mk)) byMonth.set(mk, occ)
    }
    const uniqueMonths = Array.from(byMonth.values())
    if (uniqueMonths.length < 2) continue

    // Check amount variance: all amounts within 10% of the median
    const amounts = uniqueMonths.map((o) => o.amount).sort((a, b) => a - b)
    const median = amounts[Math.floor(amounts.length / 2)]
    if (median === 0) continue
    const withinVariance = amounts.every(
      (a) => Math.abs(a - median) / median <= 0.10
    )
    if (!withinVariance) continue

    group.occurrences = uniqueMonths
    recurring.push(group)
  }

  return recurring
}

function classifyFrequency(
  occurrences: RecurringCandidate['occurrences'],
  totalMonthsCovered: number
): 'monthly' | 'quarterly' | 'annual' {
  const count = occurrences.length
  if (totalMonthsCovered <= 0) return 'monthly'
  const ratio = count / totalMonthsCovered
  if (ratio >= 0.7) return 'monthly'
  if (ratio >= 0.2) return 'quarterly'
  return 'annual'
}

function classifyConfidence(
  occurrences: RecurringCandidate['occurrences'],
  frequency: 'monthly' | 'quarterly' | 'annual',
  totalMonthsCovered: number
): 'high' | 'medium' | 'low' {
  const count = occurrences.length
  if (frequency === 'monthly' && count >= 3 && count / totalMonthsCovered >= 0.8) return 'high'
  if (count >= 3) return 'medium'
  return 'low'
}

function buildRecurringItems(
  candidates: RecurringCandidate[],
  totalMonthsCovered: number
): RecurringItem[] {
  return candidates.map((c) => {
    const amounts = c.occurrences.map((o) => o.amount)
    const avgAmount = amounts.reduce((s, a) => s + a, 0) / amounts.length
    const days = c.occurrences.map((o) => o.day)
    const avgDay = Math.round(days.reduce((s, d) => s + d, 0) / days.length)
    const frequency = classifyFrequency(c.occurrences, totalMonthsCovered)
    const confidence = classifyConfidence(c.occurrences, frequency, totalMonthsCovered)

    // Last seen date
    const sorted = [...c.occurrences].sort(
      (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
    )
    const last = sorted[sorted.length - 1]
    const lastSeen = `${String(last.month).padStart(2, '0')}/01/${last.year}`

    return {
      description: c.description,
      amount: Math.round(avgAmount * 100) / 100,
      frequency,
      dayOfMonth: avgDay,
      category: c.category,
      isIncome: c.isIncome,
      confidence,
      lastSeen,
    }
  })
}

// ─── FORECAST GENERATION ───────────────────────────────────────────────────

function computeMovingAverage(
  buckets: Map<string, MonthBucket>,
  currentYear: number,
  currentMonth: number,
  windowSize: number
): { avgIncome: number; avgExpenses: number; monthsUsed: number } {
  // Collect the most recent `windowSize` months before current
  const months: MonthBucket[] = []
  let y = currentYear
  let m = currentMonth

  for (let i = 0; i < windowSize + 12; i++) {
    // go back
    const prev = advanceMonth(y, m, -(i + 1))
    const key = `${prev.year}-${prev.month}`
    const bucket = buckets.get(key)
    if (bucket) months.push(bucket)
    if (months.length >= windowSize) break
  }

  if (months.length === 0) {
    return { avgIncome: 0, avgExpenses: 0, monthsUsed: 0 }
  }

  const totalIncome = months.reduce((s, b) => s + b.income, 0)
  const totalExpenses = months.reduce((s, b) => s + b.expenses, 0)
  return {
    avgIncome: totalIncome / months.length,
    avgExpenses: totalExpenses / months.length,
    monthsUsed: months.length,
  }
}

function forecastRecurringForMonth(
  items: RecurringItem[],
  targetYear: number,
  targetMonth: number
): { income: number; expenses: number } {
  let income = 0
  let expenses = 0

  for (const item of items) {
    let include = false
    if (item.frequency === 'monthly') {
      include = true
    } else if (item.frequency === 'quarterly') {
      // Assume quarterly items recur every 3 months from last seen
      const parts = item.lastSeen.split('/')
      const lastMonth = parseInt(parts[0], 10)
      const lastYear = parseInt(parts[2], 10)
      const diff = (targetYear * 12 + targetMonth) - (lastYear * 12 + lastMonth)
      include = diff > 0 && diff % 3 === 0
    } else if (item.frequency === 'annual') {
      const parts = item.lastSeen.split('/')
      const lastMonth = parseInt(parts[0], 10)
      include = targetMonth === lastMonth
    }

    if (include) {
      if (item.isIncome) {
        income += item.amount
      } else {
        expenses += item.amount
      }
    }
  }

  return { income, expenses }
}

// ─── SEASONAL PATTERNS ─────────────────────────────────────────────────────

function detectSeasonalPatterns(
  buckets: Map<string, MonthBucket>
): string[] {
  const patterns: string[] = []

  // Group months by month-of-year to find seasonal trends
  const byMonthOfYear = new Map<number, { incomes: number[]; expenses: number[] }>()
  for (const bucket of buckets.values()) {
    let entry = byMonthOfYear.get(bucket.month)
    if (!entry) {
      entry = { incomes: [], expenses: [] }
      byMonthOfYear.set(bucket.month, entry)
    }
    entry.incomes.push(bucket.income)
    entry.expenses.push(bucket.expenses)
  }

  // Calculate overall average expenses
  let totalExpenses = 0
  let totalMonths = 0
  for (const entry of byMonthOfYear.values()) {
    for (const e of entry.expenses) {
      totalExpenses += e
      totalMonths++
    }
  }
  const overallAvgExpenses = totalMonths > 0 ? totalExpenses / totalMonths : 0

  if (overallAvgExpenses === 0) return patterns

  // Find months where expenses deviate significantly from average
  for (const [monthNum, entry] of byMonthOfYear) {
    if (entry.expenses.length < 1) continue
    const avg = entry.expenses.reduce((s, e) => s + e, 0) / entry.expenses.length
    const pctDiff = ((avg - overallAvgExpenses) / overallAvgExpenses) * 100

    if (pctDiff > 15) {
      patterns.push(
        `Expenses typically ${Math.round(pctDiff)}% higher in ${MONTH_NAMES[monthNum - 1]}`
      )
    } else if (pctDiff < -15) {
      patterns.push(
        `Expenses typically ${Math.round(Math.abs(pctDiff))}% lower in ${MONTH_NAMES[monthNum - 1]}`
      )
    }
  }

  // Check income seasonality similarly
  let totalIncome = 0
  let incomeMonths = 0
  for (const entry of byMonthOfYear.values()) {
    for (const i of entry.incomes) {
      totalIncome += i
      incomeMonths++
    }
  }
  const overallAvgIncome = incomeMonths > 0 ? totalIncome / incomeMonths : 0

  if (overallAvgIncome > 0) {
    for (const [monthNum, entry] of byMonthOfYear) {
      if (entry.incomes.length < 1) continue
      const avg = entry.incomes.reduce((s, i) => s + i, 0) / entry.incomes.length
      const pctDiff = ((avg - overallAvgIncome) / overallAvgIncome) * 100

      if (pctDiff > 15) {
        patterns.push(
          `Income typically ${Math.round(pctDiff)}% higher in ${MONTH_NAMES[monthNum - 1]}`
        )
      } else if (pctDiff < -15) {
        patterns.push(
          `Income typically ${Math.round(Math.abs(pctDiff))}% lower in ${MONTH_NAMES[monthNum - 1]}`
        )
      }
    }
  }

  return patterns
}

// ─── ALERTS ────────────────────────────────────────────────────────────────

function generateAlerts(
  forecast: ForecastMonth[],
  recurringIncome: RecurringItem[],
  _recurringExpenses: RecurringItem[],
  buckets: Map<string, MonthBucket>,
  runwayMonths: number | null
): ForecastAlert[] {
  const alerts: ForecastAlert[] = []

  // Cash crunch: runway less than 3 months
  if (runwayMonths !== null && runwayMonths <= 3) {
    alerts.push({
      type: 'cash-crunch',
      severity: 'critical',
      title: 'Cash crunch ahead',
      detail: runwayMonths <= 1
        ? 'At current burn rate, cash could run out within a month. Immediate action recommended.'
        : `At current burn rate, cash could run out in approximately ${runwayMonths} months.`,
    })
  }

  // Expense trend: check if expenses have been increasing over the last 3 months
  const sortedBuckets = Array.from(buckets.values()).sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
  )
  if (sortedBuckets.length >= 3) {
    const lastThree = sortedBuckets.slice(-3)
    const increasing = lastThree[0].expenses < lastThree[1].expenses &&
      lastThree[1].expenses < lastThree[2].expenses
    if (increasing) {
      const growthPct = ((lastThree[2].expenses - lastThree[0].expenses) / lastThree[0].expenses) * 100
      if (growthPct > 10) {
        alerts.push({
          type: 'expense-trend',
          severity: 'warning',
          title: 'Expenses trending upward',
          detail: `Expenses have increased ${Math.round(growthPct)}% over the past 3 months.`,
        })
      }
    }
  }

  // Missing income: if a recurring income item hasn't appeared in the most recent month
  if (sortedBuckets.length > 0) {
    const latestBucket = sortedBuckets[sortedBuckets.length - 1]
    const latestDescs = new Set(
      latestBucket.transactions
        .filter((t) => t.isIncome)
        .map((t) => t.normDescription)
    )
    for (const item of recurringIncome) {
      if (item.frequency === 'monthly' && item.confidence !== 'low') {
        const normItemDesc = normaliseDescription(item.description)
        if (!latestDescs.has(normItemDesc)) {
          alerts.push({
            type: 'missing-income',
            severity: 'warning',
            title: `Expected income not yet received`,
            detail: `"${item.description}" (~$${item.amount.toLocaleString()}) typically arrives monthly but was not found in the most recent statement.`,
          })
        }
      }
    }
  }

  // Seasonal spike: any forecast month with expenses notably higher than average
  const avgForecastExpenses =
    forecast.reduce((s, f) => s + f.predictedExpenses, 0) / (forecast.length || 1)
  for (const fm of forecast) {
    if (avgForecastExpenses > 0 && fm.predictedExpenses > avgForecastExpenses * 1.2) {
      alerts.push({
        type: 'seasonal-spike',
        severity: 'warning',
        title: `Higher expenses expected in ${fm.label}`,
        detail: `Predicted expenses of $${Math.round(fm.predictedExpenses).toLocaleString()} are above the forecast average.`,
      })
    }
  }

  // Positive: consistent positive cash flow
  const allPositive = forecast.every((f) => f.predictedNetCashFlow > 0)
  if (allPositive && forecast.length > 0) {
    const totalNet = forecast.reduce((s, f) => s + f.predictedNetCashFlow, 0)
    alerts.push({
      type: 'positive',
      severity: 'info',
      title: 'Healthy cash flow projected',
      detail: `Net positive cash flow of ~$${Math.round(totalNet).toLocaleString()} expected over the next ${forecast.length} months.`,
    })
  }

  return alerts
}

// ─── MAIN EXPORT ───────────────────────────────────────────────────────────

export function generateCashFlowForecast(
  statements: StatementSummary[],
  currentYear: number,
  currentMonth: number
): CashFlowForecast {
  // 1. Bucket all transactions by month
  const buckets = bucketByMonth(statements)

  // Calculate total months covered for frequency classification
  const allMonthKeys = Array.from(buckets.keys())
  let totalMonthsCovered = 1
  if (allMonthKeys.length >= 2) {
    const monthNums = allMonthKeys.map((k) => {
      const [y, m] = k.split('-').map(Number)
      return y * 12 + m
    })
    totalMonthsCovered = Math.max(...monthNums) - Math.min(...monthNums) + 1
  }

  // 2. Detect recurring transactions
  const recurringCandidates = detectRecurring(buckets)
  const incomeCandidates = recurringCandidates.filter((c) => c.isIncome)
  const expenseCandidates = recurringCandidates.filter((c) => !c.isIncome)

  const recurringIncome = buildRecurringItems(incomeCandidates, totalMonthsCovered)
  const recurringExpenses = buildRecurringItems(expenseCandidates, totalMonthsCovered)

  // 3. Compute 3-month moving average for non-recurring baseline
  const { avgIncome, avgExpenses, monthsUsed } = computeMovingAverage(
    buckets, currentYear, currentMonth, 3
  )

  // Subtract recurring totals from averages to get non-recurring portion
  const monthlyRecurringIncome = recurringIncome
    .filter((r) => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)
  const monthlyRecurringExpenses = recurringExpenses
    .filter((r) => r.frequency === 'monthly')
    .reduce((s, r) => s + r.amount, 0)

  const nonRecurringIncome = Math.max(0, avgIncome - monthlyRecurringIncome)
  const nonRecurringExpenses = Math.max(0, avgExpenses - monthlyRecurringExpenses)

  // 4. Generate forecast for next 3 months
  const forecast: ForecastMonth[] = []

  for (let i = 1; i <= 3; i++) {
    const { year, month } = advanceMonth(currentYear, currentMonth, i)
    const recurring = forecastRecurringForMonth(
      [...recurringIncome, ...recurringExpenses],
      year,
      month
    )

    const predictedIncome = Math.round((recurring.income + nonRecurringIncome) * 100) / 100
    const predictedExpenses = Math.round((recurring.expenses + nonRecurringExpenses) * 100) / 100
    const predictedNetCashFlow = Math.round((predictedIncome - predictedExpenses) * 100) / 100

    // Confidence: higher with more data and more recurring items
    let confidenceLevel: 'high' | 'medium' | 'low' = 'low'
    if (monthsUsed >= 3 && recurringIncome.length > 0) {
      confidenceLevel = 'high'
    } else if (monthsUsed >= 2) {
      confidenceLevel = 'medium'
    }

    const hasRecurring = recurringIncome.length > 0 || recurringExpenses.length > 0
    let basis: string
    if (hasRecurring && monthsUsed >= 3) {
      basis = `Based on recurring patterns + ${monthsUsed}-month average`
    } else if (hasRecurring) {
      basis = 'Based on recurring pattern'
    } else if (monthsUsed > 0) {
      basis = `Based on ${monthsUsed}-month average`
    } else {
      basis = 'Insufficient data for reliable forecast'
      confidenceLevel = 'low'
    }

    forecast.push({
      year,
      month,
      label: monthLabel(year, month),
      predictedIncome,
      predictedExpenses,
      predictedNetCashFlow,
      confidenceLevel,
      basis,
    })
  }

  // 5. Seasonal patterns
  const seasonalPatterns = detectSeasonalPatterns(buckets)

  // 6. Calculate runway if net cash flow is negative
  let runwayMonths: number | null = null
  if (forecast.length > 0) {
    const avgNetCashFlow =
      forecast.reduce((s, f) => s + f.predictedNetCashFlow, 0) / forecast.length
    if (avgNetCashFlow < 0) {
      // Estimate current cash from the most recent closing balance
      let currentCash = 0
      for (const statement of statements) {
        if (statement.closingBalance !== null && statement.closingBalance !== undefined) {
          currentCash = Math.max(currentCash, statement.closingBalance)
        }
      }
      if (currentCash > 0) {
        runwayMonths = Math.floor(currentCash / Math.abs(avgNetCashFlow))
      } else {
        // No balance data -- report 0 to signal negative trend without false precision
        runwayMonths = 0
      }
    }
  }

  // 7. Generate alerts
  const alerts = generateAlerts(forecast, recurringIncome, recurringExpenses, buckets, runwayMonths)

  return {
    currentMonth: { year: currentYear, month: currentMonth },
    forecast,
    recurringIncome,
    recurringExpenses,
    seasonalPatterns,
    runwayMonths,
    alerts,
  }
}
