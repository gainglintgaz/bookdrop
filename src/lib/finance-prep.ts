// src/lib/finance-prep.ts
// Generates a "bookkeeper-ready package" — a self-contained HTML report
// that business owners can download and email to their bookkeeper.
// Also used by bookkeepers as a period summary for their records.

import type { RequirementWithUploads } from '@/types'
import type { ReconciliationResult } from './reconciliation'
import type { CompletenessReport } from './completeness-check'
import { formatPeriod, formatDocType } from './utils'

interface PackageOptions {
  businessName: string
  contactName: string
  year: number
  month: number
  requirements: RequirementWithUploads[]
  completeness: CompletenessReport
  reconciliation?: ReconciliationResult
  bookkeeperName?: string
  bookkeeperEmail?: string
}

/** Generate a downloadable HTML report — the "bookkeeper-ready package" */
export function generateBookkeeperPackage(options: PackageOptions): void {
  const {
    businessName,
    contactName,
    year,
    month,
    requirements,
    completeness,
    reconciliation,
    bookkeeperName,
    bookkeeperEmail,
  } = options

  const period = formatPeriod(year, month)
  const received = requirements.filter(r => r.uploads.length > 0)
  const missing = requirements.filter(r => r.required && r.uploads.length === 0)

  const estimatedHours = reconciliation
    ? Math.max(1, 10 - reconciliation.estimatedHoursSaved - (completeness.score / 20))
    : Math.max(3, 10 - (completeness.score / 15))

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${businessName} — ${period} Bookkeeper Package</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px 24px; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin: 32px 0 12px; border-bottom: 2px solid #e5e5e5; padding-bottom: 8px; }
  .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-pass { background: #dcfce7; color: #166534; }
  .badge-warn { background: #fef9c3; color: #854d0e; }
  .badge-fail { background: #fee2e2; color: #991b1b; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 16px 0; }
  .summary-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; }
  .summary-card .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; font-size: 13px; }
  th { font-weight: 600; color: #666; background: #f9fafb; }
  .check-pass { color: #16a34a; }
  .check-warn { color: #ca8a04; }
  .check-fail { color: #dc2626; }
  .hours-box { background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
  .hours-box .big { font-size: 36px; font-weight: 800; color: #166534; }
  .hours-box .label { font-size: 14px; color: #4ade80; margin-top: 4px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>

<h1>${businessName}</h1>
<p class="subtitle">
  ${period} Financial Document Package
  ${contactName ? `&middot; Prepared by ${contactName}` : ''}
  &middot; Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
</p>

${bookkeeperName ? `<p style="color: #666; font-size: 14px; margin-bottom: 24px;">For: ${bookkeeperName}${bookkeeperEmail ? ` (${bookkeeperEmail})` : ''}</p>` : ''}

<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Readiness Score</div>
    <div class="value">${completeness.score}<span style="font-size: 16px; color: #999;">/100</span></div>
  </div>
  <div class="summary-card">
    <div class="label">Documents Received</div>
    <div class="value">${received.length}<span style="font-size: 16px; color: #999;">/${requirements.length}</span></div>
  </div>
  <div class="summary-card">
    <div class="label">Match Rate</div>
    <div class="value">${reconciliation ? `${reconciliation.matchRate}%` : 'N/A'}</div>
  </div>
</div>

<div class="hours-box">
  <div class="big">~${Math.round(estimatedHours)} hrs</div>
  <div class="label">Estimated bookkeeper time needed (down from ~10 hrs without prep)</div>
</div>

<h2>Document Checklist</h2>
<table>
  <thead><tr><th>Document</th><th>Type</th><th>Required</th><th>Status</th><th>File</th></tr></thead>
  <tbody>
${requirements.map(req => {
  const upload = req.uploads[0]
  const status = upload ? 'Received' : req.required ? 'MISSING' : 'Not submitted'
  const statusClass = upload ? 'check-pass' : req.required ? 'check-fail' : 'check-warn'
  return `    <tr>
      <td>${req.label}</td>
      <td>${formatDocType(req.doc_type)}</td>
      <td>${req.required ? 'Yes' : 'Optional'}</td>
      <td class="${statusClass}">${status}</td>
      <td>${upload?.filename_original ?? '—'}</td>
    </tr>`
}).join('\n')}
  </tbody>
</table>

<h2>Readiness Checks</h2>
<table>
  <thead><tr><th>Check</th><th>Result</th><th>Details</th></tr></thead>
  <tbody>
${completeness.checks.map(check => `    <tr>
      <td>${check.label}</td>
      <td class="check-${check.severity}">${check.severity === 'pass' ? 'PASS' : check.severity === 'warning' ? 'WARN' : 'FAIL'}</td>
      <td>${check.detail}</td>
    </tr>`).join('\n')}
  </tbody>
</table>

${reconciliation ? `
<h2>Reconciliation Summary</h2>
<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Matched</div>
    <div class="value" style="color: #16a34a;">${reconciliation.matched.length}</div>
  </div>
  <div class="summary-card">
    <div class="label">Unmatched Transactions</div>
    <div class="value" style="color: ${reconciliation.unmatchedTransactions.length > 0 ? '#dc2626' : '#16a34a'};">${reconciliation.unmatchedTransactions.length}</div>
  </div>
  <div class="summary-card">
    <div class="label">Unmatched Receipts</div>
    <div class="value" style="color: ${reconciliation.unmatchedReceipts.length > 0 ? '#ca8a04' : '#16a34a'};">${reconciliation.unmatchedReceipts.length}</div>
  </div>
</div>
<p style="font-size: 14px; color: #666; margin: 12px 0;">${reconciliation.recommendation}</p>

${reconciliation.matched.length > 0 ? `
<h3 style="font-size: 14px; margin: 16px 0 8px;">Matched Transactions</h3>
<table>
  <thead><tr><th>Date</th><th>Bank Description</th><th>Amount</th><th>Receipt</th><th>Confidence</th></tr></thead>
  <tbody>
${reconciliation.matched.map(m => `    <tr>
      <td>${m.transaction.date}</td>
      <td>${m.transaction.description}</td>
      <td>$${Math.abs(m.transaction.amount).toFixed(2)}</td>
      <td>${Array.isArray(m.receipt) ? m.receipt.map(r => r.filename).join(' + ') : m.receipt.filename}</td>
      <td class="check-${m.confidence === 'high' ? 'pass' : m.confidence === 'medium' ? 'warn' : 'fail'}">${m.confidence}</td>
    </tr>`).join('\n')}
  </tbody>
</table>` : ''}

${reconciliation.unmatchedTransactions.length > 0 ? `
<h3 style="font-size: 14px; margin: 16px 0 8px; color: #dc2626;">Unmatched Transactions (Need Review)</h3>
<table>
  <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Category</th></tr></thead>
  <tbody>
${reconciliation.unmatchedTransactions.map(t => `    <tr>
      <td>${t.date}</td>
      <td>${t.description}</td>
      <td>$${Math.abs(t.amount).toFixed(2)}</td>
      <td>${t.category ?? 'Uncategorized'}</td>
    </tr>`).join('\n')}
  </tbody>
</table>` : ''}
` : ''}

${missing.length > 0 ? `
<h2 style="color: #dc2626;">Missing Documents</h2>
<ul style="margin: 12px 0; padding-left: 20px;">
${missing.map(m => `  <li style="margin: 4px 0; font-size: 14px;">${m.label} (${formatDocType(m.doc_type)})</li>`).join('\n')}
</ul>
` : ''}

<div class="footer">
  <p>Generated by BookDrop Finance Prep &middot; ${new Date().toISOString()}</p>
  <p>This report is for informational purposes. Verify all data before filing.</p>
</div>

</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${businessName.replace(/\s+/g, '_')}_${year}_${String(month).padStart(2, '0')}_package.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Generate a demo package with sample data — used on the BusinessOwnerDashboard */
export async function generateDemoPackage(): Promise<void> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const demoRequirements: RequirementWithUploads[] = [
    {
      id: 'demo-req-1',
      client_id: 'demo-client',
      label: 'Chase Business Checking — Statement',
      doc_type: 'bank',
      required: true,
      sort_order: 0,
      uploads: [{
        id: 'demo-up-1',
        requirement_id: 'demo-req-1',
        client_id: 'demo-client',
        bookkeeper_id: 'demo-bk',
        period_year: year,
        period_month: month,
        filename_original: 'chase_checking_apr.pdf',
        storage_path: `demo-bk/demo-client/${year}/${month}/demo-req-1/chase_checking_apr.pdf`,
        file_size_bytes: 204800,
        uploaded_at: now.toISOString(),
      }],
    },
    {
      id: 'demo-req-2',
      client_id: 'demo-client',
      label: 'Amex Business Card — Statement',
      doc_type: 'credit_card',
      required: true,
      sort_order: 1,
      uploads: [{
        id: 'demo-up-2',
        requirement_id: 'demo-req-2',
        client_id: 'demo-client',
        bookkeeper_id: 'demo-bk',
        period_year: year,
        period_month: month,
        filename_original: 'amex_business_apr.pdf',
        storage_path: `demo-bk/demo-client/${year}/${month}/demo-req-2/amex_business_apr.pdf`,
        file_size_bytes: 153600,
        uploaded_at: now.toISOString(),
      }],
    },
    {
      id: 'demo-req-3',
      client_id: 'demo-client',
      label: 'Monthly Receipts — Expenses over $75',
      doc_type: 'receipt',
      required: true,
      sort_order: 2,
      uploads: [],
    },
    {
      id: 'demo-req-4',
      client_id: 'demo-client',
      label: 'Payroll Summary',
      doc_type: 'payroll',
      required: false,
      sort_order: 3,
      uploads: [{
        id: 'demo-up-4',
        requirement_id: 'demo-req-4',
        client_id: 'demo-client',
        bookkeeper_id: 'demo-bk',
        period_year: year,
        period_month: month,
        filename_original: 'gusto_payroll_apr.pdf',
        storage_path: `demo-bk/demo-client/${year}/${month}/demo-req-4/gusto_payroll_apr.pdf`,
        file_size_bytes: 102400,
        uploaded_at: now.toISOString(),
      }],
    },
  ]

  const demoCompleteness: CompletenessReport = {
    checks: [
      { id: 'bank-stmts', label: 'Bank statements uploaded', severity: 'pass', detail: '1 of 1 bank statements received' },
      { id: 'cc-stmts', label: 'Credit card statements uploaded', severity: 'pass', detail: '1 of 1 credit card statements received' },
      { id: 'receipts', label: 'Receipt documentation', severity: 'fail', detail: 'Missing receipts for expenses over $75' },
      { id: 'payroll', label: 'Payroll documentation', severity: 'pass', detail: 'Payroll summary received' },
    ],
    score: 72,
    readyForBookkeeper: false,
    missingItems: ['Monthly Receipts — Expenses over $75'],
    warnings: [],
  }

  generateBookkeeperPackage({
    businessName: 'Acme Supplies LLC',
    contactName: 'Demo User',
    year,
    month,
    requirements: demoRequirements,
    completeness: demoCompleteness,
    bookkeeperName: 'Your Bookkeeper',
  })
}
