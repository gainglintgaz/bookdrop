// src/lib/email-templates.ts
// Smart email template system for generating professional, contextual emails.
// Generates responsive HTML that renders correctly in Outlook, Gmail, and Apple Mail.

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface EmailTemplate {
  subject: string
  body: string // HTML email body
  plainText: string // plain text version
  previewText: string // email preview snippet
}

export type ReminderTone = 'friendly' | 'professional' | 'firm' | 'urgent'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const BRAND_COLOR = '#2d6a4f'
const BRAND_COLOR_LIGHT = '#d8f3dc'
const BRAND_COLOR_DARK = '#1b4332'
const TEXT_PRIMARY = '#1a1a2e'
const TEXT_SECONDARY = '#555770'
const TEXT_MUTED = '#8b8ca7'
const BG_BODY = '#f4f4f8'
const BG_CARD = '#ffffff'
const BORDER_COLOR = '#e8e8ef'
const DANGER_COLOR = '#c1121f'
const DANGER_BG = '#fef2f2'
const SUCCESS_COLOR = '#2d6a4f'
const SUCCESS_BG = '#ecfdf5'

// ─── SHARED LAYOUT ───────────────────────────────────────────────────────────

function wrapInLayout(
  practiceName: string,
  content: string,
  footerText: string,
  previewText: string,
): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(practiceName)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; }
      .center-on-narrow { text-align: center !important; display: block !important; margin-left: auto !important; margin-right: auto !important; float: none !important; }
      table.center-on-narrow { display: inline-block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:${BG_BODY};">
  <div style="display:none;font-size:1px;color:${BG_BODY};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${escapeHtml(previewText)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;
  </div>
  <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:${BG_BODY};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <!--[if mso]><table role="presentation" align="center" style="width:580px;"><tr><td><![endif]-->
        <table role="presentation" class="email-container" style="width:100%;max-width:580px;border:none;border-spacing:0;">
          <!-- HEADER -->
          <tr>
            <td style="padding:24px 32px;background-color:${BRAND_COLOR};border-radius:12px 12px 0 0;text-align:center;">
              <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                    ${escapeHtml(practiceName)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- BODY -->
          <tr>
            <td style="padding:0;background-color:${BG_CARD};border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};">
              ${content}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="padding:24px 32px;background-color:${BG_CARD};border-radius:0 0 12px 12px;border-left:1px solid ${BORDER_COLOR};border-right:1px solid ${BORDER_COLOR};border-bottom:1px solid ${BORDER_COLOR};">
              <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                <tr>
                  <td style="border-top:1px solid ${BORDER_COLOR};padding-top:20px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:18px;color:${TEXT_MUTED};">
                    ${footerText}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`
}

function ctaButton(text: string, href: string, color: string = BRAND_COLOR): string {
  return `<table role="presentation" style="margin:24px auto;border:none;border-spacing:0;">
  <tr>
    <td style="border-radius:8px;background-color:${color};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(href)}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="17%" fillcolor="${color}">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(text)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:${color};text-align:center;mso-padding-alt:0;">
        ${escapeHtml(text)}
      </a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`
}

function sectionPadding(inner: string): string {
  return `<td style="padding:32px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">${inner}</td>`
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\t')
    .replace(/<li>/gi, '  - ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── REMINDER EMAIL ──────────────────────────────────────────────────────────

interface ReminderConfig {
  clientName: string
  contactName: string
  bookkeeperName: string
  practiceName: string
  missingDocs: string[]
  deadline: string
  portalLink: string
  reminderNumber: number
  tone: ReminderTone
  month: string
}

const REMINDER_SUBJECTS: Record<ReminderTone, (month: string) => string> = {
  friendly: (month) => `Quick reminder: ${month} documents needed`,
  professional: (month) => `Follow-up: ${month} documents outstanding`,
  firm: (month) => `Action required: ${month} documents still missing`,
  urgent: (month) => `URGENT: ${month} documents are overdue`,
}

const REMINDER_GREETINGS: Record<ReminderTone, (name: string) => string> = {
  friendly: (name) => `Hi ${name}!`,
  professional: (name) => `Hello ${name},`,
  firm: (name) => `Dear ${name},`,
  urgent: (name) => `Dear ${name},`,
}

const REMINDER_INTROS: Record<ReminderTone, (month: string, practiceName: string) => string> = {
  friendly: (month) =>
    `Just a friendly reminder that we haven't received your ${month} documents yet. No rush to panic, but we'd love to get them soon so we can keep your books up to date!`,
  professional: (month) =>
    `This is a follow-up regarding your ${month} financial documents. We are still waiting on a few items in order to complete your monthly bookkeeping.`,
  firm: (month) =>
    `We still need the following documents for ${month}. Without these, we are unable to proceed with your monthly bookkeeping and may need to delay your financial reports.`,
  urgent: (month) =>
    `Your ${month} documents are now overdue. This delay is impacting our ability to maintain accurate records for your business. Immediate action is required to avoid disruptions to your bookkeeping services.`,
}

export function generateReminderEmail(config: ReminderConfig): EmailTemplate {
  const {
    clientName: _clientName,
    contactName,
    bookkeeperName,
    practiceName,
    missingDocs,
    deadline,
    portalLink,
    tone,
    month,
  } = config

  const subject = REMINDER_SUBJECTS[tone](month)
  const greeting = REMINDER_GREETINGS[tone](contactName)
  const intro = REMINDER_INTROS[tone](month, practiceName)

  const urgencyBanner =
    tone === 'urgent'
      ? `<tr>${sectionPadding(`
          <table role="presentation" style="width:100%;border:none;border-spacing:0;">
            <tr>
              <td style="padding:14px 20px;background-color:${DANGER_BG};border:1px solid ${DANGER_COLOR};border-radius:8px;">
                <table role="presentation" style="width:100%;border:none;border-spacing:0;">
                  <tr>
                    <td style="font-size:14px;font-weight:600;color:${DANGER_COLOR};line-height:22px;">
                      This is your final reminder. Documents were due on ${escapeHtml(deadline)}.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `)}</tr>`
      : ''

  const docListItems = missingDocs
    .map(
      (doc) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER_COLOR};">
            <table role="presentation" style="width:100%;border:none;border-spacing:0;">
              <tr>
                <td style="width:8px;vertical-align:top;padding-top:6px;">
                  <div style="width:8px;height:8px;border-radius:50%;background-color:${tone === 'urgent' ? DANGER_COLOR : BRAND_COLOR};"></div>
                </td>
                <td style="padding-left:12px;font-size:14px;line-height:22px;color:${TEXT_PRIMARY};">
                  ${escapeHtml(doc)}
                </td>
              </tr>
            </table>
          </td>
        </tr>`,
    )
    .join('')

  const deadlineNote =
    tone === 'friendly'
      ? `If you can get these uploaded by <strong>${escapeHtml(deadline)}</strong>, that would be wonderful.`
      : tone === 'professional'
        ? `Please upload these documents by <strong>${escapeHtml(deadline)}</strong>.`
        : tone === 'firm'
          ? `These must be submitted by <strong>${escapeHtml(deadline)}</strong> to avoid delays.`
          : `These were due by <strong>${escapeHtml(deadline)}</strong>. Please upload them immediately.`

  const signoff =
    tone === 'friendly'
      ? 'Thanks so much!'
      : tone === 'professional'
        ? 'Thank you for your prompt attention.'
        : tone === 'firm'
          ? 'Your immediate attention to this matter is appreciated.'
          : 'Please treat this as a priority.'

  const previewText = `${month} documents needed: ${missingDocs.length} item${missingDocs.length !== 1 ? 's' : ''} outstanding`

  const htmlContent = `
    ${urgencyBanner}
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:${TEXT_PRIMARY};line-height:28px;">
        ${escapeHtml(greeting)}
      </p>
      <p style="margin:16px 0 0 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        ${intro}
      </p>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">
        Missing Documents
      </p>
      <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:${BG_BODY};border-radius:8px;padding:4px 16px;">
        ${docListItems}
      </table>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        ${deadlineNote}
      </p>
      ${ctaButton('Upload Documents Now', portalLink)}
      <p style="margin:0;font-size:13px;line-height:20px;color:${TEXT_MUTED};text-align:center;">
        Or copy this link: ${escapeHtml(portalLink)}
      </p>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        ${signoff}
      </p>
      <p style="margin:8px 0 24px 0;font-size:15px;font-weight:600;color:${TEXT_PRIMARY};">
        ${escapeHtml(bookkeeperName)}<br>
        <span style="font-weight:400;color:${TEXT_SECONDARY};">${escapeHtml(practiceName)}</span>
      </p>
    `)}</tr>`

  const body = wrapInLayout(
    practiceName,
    htmlContent,
    `Sent on behalf of ${escapeHtml(practiceName)}. If you believe you received this in error, please contact ${escapeHtml(bookkeeperName)} directly.`,
    previewText,
  )

  const plainText = [
    greeting,
    '',
    intro,
    '',
    'Missing Documents:',
    ...missingDocs.map((d) => `  - ${d}`),
    '',
    deadlineNote.replace(/<[^>]+>/g, ''),
    '',
    `Upload your documents here: ${portalLink}`,
    '',
    signoff,
    '',
    bookkeeperName,
    practiceName,
  ].join('\n')

  return { subject, body, plainText, previewText }
}

// ─── MONTHLY SUMMARY EMAIL ──────────────────────────────────────────────────

interface MonthlySummaryConfig {
  clientName: string
  contactName: string
  bookkeeperName: string
  month: string
  income: number
  expenses: number
  netCashFlow: number
  taxDeductible: number
  topCategories: Array<{ name: string; amount: number }>
  actionItems: string[]
  nextDeadline: string
}

export function generateMonthlySummaryEmail(config: MonthlySummaryConfig): EmailTemplate {
  const {
    clientName,
    contactName,
    bookkeeperName,
    month,
    income,
    expenses,
    netCashFlow,
    taxDeductible,
    topCategories,
    actionItems,
    nextDeadline,
  } = config

  const subject = `${clientName} - ${month} Financial Summary`
  const previewText = `${month}: ${formatCurrency(income)} income, ${formatCurrency(expenses)} expenses, ${formatCurrency(netCashFlow)} net`

  const cashFlowColor = netCashFlow >= 0 ? SUCCESS_COLOR : DANGER_COLOR
  const cashFlowBg = netCashFlow >= 0 ? SUCCESS_BG : DANGER_BG

  const metricCell = (label: string, value: string, color: string = TEXT_PRIMARY) =>
    `<td style="width:50%;padding:12px 16px;vertical-align:top;">
      <p style="margin:0 0 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">${label}</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:700;color:${color};letter-spacing:-0.3px;">${value}</p>
    </td>`

  const categoryRows = topCategories
    .slice(0, 5)
    .map(
      (cat, i) =>
        `<tr>
        <td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:${TEXT_PRIMARY};border-bottom:1px solid ${BORDER_COLOR};">
          <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background-color:${BRAND_COLOR_LIGHT};color:${BRAND_COLOR};text-align:center;line-height:20px;font-size:11px;font-weight:700;margin-right:8px;">${i + 1}</span>
          ${escapeHtml(cat.name)}
        </td>
        <td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;color:${TEXT_PRIMARY};text-align:right;border-bottom:1px solid ${BORDER_COLOR};">
          ${formatCurrency(cat.amount)}
        </td>
      </tr>`,
    )
    .join('')

  const actionItemsList = actionItems
    .map(
      (item) =>
        `<tr>
        <td style="padding:6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:22px;color:${TEXT_SECONDARY};">
          <span style="color:${BRAND_COLOR};font-weight:700;margin-right:6px;">&#10003;</span> ${escapeHtml(item)}
        </td>
      </tr>`,
    )
    .join('')

  const htmlContent = `
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:${TEXT_PRIMARY};line-height:28px;">
        Hello ${escapeHtml(contactName)},
      </p>
      <p style="margin:12px 0 0 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        Here is your financial summary for <strong>${escapeHtml(month)}</strong>. Below you'll find key metrics, top spending categories, and action items for the month ahead.
      </p>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 16px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">
        Key Metrics
      </p>
      <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:${BG_BODY};border-radius:8px;">
        <tr>
          ${metricCell('Total Income', formatCurrency(income), SUCCESS_COLOR)}
          ${metricCell('Total Expenses', formatCurrency(expenses), DANGER_COLOR)}
        </tr>
        <tr>
          <td colspan="2" style="padding:0 16px;">
            <div style="height:1px;background-color:${BORDER_COLOR};"></div>
          </td>
        </tr>
        <tr>
          ${metricCell('Net Cash Flow', `${netCashFlow >= 0 ? '+' : ''}${formatCurrency(netCashFlow)}`, cashFlowColor)}
          ${metricCell('Tax Deductible', formatCurrency(taxDeductible), BRAND_COLOR)}
        </tr>
      </table>
    `)}</tr>
    <tr>${sectionPadding(`
      <table role="presentation" style="width:100%;border:none;border-spacing:0;padding:16px;background-color:${cashFlowBg};border-radius:8px;">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:22px;color:${cashFlowColor};">
            <strong>${netCashFlow >= 0 ? 'Positive cash flow' : 'Negative cash flow'} this month.</strong>
            ${netCashFlow >= 0 ? `Your business earned ${formatCurrency(netCashFlow)} more than it spent.` : `Expenses exceeded income by ${formatCurrency(Math.abs(netCashFlow))}.`}
          </td>
        </tr>
      </table>
    `)}</tr>
    ${topCategories.length > 0 ? `<tr>${sectionPadding(`
      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">
        Top Expense Categories
      </p>
      <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:${BG_BODY};border-radius:8px;overflow:hidden;">
        ${categoryRows}
      </table>
    `)}</tr>` : ''}
    ${actionItems.length > 0 ? `<tr>${sectionPadding(`
      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">
        Action Items
      </p>
      <table role="presentation" style="width:100%;border:none;border-spacing:0;">
        ${actionItemsList}
      </table>
    `)}</tr>` : ''}
    <tr>${sectionPadding(`
      <table role="presentation" style="width:100%;border:none;border-spacing:0;padding:16px;background-color:${BRAND_COLOR_LIGHT};border-radius:8px;">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:22px;color:${BRAND_COLOR_DARK};">
            <strong>Next deadline:</strong> ${escapeHtml(nextDeadline)} documents are due soon. Please upload them at your earliest convenience.
          </td>
        </tr>
      </table>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        If you have any questions about these numbers, don't hesitate to reach out.
      </p>
      <p style="margin:12px 0 24px 0;font-size:15px;font-weight:600;color:${TEXT_PRIMARY};">
        ${escapeHtml(bookkeeperName)}
      </p>
    `)}</tr>`

  const body = wrapInLayout(
    `${month} Financial Summary`,
    htmlContent,
    `Prepared by ${escapeHtml(bookkeeperName)} for ${escapeHtml(clientName)}. This report is for informational purposes only.`,
    previewText,
  )

  const plainText = [
    `Hello ${contactName},`,
    '',
    `Here is your financial summary for ${month}.`,
    '',
    '--- KEY METRICS ---',
    `Total Income:      ${formatCurrency(income)}`,
    `Total Expenses:    ${formatCurrency(expenses)}`,
    `Net Cash Flow:     ${netCashFlow >= 0 ? '+' : ''}${formatCurrency(netCashFlow)}`,
    `Tax Deductible:    ${formatCurrency(taxDeductible)}`,
    '',
    ...(topCategories.length > 0
      ? [
          '--- TOP EXPENSE CATEGORIES ---',
          ...topCategories.slice(0, 5).map((c, i) => `  ${i + 1}. ${c.name}: ${formatCurrency(c.amount)}`),
          '',
        ]
      : []),
    ...(actionItems.length > 0
      ? ['--- ACTION ITEMS ---', ...actionItems.map((item) => `  - ${item}`), '']
      : []),
    `Next deadline: ${nextDeadline}`,
    '',
    'If you have any questions about these numbers, don\'t hesitate to reach out.',
    '',
    bookkeeperName,
  ].join('\n')

  return { subject, body, plainText, previewText }
}

// ─── THANK YOU EMAIL ─────────────────────────────────────────────────────────

interface ThankYouConfig {
  clientName: string
  contactName: string
  bookkeeperName: string
  month: string
  docsReceived: number
}

export function generateThankYouEmail(config: ThankYouConfig): EmailTemplate {
  const { clientName: _clientName2, contactName, bookkeeperName, month, docsReceived } = config

  const subject = `All ${month} documents received - thank you!`
  const previewText = `We've received all ${docsReceived} documents for ${month}. Thank you for being on top of it!`

  const htmlContent = `
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:${TEXT_PRIMARY};line-height:28px;">
        Hi ${escapeHtml(contactName)}!
      </p>
      <p style="margin:16px 0 0 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        Great news! We've received all <strong>${docsReceived}</strong> document${docsReceived !== 1 ? 's' : ''} for <strong>${escapeHtml(month)}</strong>. Thank you for staying on top of your submissions.
      </p>
    `)}</tr>
    <tr>${sectionPadding(`
      <table role="presentation" style="width:100%;border:none;border-spacing:0;padding:20px;background-color:${SUCCESS_BG};border-radius:8px;text-align:center;">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
            <div style="font-size:40px;line-height:1;">&#9989;</div>
            <p style="margin:12px 0 0 0;font-size:16px;font-weight:700;color:${SUCCESS_COLOR};">
              ${escapeHtml(month)} Complete
            </p>
            <p style="margin:4px 0 0 0;font-size:14px;color:${TEXT_SECONDARY};">
              ${docsReceived} document${docsReceived !== 1 ? 's' : ''} received and filed
            </p>
          </td>
        </tr>
      </table>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        We'll now review everything and reach out if we have any questions. Your financial reports will be ready shortly.
      </p>
    `)}</tr>
    <tr>${sectionPadding(`
      <table role="presentation" style="width:100%;border:none;border-spacing:0;padding:16px;background-color:${BG_BODY};border-radius:8px;">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:20px;color:${TEXT_MUTED};">
            <strong style="color:${TEXT_SECONDARY};">Tip:</strong> Submitting documents early each month helps us deliver faster reports and catch any issues sooner. Keep up the great work!
          </td>
        </tr>
      </table>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        Thank you for making our job easier.
      </p>
      <p style="margin:12px 0 24px 0;font-size:15px;font-weight:600;color:${TEXT_PRIMARY};">
        ${escapeHtml(bookkeeperName)}
      </p>
    `)}</tr>`

  const body = wrapInLayout(
    'Documents Received',
    htmlContent,
    `Sent on behalf of your bookkeeper. Thank you for your prompt submission!`,
    previewText,
  )

  const plainText = [
    `Hi ${contactName}!`,
    '',
    `Great news! We've received all ${docsReceived} document${docsReceived !== 1 ? 's' : ''} for ${month}. Thank you for staying on top of your submissions.`,
    '',
    `${month} - COMPLETE`,
    `${docsReceived} document${docsReceived !== 1 ? 's' : ''} received and filed`,
    '',
    'We\'ll now review everything and reach out if we have any questions. Your financial reports will be ready shortly.',
    '',
    'Tip: Submitting documents early each month helps us deliver faster reports and catch any issues sooner.',
    '',
    'Thank you for making our job easier.',
    '',
    bookkeeperName,
  ].join('\n')

  return { subject, body, plainText, previewText }
}

// ─── YEAR-END EMAIL ──────────────────────────────────────────────────────────

interface YearEndConfig {
  clientName: string
  contactName: string
  bookkeeperName: string
  year: number
  totalIncome: number
  totalExpenses: number
  totalDeductions: number
  vendors1099Count: number
  actionItems: string[]
}

export function generateYearEndEmail(config: YearEndConfig): EmailTemplate {
  const {
    clientName,
    contactName,
    bookkeeperName,
    year,
    totalIncome,
    totalExpenses,
    totalDeductions,
    vendors1099Count,
    actionItems,
  } = config

  const netProfit = totalIncome - totalExpenses
  const subject = `${year} Year-End Summary for ${clientName}`
  const previewText = `Your ${year} totals: ${formatCurrency(totalIncome)} income, ${formatCurrency(totalDeductions)} in deductions, ${vendors1099Count} vendors needing 1099s`

  const metricRow = (label: string, value: string, color: string = TEXT_PRIMARY) =>
    `<tr>
      <td style="padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;color:${TEXT_SECONDARY};border-bottom:1px solid ${BORDER_COLOR};">
        ${label}
      </td>
      <td style="padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:700;color:${color};text-align:right;border-bottom:1px solid ${BORDER_COLOR};">
        ${value}
      </td>
    </tr>`

  const actionItemsList = actionItems
    .map(
      (item, i) =>
        `<tr>
        <td style="padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;border-bottom:1px solid ${BORDER_COLOR};">
          <table role="presentation" style="width:100%;border:none;border-spacing:0;">
            <tr>
              <td style="width:28px;vertical-align:top;">
                <div style="width:24px;height:24px;border-radius:50%;background-color:${BRAND_COLOR};color:#ffffff;text-align:center;line-height:24px;font-size:12px;font-weight:700;">${i + 1}</div>
              </td>
              <td style="padding-left:8px;font-size:14px;line-height:22px;color:${TEXT_PRIMARY};">
                ${escapeHtml(item)}
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join('')

  const htmlContent = `
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:${TEXT_PRIMARY};line-height:28px;">
        Hello ${escapeHtml(contactName)},
      </p>
      <p style="margin:16px 0 0 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        As we close out <strong>${year}</strong>, here is a summary of your annual financial activity along with important items that need your attention.
      </p>
    `)}</tr>
    <tr>${sectionPadding(`
      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">
        ${year} Annual Summary
      </p>
      <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:${BG_BODY};border-radius:8px;overflow:hidden;">
        ${metricRow('Total Income', formatCurrency(totalIncome), SUCCESS_COLOR)}
        ${metricRow('Total Expenses', formatCurrency(totalExpenses), DANGER_COLOR)}
        ${metricRow('Net Profit', `${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)}`, netProfit >= 0 ? SUCCESS_COLOR : DANGER_COLOR)}
        ${metricRow('Tax Deductions', formatCurrency(totalDeductions), BRAND_COLOR)}
        ${metricRow('Vendors Requiring 1099', String(vendors1099Count), TEXT_PRIMARY)}
      </table>
    `)}</tr>
    ${vendors1099Count > 0 ? `<tr>${sectionPadding(`
      <table role="presentation" style="width:100%;border:none;border-spacing:0;padding:16px;background-color:#fffbeb;border:1px solid #f59e0b;border-radius:8px;">
        <tr>
          <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:22px;color:#92400e;">
            <strong>1099 Reminder:</strong> You have ${vendors1099Count} vendor${vendors1099Count !== 1 ? 's' : ''} that may require a 1099-NEC or 1099-MISC filing. The deadline for issuing 1099s is <strong>January 31</strong>. Please verify vendor W-9 information is current.
          </td>
        </tr>
      </table>
    `)}</tr>` : ''}
    ${actionItems.length > 0 ? `<tr>${sectionPadding(`
      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${TEXT_MUTED};">
        Year-End Action Items
      </p>
      <table role="presentation" style="width:100%;border:none;border-spacing:0;background-color:${BG_BODY};border-radius:8px;overflow:hidden;">
        ${actionItemsList}
      </table>
    `)}</tr>` : ''}
    <tr>${sectionPadding(`
      <p style="margin:0 0 4px 0;font-size:15px;line-height:24px;color:${TEXT_SECONDARY};">
        Please review these items and let me know if you have any questions. The sooner we address these, the smoother tax season will be.
      </p>
      <p style="margin:12px 0 24px 0;font-size:15px;font-weight:600;color:${TEXT_PRIMARY};">
        ${escapeHtml(bookkeeperName)}
      </p>
    `)}</tr>`

  const body = wrapInLayout(
    `${year} Year-End Summary`,
    htmlContent,
    `Prepared by ${escapeHtml(bookkeeperName)} for ${escapeHtml(clientName)}. Consult your tax professional for specific tax advice.`,
    previewText,
  )

  const plainText = [
    `Hello ${contactName},`,
    '',
    `As we close out ${year}, here is a summary of your annual financial activity.`,
    '',
    `--- ${year} ANNUAL SUMMARY ---`,
    `Total Income:      ${formatCurrency(totalIncome)}`,
    `Total Expenses:    ${formatCurrency(totalExpenses)}`,
    `Net Profit:        ${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)}`,
    `Tax Deductions:    ${formatCurrency(totalDeductions)}`,
    `Vendors Req. 1099: ${vendors1099Count}`,
    '',
    ...(vendors1099Count > 0
      ? [
          `1099 REMINDER: You have ${vendors1099Count} vendor${vendors1099Count !== 1 ? 's' : ''} that may require 1099 filing. Deadline: January 31.`,
          '',
        ]
      : []),
    ...(actionItems.length > 0
      ? [
          '--- YEAR-END ACTION ITEMS ---',
          ...actionItems.map((item, i) => `  ${i + 1}. ${item}`),
          '',
        ]
      : []),
    'Please review these items and let me know if you have any questions.',
    '',
    bookkeeperName,
  ].join('\n')

  return { subject, body, plainText, previewText }
}

// ─── CLIPBOARD + MAILTO UTILITIES ────────────────────────────────────────────

export async function copyEmailToClipboard(template: EmailTemplate): Promise<void> {
  // Try to copy as rich HTML first, fall back to plain text
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      const htmlBlob = new Blob([template.body], { type: 'text/html' })
      const textBlob = new Blob([template.plainText], { type: 'text/plain' })
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob,
        }),
      ])
      return
    } catch (error) {
      console.warn('[email-templates] Rich HTML clipboard write failed — falling back to plain text.', error)
    }

    // Fallback: copy plain text
    try {
      await navigator.clipboard.writeText(template.plainText)
      return
    } catch (error) {
      console.warn('[email-templates] Plain text clipboard write failed — falling back to legacy execCommand.', error)
    }
  }

  // Legacy fallback using execCommand
  const textarea = document.createElement('textarea')
  textarea.value = template.plainText
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function openInEmailClient(to: string, template: EmailTemplate): void {
  const subject = encodeURIComponent(template.subject)
  // mailto: body does not support HTML, so use plain text
  const body = encodeURIComponent(template.plainText)
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`

  // Use window.open with a fallback to location.href for broader compatibility
  if (typeof window !== 'undefined') {
    const win = window.open(mailto, '_blank')
    if (!win) {
      window.location.href = mailto
    }
  }
}
