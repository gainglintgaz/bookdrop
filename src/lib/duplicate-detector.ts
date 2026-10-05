// duplicate-detector.ts — Audit engine for catching duplicate, missing, and anomalous transactions

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateGroup {
  transactions: Array<{
    date: string
    description: string
    amount: number
    statementSource: string
  }>
  reason: string
  confidence: 'high' | 'medium' | 'low'
  totalAmount: number
  recommendation: string
}

export interface MissingRecurring {
  description: string
  expectedAmount: number
  expectedDate: string
  lastSeen: string
  category: string
  severity: 'critical' | 'warning'
  recommendation: string
}

export interface UnusualTransaction {
  date: string
  description: string
  amount: number
  reason: string
  averageAmount: number
  zScore: number
  /** Derived from |zScore|: >=3 critical, otherwise warning. Used by source-provenance UI. */
  severity: 'critical' | 'warning'
  recommendation: string
}

export interface AuditReport {
  duplicates: DuplicateGroup[]
  missingRecurring: MissingRecurring[]
  unusualTransactions: UnusualTransaction[]
  roundNumberTransactions: Array<{
    date: string
    description: string
    amount: number
  }>
  weekendBusinessTransactions: Array<{
    date: string
    description: string
    amount: number
  }>
  sequentialPayments: Array<{
    vendor: string
    amounts: number[]
    dates: string[]
    note: string
  }>
  summary: {
    potentialIssues: number
    estimatedRiskAmount: number
    criticalItems: number
    warningItems: number
  }
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  gradeExplanation: string
}

type Transaction = {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
}

// ---------------------------------------------------------------------------
// String similarity (Levenshtein-based, no external deps)
// ---------------------------------------------------------------------------

function levenshtein(a: string, b: string): number {
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la

  // Use two rows instead of full matrix for memory efficiency
  let prev = Array.from({ length: lb + 1 }, (_, i) => i)
  let curr = new Array<number>(lb + 1)

  for (let i = 1; i <= la; i++) {
    curr[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[lb]
}

function similarity(a: string, b: string): number {
  const al = a.toLowerCase().trim()
  const bl = b.toLowerCase().trim()
  if (al === bl) return 1

  // Fast substring check first
  if (al.includes(bl) || bl.includes(al)) return 0.9

  const maxLen = Math.max(al.length, bl.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(al, bl) / maxLen
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(a: string, b: string): number {
  const da = new Date(a)
  const db = new Date(b)
  return Math.abs(da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24)
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

function normalizeVendor(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = mean(nums)
  const variance = nums.reduce((s, n) => s + (n - m) ** 2, 0) / nums.length
  return Math.sqrt(variance)
}

const ROUND_AMOUNTS = new Set([100, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000, 10000])

const CRITICAL_KEYWORDS = [
  'payroll',
  'insurance',
  'tax',
  'irs',
  'mortgage',
  'loan payment',
  'workers comp',
  'health insurance',
  'liability',
]

function isCriticalCategory(desc: string): boolean {
  const lower = desc.toLowerCase()
  return CRITICAL_KEYWORDS.some((kw) => lower.includes(kw))
}

// ---------------------------------------------------------------------------
// Detection functions
// ---------------------------------------------------------------------------

function detectDuplicates(transactions: Transaction[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = []
  const used = new Set<number>()

  for (let i = 0; i < transactions.length; i++) {
    if (used.has(i)) continue
    const cluster: number[] = [i]

    for (let j = i + 1; j < transactions.length; j++) {
      if (used.has(j)) continue
      const a = transactions[i]
      const b = transactions[j]

      // Same amount is a prerequisite
      if (Math.abs(a.amount - b.amount) > 0.01) continue

      const days = daysBetween(a.date, b.date)
      const sim = similarity(a.description, b.description)

      // Exact duplicate (same description, same date)
      if (sim > 0.85 && days === 0) {
        cluster.push(j)
        continue
      }

      // Near-duplicate (similar vendor, within 3 days)
      if (sim > 0.6 && days <= 3) {
        cluster.push(j)
        continue
      }

      // Same amount, same vendor across different dates (possible cross-statement dup)
      if (sim > 0.85 && days <= 3) {
        cluster.push(j)
      }
    }

    if (cluster.length > 1) {
      for (const idx of cluster) used.add(idx)

      const items = cluster.map((idx) => {
        const t = transactions[idx]
        return {
          date: t.date,
          description: t.description,
          amount: t.amount,
          statementSource: t.date, // use date as proxy for statement source
        }
      })

      const allSameDate = items.every((it) => it.date === items[0].date)
      const simScore = similarity(items[0].description, items[1].description)

      let confidence: 'high' | 'medium' | 'low'
      let reason: string
      if (simScore > 0.85 && allSameDate) {
        confidence = 'high'
        reason = 'Exact duplicate: same amount, same vendor, same date'
      } else if (simScore > 0.85) {
        confidence = 'high'
        reason = 'Same amount and same vendor within 3 days'
      } else {
        confidence = 'medium'
        reason = 'Same amount and similar vendor within 3 days'
      }

      groups.push({
        transactions: items,
        reason,
        confidence,
        totalAmount: items.reduce((s, it) => s + it.amount, 0),
        recommendation:
          confidence === 'high'
            ? "Likely duplicate charge — verify this isn't a double payment"
            : 'Verify these are intentional separate transactions',
      })
    }
  }

  return groups
}

function detectMissingRecurring(
  current: Transaction[],
  previous: Transaction[]
): MissingRecurring[] {
  const missing: MissingRecurring[] = []

  // Group previous month by normalized vendor
  const prevByVendor = new Map<string, Transaction[]>()
  for (const t of previous) {
    const vendor = normalizeVendor(t.description)
    if (!prevByVendor.has(vendor)) prevByVendor.set(vendor, [])
    prevByVendor.get(vendor)!.push(t)
  }

  // Group current month by normalized vendor
  const currVendors = new Set<string>()
  for (const t of current) {
    currVendors.add(normalizeVendor(t.description))
  }

  // Also build a set of fuzzy-matched current vendors for better matching
  for (const [prevVendor, prevTxns] of prevByVendor) {
    // Check if this vendor appears in current month (exact or fuzzy)
    let found = false
    for (const cv of currVendors) {
      if (similarity(prevVendor, cv) > 0.7) {
        found = true
        break
      }
    }

    if (!found) {
      const lastTxn = prevTxns[prevTxns.length - 1]
      const avgAmount = mean(prevTxns.map((t) => t.amount))
      const critical = isCriticalCategory(lastTxn.description)

      missing.push({
        description: lastTxn.description,
        expectedAmount: Math.round(avgAmount * 100) / 100,
        expectedDate: lastTxn.date, // approximate based on last occurrence
        lastSeen: lastTxn.date,
        category: critical ? 'essential' : 'recurring',
        severity: critical ? 'critical' : 'warning',
        recommendation: critical
          ? `CRITICAL: ${lastTxn.description} was expected but not found this month. Verify payment was made.`
          : `Recurring charge for ${lastTxn.description} ($${avgAmount.toFixed(2)}) not found this month.`,
      })
    }
  }

  return missing
}

function detectUnusualTransactions(transactions: Transaction[]): UnusualTransaction[] {
  const unusual: UnusualTransaction[] = []

  // Group by normalized vendor
  const byVendor = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const vendor = normalizeVendor(t.description)
    if (!byVendor.has(vendor)) byVendor.set(vendor, [])
    byVendor.get(vendor)!.push(t)
  }

  for (const [, txns] of byVendor) {
    if (txns.length < 3) continue // need at least 3 data points for meaningful stats

    const amounts = txns.map((t) => t.amount)
    const m = mean(amounts)
    const sd = stddev(amounts)

    if (sd === 0) continue // all same amount, nothing unusual

    for (const t of txns) {
      const z = Math.abs((t.amount - m) / sd)
      if (z > 2) {
        const ratio = t.amount / m
        unusual.push({
          date: t.date,
          description: t.description,
          amount: t.amount,
          reason: `${ratio.toFixed(1)}x ${ratio > 1 ? 'higher' : 'lower'} than average for this vendor`,
          averageAmount: Math.round(m * 100) / 100,
          zScore: Math.round(z * 100) / 100,
          severity: z > 3 ? 'critical' : 'warning',
          recommendation:
            z > 3
              ? 'Highly unusual amount — verify this charge immediately'
              : 'Unusual amount — worth double-checking',
        })
      }
    }
  }

  return unusual
}

function detectRoundNumbers(
  transactions: Transaction[]
): Array<{ date: string; description: string; amount: number }> {
  return transactions
    .filter((t) => {
      const abs = Math.abs(t.amount)
      return ROUND_AMOUNTS.has(abs) || (abs >= 100 && abs % 100 === 0)
    })
    .map((t) => ({ date: t.date, description: t.description, amount: t.amount }))
}

function detectWeekendBusiness(
  transactions: Transaction[]
): Array<{ date: string; description: string; amount: number }> {
  return transactions
    .filter((t) => isWeekend(t.date))
    .map((t) => ({ date: t.date, description: t.description, amount: t.amount }))
}

function detectSequentialPayments(
  transactions: Transaction[]
): Array<{ vendor: string; amounts: number[]; dates: string[]; note: string }> {
  const results: Array<{
    vendor: string
    amounts: number[]
    dates: string[]
    note: string
  }> = []

  // Group by normalized vendor
  const byVendor = new Map<string, Transaction[]>()
  for (const t of transactions) {
    const vendor = normalizeVendor(t.description)
    if (!byVendor.has(vendor)) byVendor.set(vendor, [])
    byVendor.get(vendor)!.push(t)
  }

  for (const [, txns] of byVendor) {
    if (txns.length < 2) continue

    // Sort by date
    const sorted = [...txns].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Find clusters of transactions within 3 days of each other
    let cluster: Transaction[] = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      if (daysBetween(sorted[i].date, sorted[i - 1].date) <= 3) {
        cluster.push(sorted[i])
      } else {
        if (cluster.length >= 2) {
          const total = cluster.reduce((s, t) => s + t.amount, 0)
          results.push({
            vendor: cluster[0].description, // use original description
            amounts: cluster.map((t) => t.amount),
            dates: cluster.map((t) => t.date),
            note: `${cluster.length} payments totaling $${total.toFixed(2)} within ${Math.ceil(daysBetween(cluster[0].date, cluster[cluster.length - 1].date))} days — possible split payment or processing error`,
          })
        }
        cluster = [sorted[i]]
      }
    }

    // Don't forget the last cluster
    if (cluster.length >= 2) {
      const total = cluster.reduce((s, t) => s + t.amount, 0)
      results.push({
        vendor: cluster[0].description,
        amounts: cluster.map((t) => t.amount),
        dates: cluster.map((t) => t.date),
        note: `${cluster.length} payments totaling $${total.toFixed(2)} within ${Math.ceil(daysBetween(cluster[0].date, cluster[cluster.length - 1].date))} days — possible split payment or processing error`,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

function calculateGrade(
  totalIssues: number
): { grade: 'A' | 'B' | 'C' | 'D' | 'F'; explanation: string } {
  if (totalIssues <= 1) {
    return {
      grade: 'A',
      explanation:
        totalIssues === 0
          ? 'Excellent — no issues detected. Data looks clean.'
          : 'Very good — only 1 minor item to review.',
    }
  }
  if (totalIssues <= 3) {
    return {
      grade: 'B',
      explanation: `Good — ${totalIssues} items flagged for review. A few things to double-check.`,
    }
  }
  if (totalIssues <= 6) {
    return {
      grade: 'C',
      explanation: `Fair — ${totalIssues} potential issues found. Recommend careful review.`,
    }
  }
  if (totalIssues <= 10) {
    return {
      grade: 'D',
      explanation: `Poor — ${totalIssues} issues detected. This data needs significant review.`,
    }
  }
  return {
    grade: 'F',
    explanation: `Critical — ${totalIssues} issues found. Do not proceed without thorough review.`,
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function runAuditChecks(
  transactions: Transaction[],
  previousMonthTransactions?: Transaction[]
): AuditReport {
  const duplicates = detectDuplicates(transactions)
  const missingRecurring = previousMonthTransactions
    ? detectMissingRecurring(transactions, previousMonthTransactions)
    : []
  const unusualTransactions = detectUnusualTransactions(transactions)
  const roundNumberTransactions = detectRoundNumbers(transactions)
  const weekendBusinessTransactions = detectWeekendBusiness(transactions)
  const sequentialPayments = detectSequentialPayments(transactions)

  const criticalItems = missingRecurring.filter((m) => m.severity === 'critical').length
  const warningItems = missingRecurring.filter((m) => m.severity === 'warning').length

  const duplicateRisk = duplicates.reduce((s, d) => s + d.totalAmount, 0)
  const unusualRisk = unusualTransactions.reduce(
    (s, u) => s + Math.abs(u.amount - u.averageAmount),
    0
  )
  const estimatedRiskAmount = Math.round((duplicateRisk + unusualRisk) * 100) / 100

  const potentialIssues =
    duplicates.length +
    missingRecurring.length +
    unusualTransactions.length +
    sequentialPayments.length

  const { grade, explanation } = calculateGrade(potentialIssues)

  return {
    duplicates,
    missingRecurring,
    unusualTransactions,
    roundNumberTransactions,
    weekendBusinessTransactions,
    sequentialPayments,
    summary: {
      potentialIssues,
      estimatedRiskAmount,
      criticalItems,
      warningItems,
    },
    grade,
    gradeExplanation: explanation,
  }
}
