// Tax Intelligence Engine
// Automates tax-related analysis bookkeepers do manually:
// deduction scanning, 1099 tracking, sales tax estimation, quarterly estimates

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeductionItem {
  description: string
  amount: number
  date: string
  irsCategory: string
  deductiblePercent: number
  deductibleAmount: number
  confidence: 'high' | 'medium' | 'low'
  note: string
}

export interface Vendor1099 {
  name: string
  totalPaid: number
  transactionCount: number
  needs1099: boolean
  threshold: number
  amountRemaining: number
  isPossibleContractor: boolean
}

export interface SalesTaxSummary {
  totalSalesTaxPaid: number
  estimatedSalesTaxCollected: number
  transactions: { date: string; description: string; amount: number; estimatedTax: number }[]
}

export interface TaxIntelligenceReport {
  deductions: {
    items: DeductionItem[]
    totalDeductible: number
    byCategory: { category: string; total: number; count: number }[]
    estimatedTaxSavings: number
    missedDeductions: string[]
  }
  vendors1099: Vendor1099[]
  salesTax: SalesTaxSummary
  quarterlyEstimate: {
    quarter: string
    estimatedTaxOwed: number
    nextDueDate: string
    basis: string
  }
  alerts: TaxAlert[]
  tips: string[]
}

export interface TaxAlert {
  type: 'deadline' | 'threshold' | 'compliance' | 'savings'
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EFFECTIVE_TAX_RATE = 0.25
const VENDOR_1099_THRESHOLD = 600
const ESTIMATED_SALES_TAX_RATE = 0.07 // national average approximation

interface DeductionRule {
  patterns: RegExp[]
  irsCategory: string
  deductiblePercent: number
  confidence: 'high' | 'medium' | 'low'
  note: string
}

const DEDUCTION_RULES: DeductionRule[] = [
  // Software & Subscriptions
  {
    patterns: [
      /ADOBE/i, /CREATIVE CLOUD/i, /MICROSOFT/i, /OFFICE 365/i,
      /GOOGLE WORKSPACE/i, /GSUITE/i, /DROPBOX/i, /SLACK/i, /ZOOM/i,
      /GITHUB/i, /ATLASSIAN/i, /JIRA/i, /NOTION/i, /FIGMA/i,
      /CANVA/i, /MAILCHIMP/i, /HUBSPOT/i, /SALESFORCE/i,
      /QUICKBOOKS/i, /XERO/i, /FRESHBOOKS/i, /SQUARESPACE/i,
      /SHOPIFY/i, /WORDPRESS/i, /GODADDY/i, /NAMECHEAP/i,
      /HEROKU/i, /AWS/i, /AMAZON WEB SERVICES/i, /DIGITALOCEAN/i,
      /VERCEL/i, /NETLIFY/i, /CLOUDFLARE/i, /DOCUSIGN/i,
      /CALENDLY/i, /LOOM/i, /GRAMMARLY/i, /1PASSWORD/i,
      /LASTPASS/i, /NORDVPN/i, /EXPRESSVPN/i,
    ],
    irsCategory: 'Software & Subscriptions',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Business software subscriptions are fully deductible.',
  },
  // Office Expenses & Supplies
  {
    patterns: [
      /STAPLES/i, /OFFICE DEPOT/i, /OFFICEMAX/i, /PAPER SOURCE/i,
      /ULINE/i, /AMAZON(?!.*WEB)/i, /TARGET/i, /WALMART/i,
    ],
    irsCategory: 'Office Expenses',
    deductiblePercent: 100,
    confidence: 'medium',
    note: 'Office supplies and equipment. Verify items are business-related.',
  },
  // Travel
  {
    patterns: [
      /UBER/i, /LYFT/i, /UNITED AIRLINES/i, /DELTA AIR/i,
      /AMERICAN AIR/i, /SOUTHWEST/i, /JETBLUE/i, /SPIRIT AIR/i,
      /FRONTIER AIR/i, /ALASKA AIR/i, /HERTZ/i, /ENTERPRISE RENT/i,
      /NATIONAL CAR/i, /AVIS/i, /BUDGET RENT/i, /TURO/i,
      /MARRIOTT/i, /HILTON/i, /HYATT/i, /IHG/i, /BEST WESTERN/i,
      /AIRBNB/i, /VRBO/i, /EXPEDIA/i, /BOOKING\.COM/i,
      /KAYAK/i, /PRICELINE/i, /AMTRAK/i, /GREYHOUND/i,
    ],
    irsCategory: 'Travel',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Business travel is fully deductible. Keep records of business purpose.',
  },
  // Meals (50% deductible)
  {
    patterns: [
      /CHIPOTLE/i, /PANERA/i, /STARBUCKS/i, /MCDONALD/i,
      /SUBWAY/i, /CHICK-FIL-A/i, /WENDY/i, /TACO BELL/i,
      /GRUBHUB/i, /DOORDASH/i, /UBER EATS/i, /POSTMATES/i,
      /RESTAURANT/i, /BISTRO/i, /GRILL/i, /PIZZA/i, /SUSHI/i,
      /CAFE/i, /COFFEE/i, /DINER/i, /BAR & GRILL/i,
      /APPLEBEE/i, /OLIVE GARDEN/i, /CHILI'?S/i, /IHOP/i,
      /DENNY'?S/i, /WAFFLE HOUSE/i, /PANDA EXPRESS/i,
      /FIVE GUYS/i, /IN-N-OUT/i, /SHAKE SHACK/i, /WINGSTOP/i,
    ],
    irsCategory: 'Meals (50%)',
    deductiblePercent: 50,
    confidence: 'medium',
    note: 'Meals are 50% deductible for business. Document attendees and business purpose.',
  },
  // Insurance
  {
    patterns: [
      /INSURANCE/i, /STATE FARM/i, /GEICO/i, /PROGRESSIVE/i,
      /ALLSTATE/i, /NATIONWIDE/i, /LIBERTY MUTUAL/i, /USAA/i,
      /HARTFORD/i, /HISCOX/i, /NEXT INSURANCE/i,
    ],
    irsCategory: 'Insurance',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Business insurance premiums are fully deductible.',
  },
  // Professional Services
  {
    patterns: [
      /LAW OFFICE/i, /ATTORNEY/i, /LEGAL/i, /CPA/i, /ACCOUNTANT/i,
      /ACCOUNTING/i, /TAX PREP/i, /H&R BLOCK/i, /TURBOTAX/i,
      /CONSULTING/i, /CONSULTANT/i, /ADVISORY/i, /BOOKKEEP/i,
    ],
    irsCategory: 'Professional Services',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Legal, accounting, and consulting fees are fully deductible.',
  },
  // Advertising & Marketing
  {
    patterns: [
      /FACEBOOK ADS/i, /META ADS/i, /GOOGLE ADS/i, /BING ADS/i,
      /LINKEDIN/i, /TWITTER ADS/i, /X ADS/i, /YELP/i,
      /VISTAPRINT/i, /MOO\.COM/i, /CONSTANT CONTACT/i,
      /HOOTSUITE/i, /BUFFER/i, /SEMRUSH/i, /AHREFS/i,
    ],
    irsCategory: 'Advertising & Marketing',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Advertising and marketing expenses are fully deductible.',
  },
  // Telecommunications
  {
    patterns: [
      /AT&T/i, /VERIZON/i, /T-MOBILE/i, /SPRINT/i, /COMCAST/i,
      /XFINITY/i, /SPECTRUM/i, /COX COMM/i, /CENTURYLINK/i,
      /FRONTIER COMM/i, /RINGCENTRAL/i, /VONAGE/i, /OOMA/i,
    ],
    irsCategory: 'Telecommunications',
    deductiblePercent: 100,
    confidence: 'medium',
    note: 'Business phone and internet are deductible. If shared with personal, deduct business portion only.',
  },
  // Education & Training
  {
    patterns: [
      /UDEMY/i, /COURSERA/i, /LINKEDIN LEARNING/i, /SKILLSHARE/i,
      /MASTERCLASS/i, /PLURALSIGHT/i, /TREEHOUSE/i,
      /CONFERENCE/i, /SEMINAR/i, /WORKSHOP/i, /WEBINAR/i,
    ],
    irsCategory: 'Education & Training',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Professional development and continuing education are fully deductible.',
  },
  // Shipping & Postage
  {
    patterns: [
      /USPS/i, /UPS/i, /FEDEX/i, /DHL/i, /STAMPS\.COM/i,
      /PIRATE SHIP/i, /SHIPSTATION/i,
    ],
    irsCategory: 'Shipping & Postage',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Business shipping and postage are fully deductible.',
  },
  // Bank & Payment Processing Fees
  {
    patterns: [
      /STRIPE/i, /SQUARE/i, /PAYPAL/i, /VENMO BUSINESS/i,
      /MERCHANT FEE/i, /PROCESSING FEE/i, /BANK FEE/i,
      /SERVICE CHARGE/i, /MONTHLY FEE/i, /WIRE FEE/i,
    ],
    irsCategory: 'Bank & Processing Fees',
    deductiblePercent: 100,
    confidence: 'high',
    note: 'Payment processing and bank fees for business accounts are fully deductible.',
  },
]

const CONTRACTOR_PATTERNS = [
  /CONSULT/i, /FREELANC/i, /CONTRACT/i, /DESIGN(?:ER|S)?/i,
  /DEVELOP(?:ER|MENT)/i, /MARKETING/i, /COPYWRITE/i,
  /PHOTOGRA/i, /VIDEOGRA/i, /VIRTUAL ASSIST/i, /VA SERVICE/i,
  /BOOKKEEP/i, /CLEAN(?:ER|ING)/i, /LANDSCAP/i, /PLUMB/i,
  /ELECTRI/i, /HANDYMAN/i, /REPAIR SERVICE/i, /MAINTENANC/i,
]

const RETAIL_PATTERNS = [
  /STAPLES/i, /OFFICE DEPOT/i, /HOME DEPOT/i, /LOWES/i,
  /WALMART/i, /TARGET/i, /BEST BUY/i, /COSTCO/i, /SAMS CLUB/i,
  /AMAZON(?!.*WEB)/i, /IKEA/i, /BED BATH/i,
]

// Quarterly tax deadlines (month is 0-indexed in Date, but we store as strings)
const QUARTERLY_DEADLINES: { quarter: string; dueMonth: number; dueDay: number; nextYear: boolean }[] = [
  { quarter: 'Q1', dueMonth: 4, dueDay: 15, nextYear: false },  // April 15
  { quarter: 'Q2', dueMonth: 6, dueDay: 15, nextYear: false },  // June 15
  { quarter: 'Q3', dueMonth: 9, dueDay: 15, nextYear: false },  // September 15
  { quarter: 'Q4', dueMonth: 1, dueDay: 15, nextYear: true },   // January 15 next year
]

// Common missed deductions bookkeepers should look for
const ALL_MISSED_DEDUCTION_SUGGESTIONS = [
  'Home Office Deduction — If working from home, deduct a portion of rent/mortgage, utilities, and insurance (simplified: $5/sq ft up to 300 sq ft = $1,500).',
  'Vehicle / Mileage — Standard mileage rate for business driving. Track with an app like MileIQ.',
  'Cell Phone — Business percentage of your monthly phone bill is deductible.',
  'Internet — Business percentage of your home internet service is deductible.',
  'Professional Development — Books, courses, certifications, and industry conferences.',
  'Business Meals — Client meetings, team lunches, and networking meals at 50%.',
  'Health Insurance Premiums — Self-employed individuals can deduct 100% of health insurance premiums.',
  'Retirement Contributions — SEP-IRA, SIMPLE IRA, or Solo 401(k) contributions reduce taxable income.',
  'Depreciation — Equipment, furniture, and computers can be depreciated or expensed under Section 179.',
  'Charitable Contributions — Business-related donations to qualified organizations.',
  'State & Local Taxes — Business-related state income taxes and property taxes.',
  'Professional Memberships — Dues for trade associations and professional organizations.',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeVendorName(description: string): string {
  // Strip common prefixes, transaction IDs, and suffixes
  let name = description.toUpperCase().trim()
  name = name.replace(/^(POS |DEBIT |ACH |CHECKCARD |SQ \*|SQUARE \*|TST\* |SP \*|PAYPAL \*)/i, '')
  name = name.replace(/\s+#\d+.*$/, '')
  name = name.replace(/\s+\d{4,}.*$/, '')
  name = name.replace(/\s{2,}/g, ' ')
  return name.trim()
}

function matchDeductionRule(description: string): DeductionRule | null {
  const normalized = normalizeVendorName(description)
  for (const rule of DEDUCTION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized) || pattern.test(description)) {
        return rule
      }
    }
  }
  return null
}

function isPossibleContractor(description: string): boolean {
  const normalized = normalizeVendorName(description)
  return CONTRACTOR_PATTERNS.some(p => p.test(normalized) || p.test(description))
}

function isRetailPurchase(description: string): boolean {
  const normalized = normalizeVendorName(description)
  return RETAIL_PATTERNS.some(p => p.test(normalized) || p.test(description))
}

function getCurrentQuarter(month: number): number {
  if (month <= 3) return 1
  if (month <= 6) return 2
  if (month <= 9) return 3
  return 4
}

function getNextDeadline(year: number, month: number): { quarter: string; dueDate: string } {
  const currentQ = getCurrentQuarter(month)
  const deadline = QUARTERLY_DEADLINES[currentQ - 1]
  const dueYear = deadline.nextYear ? year + 1 : year
  const dueDateStr = `${dueYear}-${String(deadline.dueMonth).padStart(2, '0')}-${String(deadline.dueDay).padStart(2, '0')}`
  return { quarter: `Q${currentQ} ${year}`, dueDate: dueDateStr }
}

function daysUntil(dateStr: string, fromYear: number, fromMonth: number): number {
  const target = new Date(dateStr)
  const now = new Date(fromYear, fromMonth - 1, 15) // approximate mid-month
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export function generateTaxIntelligence(
  transactions: Array<{ date: string; description: string; amount: number; type: 'credit' | 'debit' }>,
  year: number,
  month: number,
): TaxIntelligenceReport {
  const deductionItems: DeductionItem[] = []
  const vendorTotals = new Map<string, { totalPaid: number; transactionCount: number; isContractor: boolean }>()
  const salesTaxTransactions: SalesTaxSummary['transactions'] = []
  let totalIncome = 0
  let totalExpenses = 0
  const foundCategories = new Set<string>()

  // Process each transaction
  for (const tx of transactions) {
    const absAmount = Math.abs(tx.amount)

    if (tx.type === 'credit') {
      totalIncome += absAmount
    } else {
      totalExpenses += absAmount
    }

    // Only debits are potential deductions
    if (tx.type === 'debit') {
      // Deduction matching
      const rule = matchDeductionRule(tx.description)
      if (rule) {
        const deductibleAmount = Math.round(absAmount * (rule.deductiblePercent / 100) * 100) / 100
        deductionItems.push({
          description: tx.description,
          amount: absAmount,
          date: tx.date,
          irsCategory: rule.irsCategory,
          deductiblePercent: rule.deductiblePercent,
          deductibleAmount,
          confidence: rule.confidence,
          note: rule.note,
        })
        foundCategories.add(rule.irsCategory)
      }

      // Vendor tracking for 1099
      const vendorName = normalizeVendorName(tx.description)
      if (vendorName.length > 1) {
        const existing = vendorTotals.get(vendorName) ?? { totalPaid: 0, transactionCount: 0, isContractor: false }
        existing.totalPaid += absAmount
        existing.transactionCount += 1
        if (isPossibleContractor(tx.description)) {
          existing.isContractor = true
        }
        vendorTotals.set(vendorName, existing)
      }

      // Sales tax estimation on retail purchases
      if (isRetailPurchase(tx.description)) {
        const estimatedTax = Math.round(absAmount * ESTIMATED_SALES_TAX_RATE * 100) / 100
        salesTaxTransactions.push({
          date: tx.date,
          description: tx.description,
          amount: absAmount,
          estimatedTax,
        })
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Build deductions summary
  // ---------------------------------------------------------------------------
  const totalDeductible = deductionItems.reduce((sum, d) => sum + d.deductibleAmount, 0)
  const categoryMap = new Map<string, { total: number; count: number }>()
  for (const item of deductionItems) {
    const existing = categoryMap.get(item.irsCategory) ?? { total: 0, count: 0 }
    existing.total = Math.round((existing.total + item.deductibleAmount) * 100) / 100
    existing.count += 1
    categoryMap.set(item.irsCategory, existing)
  }
  const byCategory = Array.from(categoryMap.entries())
    .map(([category, data]) => ({ category, total: data.total, count: data.count }))
    .sort((a, b) => b.total - a.total)

  const estimatedTaxSavings = Math.round(totalDeductible * EFFECTIVE_TAX_RATE * 100) / 100

  // Missed deductions: suggest categories not already present
  const missedDeductions = ALL_MISSED_DEDUCTION_SUGGESTIONS.filter(suggestion => {
    const lower = suggestion.toLowerCase()
    // Don't suggest categories we already found transactions for
    if (foundCategories.has('Travel') && lower.includes('vehicle')) return false
    if (foundCategories.has('Meals (50%)') && lower.includes('business meals')) return false
    if (foundCategories.has('Education & Training') && lower.includes('professional development')) return false
    if (foundCategories.has('Telecommunications') && (lower.includes('cell phone') || lower.includes('internet'))) return false
    return true
  })

  // ---------------------------------------------------------------------------
  // Build 1099 vendor list
  // ---------------------------------------------------------------------------
  const vendors1099: Vendor1099[] = Array.from(vendorTotals.entries())
    .filter(([, data]) => data.isContractor || data.totalPaid >= VENDOR_1099_THRESHOLD * 0.5)
    .map(([name, data]) => ({
      name,
      totalPaid: Math.round(data.totalPaid * 100) / 100,
      transactionCount: data.transactionCount,
      needs1099: data.totalPaid >= VENDOR_1099_THRESHOLD,
      threshold: VENDOR_1099_THRESHOLD,
      amountRemaining: data.totalPaid >= VENDOR_1099_THRESHOLD
        ? 0
        : Math.round((VENDOR_1099_THRESHOLD - data.totalPaid) * 100) / 100,
      isPossibleContractor: data.isContractor,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid)

  // ---------------------------------------------------------------------------
  // Sales tax summary
  // ---------------------------------------------------------------------------
  const totalSalesTaxPaid = salesTaxTransactions.reduce((sum, t) => sum + t.estimatedTax, 0)
  const salesTax: SalesTaxSummary = {
    totalSalesTaxPaid: Math.round(totalSalesTaxPaid * 100) / 100,
    estimatedSalesTaxCollected: 0, // would need revenue data with tax line items
    transactions: salesTaxTransactions,
  }

  // ---------------------------------------------------------------------------
  // Quarterly estimate
  // ---------------------------------------------------------------------------
  const { quarter, dueDate } = getNextDeadline(year, month)
  const netIncome = totalIncome - totalExpenses
  const estimatedTaxOwed = Math.max(0, Math.round(netIncome * EFFECTIVE_TAX_RATE / 4 * 100) / 100)
  const quarterlyEstimate = {
    quarter,
    estimatedTaxOwed,
    nextDueDate: dueDate,
    basis: `Based on ${formatCurrency(totalIncome)} income and ${formatCurrency(totalExpenses)} expenses this period at ${EFFECTIVE_TAX_RATE * 100}% effective rate.`,
  }

  // ---------------------------------------------------------------------------
  // Alerts
  // ---------------------------------------------------------------------------
  const alerts: TaxAlert[] = []
  const daysToDeadline = daysUntil(dueDate, year, month)

  if (daysToDeadline <= 14 && daysToDeadline > 0) {
    alerts.push({
      type: 'deadline',
      severity: 'critical',
      title: `Quarterly estimated tax due in ${daysToDeadline} days`,
      detail: `${quarter} estimated payment of ${formatCurrency(estimatedTaxOwed)} is due ${dueDate}. Late payments incur IRS penalty and interest.`,
    })
  } else if (daysToDeadline <= 30 && daysToDeadline > 14) {
    alerts.push({
      type: 'deadline',
      severity: 'warning',
      title: `Quarterly estimated tax due in ${daysToDeadline} days`,
      detail: `${quarter} estimated payment is due ${dueDate}. Start preparing your quarterly payment.`,
    })
  }

  for (const vendor of vendors1099) {
    if (vendor.needs1099) {
      alerts.push({
        type: 'compliance',
        severity: 'warning',
        title: `1099 required for ${vendor.name}`,
        detail: `Total paid: ${formatCurrency(vendor.totalPaid)} (threshold: $${VENDOR_1099_THRESHOLD}). Collect W-9 if not already on file.`,
      })
    } else if (vendor.amountRemaining > 0 && vendor.amountRemaining <= 200 && vendor.isPossibleContractor) {
      alerts.push({
        type: 'threshold',
        severity: 'info',
        title: `${vendor.name} approaching 1099 threshold`,
        detail: `Only ${formatCurrency(vendor.amountRemaining)} away from $${VENDOR_1099_THRESHOLD} threshold. Collect W-9 now to avoid year-end scramble.`,
      })
    }
  }

  if (estimatedTaxSavings > 500) {
    alerts.push({
      type: 'savings',
      severity: 'info',
      title: `${formatCurrency(estimatedTaxSavings)} in potential tax savings identified`,
      detail: `We found ${deductionItems.length} deductible transactions across ${byCategory.length} categories. Review for accuracy and ensure all receipts are saved.`,
    })
  }

  if (month >= 10) {
    alerts.push({
      type: 'deadline',
      severity: 'warning',
      title: 'Year-end tax planning window',
      detail: 'Consider accelerating deductible expenses or deferring income before December 31 to optimize this year\'s tax position.',
    })
  }

  // ---------------------------------------------------------------------------
  // Tips
  // ---------------------------------------------------------------------------
  const tips: string[] = []

  if (month >= 10 && month <= 12) {
    tips.push('Consider pre-paying annual software subscriptions before year-end to increase this year\'s deductions.')
    tips.push('Purchase needed equipment or office supplies before December 31 to take advantage of Section 179 expensing.')
  }

  if (foundCategories.has('Meals (50%)')) {
    tips.push('Keep detailed records of business meals: who attended, business purpose discussed, and the receipt. The IRS requires this for meal deductions.')
  }

  if (!foundCategories.has('Education & Training')) {
    tips.push('Professional development (courses, certifications, conferences) is fully deductible. Investing in skills can reduce your tax bill.')
  }

  const highValueVendors = vendors1099.filter(v => v.needs1099)
  if (highValueVendors.length > 0) {
    tips.push(`You have ${highValueVendors.length} vendor(s) requiring 1099s. Request W-9 forms now — the filing deadline is January 31.`)
  }

  if (netIncome > 0 && !foundCategories.has('Insurance')) {
    tips.push('If self-employed, health insurance premiums are 100% deductible above the line. This can significantly reduce adjusted gross income.')
  }

  tips.push('Track vehicle mileage for business trips using an app. The IRS standard mileage rate provides a simple deduction without tracking actual expenses.')

  if (totalDeductible > 0) {
    tips.push(`Organize and digitize all receipts for your ${formatCurrency(totalDeductible)} in identified deductions. The IRS requires substantiation for audit defense.`)
  }

  if (estimatedTaxOwed > 1000) {
    tips.push('Consider setting aside estimated taxes in a dedicated savings account each month to avoid cash flow surprises at quarterly deadlines.')
  }

  // ---------------------------------------------------------------------------
  // Assemble report
  // ---------------------------------------------------------------------------
  return {
    deductions: {
      items: deductionItems,
      totalDeductible: Math.round(totalDeductible * 100) / 100,
      byCategory,
      estimatedTaxSavings,
      missedDeductions,
    },
    vendors1099,
    salesTax,
    quarterlyEstimate,
    alerts,
    tips,
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
