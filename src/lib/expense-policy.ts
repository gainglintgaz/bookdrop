// expense-policy.ts — Automated expense policy compliance engine
// Checks transactions against configurable business expense policies and flags violations.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRule {
  id: string
  name: string
  description: string
  category: string
  condition:
    | 'max-per-transaction'
    | 'max-per-month'
    | 'max-per-vendor'
    | 'blocked-category'
    | 'requires-approval'
    | 'weekend-only'
    | 'business-hours'
  threshold?: number
  enabled: boolean
}

export interface PolicyViolation {
  ruleId: string
  ruleName: string
  transactionDate: string
  transactionDescription: string
  transactionAmount: number
  severity: 'critical' | 'warning' | 'info'
  explanation: string
  recommendation: string
}

export interface PolicyReport {
  violations: PolicyViolation[]
  compliant: number
  violationRate: number
  totalAtRisk: number
  byRule: Array<{ ruleId: string; ruleName: string; count: number; totalAmount: number }>
  grade: 'Compliant' | 'Minor Issues' | 'Needs Review' | 'Non-Compliant'
  summary: string
}

// ---------------------------------------------------------------------------
// Transaction type used as input
// ---------------------------------------------------------------------------

interface Transaction {
  date: string
  description: string
  amount: number
  type: 'credit' | 'debit'
  category?: string
}

// ---------------------------------------------------------------------------
// Category detection helpers
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  meals: [
    'restaurant', 'cafe', 'coffee', 'doordash', 'grubhub', 'uber eats',
    'ubereats', 'starbucks', 'mcdonald', 'chipotle', 'panera', 'subway',
    'dining', 'lunch', 'dinner', 'breakfast', 'pizza', 'taco', 'burger',
    'deli', 'bakery', 'catering', 'food', 'bistro', 'grill',
  ],
  entertainment: [
    'entertainment', 'theater', 'theatre', 'concert', 'sporting event',
    'tickets', 'cinema', 'movies', 'netflix', 'spotify', 'golf',
    'bowling', 'amusement', 'club', 'bar', 'lounge', 'nightclub',
    'event', 'ticketmaster', 'stubhub',
  ],
  travel: [
    'airline', 'flight', 'hotel', 'motel', 'airbnb', 'vrbo', 'expedia',
    'booking.com', 'marriott', 'hilton', 'hyatt', 'rental car', 'hertz',
    'enterprise', 'avis', 'uber', 'lyft', 'taxi', 'amtrak', 'delta',
    'united', 'american airlines', 'southwest', 'jetblue', 'frontier',
    'travel', 'lodge', 'resort', 'inn',
  ],
  office: [
    'office depot', 'staples', 'amazon', 'supplies', 'paper', 'ink',
    'toner', 'furniture', 'desk', 'chair', 'monitor', 'keyboard',
  ],
  software: [
    'software', 'saas', 'subscription', 'adobe', 'microsoft', 'google',
    'slack', 'zoom', 'dropbox', 'github', 'aws', 'azure', 'heroku',
    'vercel', 'netlify',
  ],
}

function inferCategory(description: string, explicitCategory?: string): string {
  if (explicitCategory) return explicitCategory.toLowerCase()
  const lower = description.toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return cat
  }
  return 'uncategorized'
}

/** Extract a normalised vendor name from a transaction description. */
function extractVendor(description: string): string {
  return description
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ')
}

/** Check if a date string falls on a weekend (Saturday or Sunday). */
function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr)
  const day = d.getUTCDay()
  return day === 0 || day === 6
}

/** Check if a number is "round" (divisible by 100 with no cents). */
function isRoundNumber(amount: number): boolean {
  return amount >= 1000 && amount % 100 === 0
}

/** Format a dollar amount for display. */
function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

// ---------------------------------------------------------------------------
// Default policies
// ---------------------------------------------------------------------------

export function getDefaultPolicies(): PolicyRule[] {
  return [
    {
      id: 'max-txn-500',
      name: 'Large Transaction (>$500)',
      description: 'Transactions over $500 require documented approval',
      category: '*',
      condition: 'max-per-transaction',
      threshold: 500,
      enabled: true,
    },
    {
      id: 'max-vendor-2000',
      name: 'Vendor Monthly Limit ($2,000)',
      description: 'No single vendor should exceed $2,000 in a calendar month',
      category: '*',
      condition: 'max-per-vendor',
      threshold: 2000,
      enabled: true,
    },
    {
      id: 'max-monthly-5000',
      name: 'Monthly Expense Threshold ($5,000)',
      description: 'Total monthly expenses exceeding $5,000 should be reviewed',
      category: '*',
      condition: 'max-per-month',
      threshold: 5000,
      enabled: true,
    },
    {
      id: 'meals-100',
      name: 'Meal Expense Limit ($100)',
      description: 'Individual meal expenses over $100 attract IRS scrutiny',
      category: 'meals',
      condition: 'max-per-transaction',
      threshold: 100,
      enabled: true,
    },
    {
      id: 'entertainment-250',
      name: 'Entertainment Limit ($250)',
      description: 'Entertainment expenses over $250 per transaction are flagged',
      category: 'entertainment',
      condition: 'max-per-transaction',
      threshold: 250,
      enabled: true,
    },
    {
      id: 'travel-1000',
      name: 'Travel Expense Flag ($1,000)',
      description: 'Travel expenses over $1,000 per transaction are flagged for review',
      category: 'travel',
      condition: 'max-per-transaction',
      threshold: 1000,
      enabled: true,
    },
    {
      id: 'weekend-200',
      name: 'Weekend Transaction Flag ($200)',
      description: 'Weekend transactions over $200 may be personal expenses',
      category: '*',
      condition: 'weekend-only',
      threshold: 200,
      enabled: true,
    },
    {
      id: 'round-number-1000',
      name: 'Round Number Flag ($1,000+)',
      description: 'Round-dollar transactions of $1,000+ should be verified',
      category: '*',
      condition: 'requires-approval',
      threshold: 1000,
      enabled: true,
    },
  ]
}

// ---------------------------------------------------------------------------
// Severity mapping for default rules
// ---------------------------------------------------------------------------

const SEVERITY_MAP: Record<string, 'critical' | 'warning' | 'info'> = {
  'max-txn-500': 'warning',
  'max-vendor-2000': 'warning',
  'max-monthly-5000': 'info',
  'meals-100': 'warning',
  'entertainment-250': 'warning',
  'travel-1000': 'info',
  'weekend-200': 'info',
  'round-number-1000': 'info',
}

function severityFor(ruleId: string): 'critical' | 'warning' | 'info' {
  return SEVERITY_MAP[ruleId] ?? 'warning'
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function checkExpensePolicy(
  transactions: Transaction[],
  policies?: PolicyRule[]
): PolicyReport {
  const rules = (policies ?? getDefaultPolicies()).filter((r) => r.enabled)
  const violations: PolicyViolation[] = []

  // Only look at debits (expenses)
  const expenses = transactions.filter((t) => t.type === 'debit')

  // Pre-compute aggregates
  const vendorMonthlyTotals = new Map<string, number>()
  let totalMonthlyExpenses = 0

  for (const txn of expenses) {
    const vendor = extractVendor(txn.description)
    const month = txn.date.slice(0, 7) // YYYY-MM
    const key = `${vendor}::${month}`
    vendorMonthlyTotals.set(key, (vendorMonthlyTotals.get(key) ?? 0) + Math.abs(txn.amount))
    totalMonthlyExpenses += Math.abs(txn.amount)
  }

  // Track which transactions have at least one violation
  const violatingTxnIndices = new Set<number>()

  // Track vendor-month pairs and monthly totals already flagged to avoid duplicates
  const flaggedVendorMonths = new Set<string>()
  const flaggedMonths = new Set<string>()

  for (let i = 0; i < expenses.length; i++) {
    const txn = expenses[i]
    const amount = Math.abs(txn.amount)
    const category = inferCategory(txn.description, txn.category)
    const vendor = extractVendor(txn.description)
    const month = txn.date.slice(0, 7)

    for (const rule of rules) {
      const categoryMatch = rule.category === '*' || rule.category === category

      if (!categoryMatch) continue

      let violated = false
      let explanation = ''
      let recommendation = ''

      switch (rule.condition) {
        case 'max-per-transaction': {
          if (rule.threshold !== undefined && amount > rule.threshold) {
            violated = true
            explanation = `Transaction of ${fmt(amount)} exceeds the ${fmt(rule.threshold)} limit for ${rule.category === '*' ? 'all categories' : rule.category}.`
            recommendation =
              rule.category === 'meals'
                ? 'Document attendees, business purpose, and keep itemized receipt for IRS compliance.'
                : rule.category === 'entertainment'
                  ? 'Ensure entertainment expense has documented business purpose. Post-2017 TCJA, most entertainment is non-deductible.'
                  : rule.category === 'travel'
                    ? 'Verify travel was for business purposes. Retain boarding passes, hotel folios, and itineraries.'
                    : 'Obtain manager approval and attach supporting documentation.'
          }
          break
        }

        case 'max-per-vendor': {
          const vendorKey = `${vendor}::${month}`
          const vendorTotal = vendorMonthlyTotals.get(vendorKey) ?? 0
          if (
            rule.threshold !== undefined &&
            vendorTotal > rule.threshold &&
            !flaggedVendorMonths.has(`${rule.id}::${vendorKey}`)
          ) {
            violated = true
            flaggedVendorMonths.add(`${rule.id}::${vendorKey}`)
            explanation = `Vendor "${vendor}" has ${fmt(vendorTotal)} in expenses for ${month}, exceeding the ${fmt(rule.threshold)} monthly vendor limit.`
            recommendation = 'Review vendor relationship. Consider whether a contract or purchase order is needed for recurring high-volume vendors.'
          }
          break
        }

        case 'max-per-month': {
          if (
            rule.threshold !== undefined &&
            totalMonthlyExpenses > rule.threshold &&
            !flaggedMonths.has(`${rule.id}::${month}`)
          ) {
            violated = true
            flaggedMonths.add(`${rule.id}::${month}`)
            explanation = `Total monthly expenses of ${fmt(totalMonthlyExpenses)} exceed the ${fmt(rule.threshold)} review threshold.`
            recommendation = 'Conduct a line-by-line review of all expenses this month. Look for cost-saving opportunities or misclassified personal expenses.'
          }
          break
        }

        case 'weekend-only': {
          if (rule.threshold !== undefined && isWeekend(txn.date) && amount > rule.threshold) {
            violated = true
            explanation = `Weekend transaction of ${fmt(amount)} on ${txn.date} exceeds the ${fmt(rule.threshold)} weekend threshold.`
            recommendation = 'Confirm this was a legitimate business expense. Weekend transactions above threshold may indicate personal use.'
          }
          break
        }

        case 'requires-approval': {
          // Used for the round-number check
          if (rule.threshold !== undefined && isRoundNumber(amount) && amount >= rule.threshold) {
            violated = true
            explanation = `Round-dollar transaction of ${fmt(amount)} — these are uncommon in legitimate business expenses and may warrant verification.`
            recommendation = 'Verify amount with vendor invoice or receipt. Round numbers can indicate estimated amounts or fictitious entries.'
          }
          break
        }

        case 'blocked-category': {
          violated = true
          explanation = `Transaction in blocked category "${category}" is not allowed under current policy.`
          recommendation = 'This expense category is prohibited. Seek exception approval or reclassify if incorrectly categorised.'
          break
        }

        case 'business-hours': {
          // Placeholder for future: flag transactions outside business hours
          break
        }
      }

      if (violated) {
        violatingTxnIndices.add(i)
        violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          transactionDate: txn.date,
          transactionDescription: txn.description,
          transactionAmount: amount,
          severity: severityFor(rule.id),
          explanation,
          recommendation,
        })
      }
    }
  }

  // Compute summary stats
  const compliant = expenses.length - violatingTxnIndices.size
  const violationRate = expenses.length > 0 ? (violatingTxnIndices.size / expenses.length) * 100 : 0
  const totalAtRisk = violations.reduce((sum, v) => sum + v.transactionAmount, 0)

  // Group by rule
  const ruleMap = new Map<string, { ruleName: string; count: number; totalAmount: number }>()
  for (const v of violations) {
    const existing = ruleMap.get(v.ruleId)
    if (existing) {
      existing.count++
      existing.totalAmount += v.transactionAmount
    } else {
      ruleMap.set(v.ruleId, { ruleName: v.ruleName, count: 1, totalAmount: v.transactionAmount })
    }
  }
  const byRule = Array.from(ruleMap.entries()).map(([ruleId, data]) => ({
    ruleId,
    ...data,
  }))

  // Determine grade
  const criticalCount = violations.filter((v) => v.severity === 'critical').length
  const warningCount = violations.filter((v) => v.severity === 'warning').length
  let grade: PolicyReport['grade']
  if (criticalCount > 0 || warningCount > 5) {
    grade = 'Non-Compliant'
  } else if (warningCount > 2) {
    grade = 'Needs Review'
  } else if (warningCount > 0 || violations.length > 0) {
    grade = 'Minor Issues'
  } else {
    grade = 'Compliant'
  }

  // Build summary
  const summary = buildSummary(expenses.length, compliant, violations.length, violationRate, totalAtRisk, grade)

  return {
    violations,
    compliant,
    violationRate: Math.round(violationRate * 100) / 100,
    totalAtRisk: Math.round(totalAtRisk * 100) / 100,
    byRule,
    grade,
    summary,
  }
}

function buildSummary(
  totalTxns: number,
  compliant: number,
  violationCount: number,
  violationRate: number,
  totalAtRisk: number,
  grade: string
): string {
  if (violationCount === 0) {
    return `All ${totalTxns} expense transactions are compliant with current policies. No issues found.`
  }
  return (
    `Reviewed ${totalTxns} expense transactions. ${compliant} passed all policy checks. ` +
    `${violationCount} violation${violationCount === 1 ? '' : 's'} detected (${violationRate.toFixed(1)}% of transactions). ` +
    `Total amount at risk: ${fmt(totalAtRisk)}. Overall compliance grade: ${grade}.`
  )
}

// ---------------------------------------------------------------------------
// HTML report generation + download
// ---------------------------------------------------------------------------

export function downloadPolicyReport(report: PolicyReport, businessName: string): void {
  const html = generatePolicyReportHTML(report, businessName)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `expense-policy-report-${businessName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function generatePolicyReportHTML(report: PolicyReport, businessName: string): string {
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const gradeColor: Record<string, string> = {
    Compliant: '#16a34a',
    'Minor Issues': '#ca8a04',
    'Needs Review': '#ea580c',
    'Non-Compliant': '#dc2626',
  }

  const severityBadge = (severity: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      critical: { bg: '#fef2f2', text: '#dc2626' },
      warning: { bg: '#fffbeb', text: '#d97706' },
      info: { bg: '#eff6ff', text: '#2563eb' },
    }
    const c = colors[severity] ?? colors.info
    return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:600;background:${c.bg};color:${c.text};text-transform:uppercase;">${severity}</span>`
  }

  const violationRows = report.violations
    .map(
      (v) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${v.transactionDate}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(v.transactionDescription)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;">${fmt(v.transactionAmount)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(v.ruleName)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">${severityBadge(v.severity)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#4b5563;">${escapeHtml(v.explanation)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;">${escapeHtml(v.recommendation)}</td>
      </tr>`
    )
    .join('')

  const ruleBreakdownRows = report.byRule
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.ruleName)}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.count}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;text-align:right;font-family:monospace;">${fmt(r.totalAmount)}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Expense Policy Compliance Report — ${escapeHtml(businessName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; background: #f9fafb; line-height: 1.5; }
    .container { max-width: 1100px; margin: 0 auto; padding: 40px 24px; }
    .header { text-align: center; margin-bottom: 40px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .header p { color: #6b7280; font-size: 14px; }
    .card { background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; padding: 28px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .card h2 { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #111827; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; text-align: center; }
    .stat-card .value { font-size: 32px; font-weight: 700; }
    .stat-card .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { padding: 10px 14px; text-align: left; font-weight: 600; color: #374151; background: #f9fafb; border-bottom: 2px solid #e5e7eb; }
    th.right { text-align: right; }
    th.center { text-align: center; }
    .summary-text { font-size: 15px; color: #374151; line-height: 1.7; }
    .grade-badge { display: inline-block; padding: 6px 20px; border-radius: 9999px; font-size: 16px; font-weight: 700; color: #fff; }
    .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    @media print {
      body { background: #fff; }
      .container { padding: 20px; }
      .card { box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Expense Policy Compliance Report</h1>
      <p>${escapeHtml(businessName)} &mdash; Generated ${now}</p>
    </div>

    <!-- Grade & Summary -->
    <div class="card" style="text-align:center;">
      <div style="margin-bottom:16px;">
        <span class="grade-badge" style="background:${gradeColor[report.grade] ?? '#6b7280'};">${report.grade}</span>
      </div>
      <p class="summary-text">${escapeHtml(report.summary)}</p>
    </div>

    <!-- Key Metrics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="value" style="color:#16a34a;">${report.compliant}</div>
        <div class="label">Compliant Transactions</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:${report.violations.length > 0 ? '#dc2626' : '#16a34a'};">${report.violations.length}</div>
        <div class="label">Violations Found</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:#2563eb;">${report.violationRate.toFixed(1)}%</div>
        <div class="label">Violation Rate</div>
      </div>
      <div class="stat-card">
        <div class="value" style="color:#ea580c;">${fmt(report.totalAtRisk)}</div>
        <div class="label">Total Amount at Risk</div>
      </div>
    </div>

    <!-- Breakdown by Rule -->
    ${
      report.byRule.length > 0
        ? `<div class="card">
      <h2>Violations by Policy Rule</h2>
      <table>
        <thead>
          <tr>
            <th>Policy Rule</th>
            <th class="center">Violations</th>
            <th class="right">Total Amount</th>
          </tr>
        </thead>
        <tbody>${ruleBreakdownRows}</tbody>
      </table>
    </div>`
        : ''
    }

    <!-- Violation Details -->
    ${
      report.violations.length > 0
        ? `<div class="card">
      <h2>Violation Details</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th class="right">Amount</th>
            <th>Rule</th>
            <th class="center">Severity</th>
            <th>Explanation</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>${violationRows}</tbody>
      </table>
    </div>`
        : `<div class="card" style="text-align:center;padding:40px;">
      <p style="font-size:18px;color:#16a34a;font-weight:600;">All transactions are compliant. No violations found.</p>
    </div>`
    }

    <!-- Disclaimer -->
    <div class="card" style="background:#fffbeb;border-color:#fde68a;">
      <h2 style="font-size:14px;color:#92400e;">Disclaimer</h2>
      <p style="font-size:13px;color:#78350f;line-height:1.6;">
        This report is generated automatically based on configurable policy rules and transaction data provided.
        It is intended as a compliance screening tool and does not constitute professional tax or legal advice.
        All flagged items should be reviewed by a qualified accountant or compliance officer before taking action.
        Policy thresholds should be adjusted to match your organization's specific expense policies.
      </p>
    </div>

    <div class="footer">
      <p>Generated by BookDrop Expense Policy Engine &mdash; ${now}</p>
      <p style="margin-top:4px;">Confidential &mdash; for internal use and audit purposes only</p>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
