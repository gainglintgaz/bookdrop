// src/lib/meeting-agenda.ts
// Client meeting agenda auto-generator
// Generates professional meeting agendas bookkeepers can use for monthly/quarterly check-ins

export interface AgendaItem {
  title: string
  duration: string // "5 min", "10 min"
  priority: 'must-discuss' | 'should-discuss' | 'nice-to-have'
  notes: string[] // bullet points to discuss
  dataPoints: string[] // specific numbers to reference
  actionItems: string[] // what needs to happen after
}

export interface MeetingAgenda {
  clientName: string
  meetingDate: string
  preparedBy: string
  period: string // "March 2025" or "Q1 2025"
  estimatedDuration: string // "25 minutes"
  sections: AgendaItem[]
  openingScript: string // suggested opening line
  closingScript: string // suggested closing
  followUpEmail: string // draft follow-up email template
}

interface AgendaConfig {
  clientName: string
  bookkeeperName: string
  year: number
  month: number
  cashFlow?: { totalIncome: number; totalExpenses: number; netCashFlow: number }
  taxDeductible?: number
  estimatedTaxSavings?: number
  anomalies?: Array<{ title: string; detail: string }>
  missingDocs?: string[]
  upcomingDeadlines?: Array<{ title: string; date: string }>
  scoreGrade?: string
  recommendations?: string[]
  forecastAlerts?: Array<{ title: string; detail: string }>
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function fmtDollars(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function fmtDollarsExact(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function periodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

function todayFormatted(): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date())
}

function buildFinancialOverview(config: AgendaConfig): AgendaItem | null {
  if (!config.cashFlow) return null

  const { totalIncome, totalExpenses, netCashFlow } = config.cashFlow
  const profitMargin = totalIncome > 0
    ? ((netCashFlow / totalIncome) * 100).toFixed(1)
    : '0.0'

  const notes: string[] = [
    `Review ${periodLabel(config.year, config.month)} financial performance`,
    `Net cash flow is ${netCashFlow >= 0 ? 'positive' : 'negative'} at ${fmtDollarsExact(netCashFlow)}`,
  ]

  if (totalIncome > 0 && Math.abs(netCashFlow / totalIncome) > 0.2) {
    notes.push(
      netCashFlow > 0
        ? `Strong profit margin of ${profitMargin}% -- discuss reinvestment or savings strategy`
        : `Margin of ${profitMargin}% needs attention -- review largest expense categories`,
    )
  }

  const dataPoints = [
    `Total Income: ${fmtDollars(totalIncome)}`,
    `Total Expenses: ${fmtDollars(totalExpenses)}`,
    `Net Cash Flow: ${fmtDollarsExact(netCashFlow)}`,
    `Profit Margin: ${profitMargin}%`,
  ]

  if (config.scoreGrade) {
    dataPoints.push(`Financial Health Grade: ${config.scoreGrade}`)
  }

  const actionItems: string[] = []
  if (netCashFlow < 0) {
    actionItems.push('Identify top 3 expense categories to reduce next month')
  }

  return {
    title: 'Financial Overview',
    duration: '10 min',
    priority: 'must-discuss',
    notes,
    dataPoints,
    actionItems,
  }
}

function buildTaxPlanning(config: AgendaConfig): AgendaItem | null {
  const hasDeductions = config.taxDeductible != null && config.taxDeductible > 0
  const hasSavings = config.estimatedTaxSavings != null && config.estimatedTaxSavings > 0
  const hasDeadlines = config.upcomingDeadlines && config.upcomingDeadlines.length > 0

  if (!hasDeductions && !hasSavings && !hasDeadlines) return null

  const notes: string[] = ['Review tax-relevant transactions and deduction tracking']
  const dataPoints: string[] = []
  const actionItems: string[] = []

  if (hasDeductions) {
    dataPoints.push(`Tax-Deductible Expenses: ${fmtDollars(config.taxDeductible!)}`)
    notes.push(
      `${fmtDollars(config.taxDeductible!)} in deductible expenses identified for ${periodLabel(config.year, config.month)}`,
    )
  }

  if (hasSavings) {
    dataPoints.push(`Estimated Tax Savings: ${fmtDollars(config.estimatedTaxSavings!)}`)
    notes.push(
      `Potential tax savings of ${fmtDollars(config.estimatedTaxSavings!)} -- ensure all receipts are documented`,
    )
  }

  if (hasDeadlines) {
    for (const deadline of config.upcomingDeadlines!) {
      notes.push(`Upcoming: ${deadline.title} (${deadline.date})`)
      dataPoints.push(`Deadline: ${deadline.title} -- ${deadline.date}`)
    }
    actionItems.push('Mark upcoming tax deadlines on calendar')
  }

  actionItems.push('Ensure all deductible expenses have supporting receipts on file')

  // Quarterly estimated tax reminder for relevant months
  const quarterEndMonths = [3, 6, 9, 12]
  if (quarterEndMonths.includes(config.month)) {
    notes.push('Quarterly estimated tax payment may be due -- check with your tax professional')
    actionItems.push('Review quarterly documents with tax professional')
  }

  return {
    title: 'Tax-Related Documents & Deadlines',
    duration: '5 min',
    priority: 'should-discuss',
    notes,
    dataPoints,
    actionItems,
  }
}

function buildIssuesToAddress(config: AgendaConfig): AgendaItem | null {
  const hasMissing = config.missingDocs && config.missingDocs.length > 0
  const hasAnomalies = config.anomalies && config.anomalies.length > 0

  if (!hasMissing && !hasAnomalies) return null

  const notes: string[] = []
  const dataPoints: string[] = []
  const actionItems: string[] = []

  if (hasMissing) {
    notes.push(`${config.missingDocs!.length} missing document(s) need to be collected`)
    for (const doc of config.missingDocs!) {
      dataPoints.push(`Missing: ${doc}`)
      actionItems.push(`Upload ${doc}`)
    }
  }

  if (hasAnomalies) {
    notes.push(`${config.anomalies!.length} anomaly/anomalies flagged for review`)
    for (const anomaly of config.anomalies!) {
      notes.push(`${anomaly.title}: ${anomaly.detail}`)
      dataPoints.push(`Anomaly: ${anomaly.title}`)
    }
    actionItems.push('Provide clarification on flagged transactions')
  }

  const priority: AgendaItem['priority'] =
    (config.missingDocs?.length ?? 0) > 2 || (config.anomalies?.length ?? 0) > 1
      ? 'must-discuss'
      : 'should-discuss'

  return {
    title: 'Issues to Address',
    duration: hasMissing && hasAnomalies ? '10 min' : '5 min',
    priority,
    notes,
    dataPoints,
    actionItems,
  }
}

function buildCashFlowOutlook(config: AgendaConfig): AgendaItem | null {
  const hasForecasts = config.forecastAlerts && config.forecastAlerts.length > 0
  const hasRecommendations = config.recommendations && config.recommendations.length > 0

  if (!hasForecasts && !hasRecommendations) return null

  const notes: string[] = ['Review forward-looking cash flow projections']
  const dataPoints: string[] = []
  const actionItems: string[] = []

  if (hasForecasts) {
    for (const alert of config.forecastAlerts!) {
      notes.push(`${alert.title}: ${alert.detail}`)
      dataPoints.push(`Forecast: ${alert.title}`)
    }
    actionItems.push('Review projected cash position for upcoming months')
  }

  if (hasRecommendations) {
    notes.push('Recommendations based on financial analysis:')
    for (const rec of config.recommendations!) {
      notes.push(`  - ${rec}`)
    }
    actionItems.push('Review and prioritize financial recommendations')
  }

  return {
    title: 'Cash Flow Outlook',
    duration: '5 min',
    priority: hasForecasts ? 'should-discuss' : 'nice-to-have',
    notes,
    dataPoints,
    actionItems,
  }
}

function buildActionItemsSection(sections: AgendaItem[]): AgendaItem {
  // Consolidate all action items from prior sections
  const allActions: string[] = []
  for (const section of sections) {
    for (const action of section.actionItems) {
      if (!allActions.includes(action)) {
        allActions.push(action)
      }
    }
  }

  if (allActions.length === 0) {
    allActions.push('Continue current financial practices')
    allActions.push('Upload all documents before the next reporting period')
  }

  return {
    title: 'Action Items & Next Steps',
    duration: '5 min',
    priority: 'must-discuss',
    notes: [
      'Review and confirm all action items before wrapping up',
      'Set deadlines for each item and confirm who is responsible',
    ],
    dataPoints: [`Total Action Items: ${allActions.length}`],
    actionItems: allActions,
  }
}

function computeEstimatedDuration(sections: AgendaItem[]): string {
  let totalMinutes = 0
  for (const section of sections) {
    const match = section.duration.match(/(\d+)/)
    if (match) {
      totalMinutes += parseInt(match[1], 10)
    }
  }
  // Add 5 minutes buffer for opening/closing
  totalMinutes += 5
  return `${totalMinutes} minutes`
}

function buildOpeningScript(config: AgendaConfig, period: string): string {
  const greeting = `Hi ${config.clientName.split(' ')[0]}, thanks for making time today.`
  const purpose = `I've prepared a review of your financials for ${period} and have a few items I'd like to walk through with you.`

  if (config.cashFlow && config.cashFlow.netCashFlow > 0) {
    return `${greeting} ${purpose} The good news is your cash flow was positive this period, so we'll start there.`
  }
  if (config.missingDocs && config.missingDocs.length > 0) {
    return `${greeting} ${purpose} There are a couple of items we'll need your help on, but let's start with the big picture.`
  }
  return `${greeting} ${purpose} Let's dive in.`
}

function buildClosingScript(_config: AgendaConfig, sections: AgendaItem[]): string {
  const totalActions = sections.reduce((sum, s) => sum + s.actionItems.length, 0)
  const base = `That covers everything I had prepared.`
  const actionNote = totalActions > 0
    ? ` We have ${totalActions} action item${totalActions === 1 ? '' : 's'} to follow up on -- I'll send you a summary email shortly so nothing falls through the cracks.`
    : ''
  const close = ` Do you have any questions or anything else you'd like to discuss before we wrap up?`
  return `${base}${actionNote}${close}`
}

function buildFollowUpEmail(
  config: AgendaConfig,
  period: string,
  sections: AgendaItem[],
): string {
  const allActions: string[] = []
  for (const section of sections) {
    for (const action of section.actionItems) {
      if (!allActions.includes(action)) {
        allActions.push(action)
      }
    }
  }

  const actionList = allActions.length > 0
    ? allActions.map((a, i) => `  ${i + 1}. ${a}`).join('\n')
    : '  No outstanding action items at this time.'

  const cashFlowSummary = config.cashFlow
    ? `\nFinancial Summary for ${period}:\n  - Income: ${fmtDollars(config.cashFlow.totalIncome)}\n  - Expenses: ${fmtDollars(config.cashFlow.totalExpenses)}\n  - Net Cash Flow: ${fmtDollarsExact(config.cashFlow.netCashFlow)}`
    : ''

  const taxNote = config.estimatedTaxSavings && config.estimatedTaxSavings > 0
    ? `\n\nTax Note: We identified ${fmtDollars(config.estimatedTaxSavings)} in potential tax savings this period. Please ensure all supporting receipts are uploaded.`
    : ''

  const missingNote = config.missingDocs && config.missingDocs.length > 0
    ? `\n\nMissing Documents: The following documents still need to be uploaded:\n${config.missingDocs.map(d => `  - ${d}`).join('\n')}`
    : ''

  const deadlineNote = config.upcomingDeadlines && config.upcomingDeadlines.length > 0
    ? `\n\nUpcoming Deadlines:\n${config.upcomingDeadlines.map(d => `  - ${d.title}: ${d.date}`).join('\n')}`
    : ''

  return `Subject: ${period} Financial Review -- Summary & Action Items

Hi ${config.clientName.split(' ')[0]},

Thank you for meeting with me today (${todayFormatted()}) to review your financials for ${period}. Below is a summary of what we discussed and the action items we agreed on.
${cashFlowSummary}

Action Items:
${actionList}
${taxNote}${missingNote}${deadlineNote}

Please try to complete these items before our next check-in. If you have any questions in the meantime, don't hesitate to reach out.

Best regards,
${config.bookkeeperName}`
}

export function generateMeetingAgenda(config: AgendaConfig): MeetingAgenda {
  const period = periodLabel(config.year, config.month)

  // Build sections in order, filtering out nulls
  const builders = [
    buildFinancialOverview,
    buildTaxPlanning,
    buildIssuesToAddress,
    buildCashFlowOutlook,
  ]

  const contentSections: AgendaItem[] = []
  for (const builder of builders) {
    const section = builder(config)
    if (section) {
      contentSections.push(section)
    }
  }

  // If no data was provided at all, add a minimal overview
  if (contentSections.length === 0) {
    contentSections.push({
      title: 'General Check-In',
      duration: '10 min',
      priority: 'must-discuss',
      notes: [
        `Review overall business status for ${period}`,
        'Discuss any changes in business operations or upcoming needs',
        'Confirm document submission schedule is working',
      ],
      dataPoints: [],
      actionItems: ['Upload any outstanding documents for the period'],
    })
  }

  // Action items section is always last
  const actionItemsSection = buildActionItemsSection(contentSections)
  const allSections = [...contentSections, actionItemsSection]

  return {
    clientName: config.clientName,
    meetingDate: todayFormatted(),
    preparedBy: config.bookkeeperName,
    period,
    estimatedDuration: computeEstimatedDuration(allSections),
    sections: allSections,
    openingScript: buildOpeningScript(config, period),
    closingScript: buildClosingScript(config, allSections),
    followUpEmail: buildFollowUpEmail(config, period, allSections),
  }
}

// --- HTML download ---

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function priorityBadge(priority: AgendaItem['priority']): string {
  const colors: Record<AgendaItem['priority'], string> = {
    'must-discuss': '#dc2626',
    'should-discuss': '#d97706',
    'nice-to-have': '#6b7280',
  }
  const labels: Record<AgendaItem['priority'], string> = {
    'must-discuss': 'Must Discuss',
    'should-discuss': 'Should Discuss',
    'nice-to-have': 'Nice to Have',
  }
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${colors[priority]}">${labels[priority]}</span>`
}

function renderAgendaHTML(agenda: MeetingAgenda): string {
  const sectionsHTML = agenda.sections
    .map(
      (section, idx) => `
      <div style="margin-bottom:24px;page-break-inside:avoid">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#1e40af;color:#fff;font-size:13px;font-weight:700">${idx + 1}</span>
          <h3 style="margin:0;font-size:16px;color:#1e293b">${escapeHtml(section.title)}</h3>
          <span style="font-size:12px;color:#64748b">${escapeHtml(section.duration)}</span>
          ${priorityBadge(section.priority)}
        </div>

        ${section.notes.length > 0 ? `
        <div style="margin-left:40px;margin-bottom:8px">
          <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.5px">Discussion Points</p>
          <ul style="margin:0;padding-left:16px;color:#334155;font-size:13px;line-height:1.6">
            ${section.notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}
          </ul>
        </div>` : ''}

        ${section.dataPoints.length > 0 ? `
        <div style="margin-left:40px;margin-bottom:8px;padding:8px 12px;background:#f1f5f9;border-radius:6px">
          <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.5px">Key Data</p>
          <ul style="margin:0;padding-left:16px;color:#0f172a;font-size:13px;font-weight:500;line-height:1.6">
            ${section.dataPoints.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
          </ul>
        </div>` : ''}

        ${section.actionItems.length > 0 ? `
        <div style="margin-left:40px">
          <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.5px">Action Items</p>
          <ul style="margin:0;padding-left:16px;color:#334155;font-size:13px;line-height:1.6;list-style-type:square">
            ${section.actionItems.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
          </ul>
        </div>` : ''}
      </div>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Agenda -- ${escapeHtml(agenda.clientName)} -- ${escapeHtml(agenda.period)}</title>
  <style>
    @media print {
      body { font-size: 12px; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      color: #1e293b;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div style="border-bottom:2px solid #1e40af;padding-bottom:16px;margin-bottom:24px">
    <h1 style="margin:0 0 4px 0;font-size:22px;color:#1e40af">Client Meeting Agenda</h1>
    <p style="margin:0;font-size:14px;color:#64748b">${escapeHtml(agenda.period)} Review</p>
  </div>

  <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
    <tr>
      <td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600;width:140px">Client</td>
      <td style="padding:4px 0">${escapeHtml(agenda.clientName)}</td>
    </tr>
    <tr>
      <td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Date</td>
      <td style="padding:4px 0">${escapeHtml(agenda.meetingDate)}</td>
    </tr>
    <tr>
      <td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Prepared By</td>
      <td style="padding:4px 0">${escapeHtml(agenda.preparedBy)}</td>
    </tr>
    <tr>
      <td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600">Est. Duration</td>
      <td style="padding:4px 0">${escapeHtml(agenda.estimatedDuration)}</td>
    </tr>
  </table>

  <div style="margin-bottom:24px;padding:12px 16px;background:#eff6ff;border-left:3px solid #1e40af;border-radius:0 6px 6px 0">
    <p style="margin:0 0 2px 0;font-size:11px;font-weight:600;color:#1e40af;text-transform:uppercase;letter-spacing:0.5px">Suggested Opening</p>
    <p style="margin:0;font-size:13px;color:#334155;font-style:italic">"${escapeHtml(agenda.openingScript)}"</p>
  </div>

  ${sectionsHTML}

  <div style="margin-top:24px;padding:12px 16px;background:#f0fdf4;border-left:3px solid #16a34a;border-radius:0 6px 6px 0">
    <p style="margin:0 0 2px 0;font-size:11px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.5px">Suggested Closing</p>
    <p style="margin:0;font-size:13px;color:#334155;font-style:italic">"${escapeHtml(agenda.closingScript)}"</p>
  </div>

  <div style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px">
    <h2 style="margin:0 0 8px 0;font-size:16px;color:#1e293b">Draft Follow-Up Email</h2>
    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#475569;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;line-height:1.6">${escapeHtml(agenda.followUpEmail)}</pre>
  </div>

  <div style="margin-top:24px;text-align:center;font-size:11px;color:#94a3b8">
    Generated by BookDrop &middot; ${escapeHtml(agenda.meetingDate)}
  </div>
</body>
</html>`
}

export function downloadAgendaAsHTML(agenda: MeetingAgenda): void {
  const html = renderAgendaHTML(agenda)
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `Meeting-Agenda-${agenda.clientName.replace(/\s+/g, '-')}-${agenda.period.replace(/\s+/g, '-')}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
