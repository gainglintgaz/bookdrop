// api/_lib/email-templates.ts
// HTML email templates for BookDrop notifications.
// Simple, clean, mobile-friendly — no React Email dependency needed.

interface ReminderEmailData {
  clientName: string
  businessName: string
  practitionerName: string
  practiceName: string
  portalUrl: string
  periodLabel: string
  missingDocs: string[]
  reminderNumber: number
  tone: 'friendly' | 'professional' | 'firm'
}

export function reminderEmailHtml(data: ReminderEmailData): string {
  const greeting = data.tone === 'friendly'
    ? `Hi ${data.clientName || 'there'}! 👋`
    : data.tone === 'firm'
    ? `Dear ${data.clientName || 'Client'},`
    : `Hello ${data.clientName || 'there'},`

  const urgency = data.reminderNumber >= 3
    ? '<p style="color:#dc2626;font-weight:600;">This is an urgent reminder — your documents are overdue.</p>'
    : data.reminderNumber === 2
    ? '<p style="color:#ca8a04;">This is a follow-up reminder.</p>'
    : ''

  const missingList = data.missingDocs.length > 0
    ? `<ul style="margin:12px 0;padding-left:20px;">${data.missingDocs.map(d => `<li style="margin:4px 0;">${d}</li>`).join('')}</ul>`
    : '<p>Please upload your documents at your earliest convenience.</p>'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:white;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">${data.practiceName || data.practitionerName}</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Document reminder for ${data.periodLabel}</p>

    <p style="font-size:15px;color:#374151;">${greeting}</p>

    ${urgency}

    <p style="font-size:14px;color:#374151;margin:16px 0 8px;">
      We're still waiting on the following documents for <strong>${data.businessName}</strong>:
    </p>
    ${missingList}

    <div style="text-align:center;margin:28px 0;">
      <a href="${data.portalUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        Upload Documents
      </a>
    </div>

    <p style="font-size:13px;color:#6b7280;margin-top:24px;">
      Questions? Reply to this email or contact ${data.practitionerName} directly.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
    Sent by BookDrop on behalf of ${data.practiceName || data.practitionerName}
  </p>
</div>
</body>
</html>`
}

interface UploadNotificationData {
  clientBusinessName: string
  clientContactName: string | null
  fileName: string
  periodLabel: string
  isComplete: boolean
  uploadedCount: number
  requiredCount: number
  dashboardUrl: string
}

export function uploadNotificationHtml(data: UploadNotificationData): string {
  const statusBadge = data.isComplete
    ? '<span style="display:inline-block;background:#dcfce7;color:#166534;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">All Complete</span>'
    : `<span style="display:inline-block;background:#fef3c7;color:#854d0e;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${data.uploadedCount}/${data.requiredCount} received</span>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:white;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#111827;">New Upload from ${data.clientBusinessName}</h2>

    <table style="width:100%;font-size:14px;color:#374151;">
      <tr><td style="padding:6px 0;color:#6b7280;">Client</td><td style="padding:6px 0;font-weight:500;">${data.clientBusinessName}</td></tr>
      ${data.clientContactName ? `<tr><td style="padding:6px 0;color:#6b7280;">Contact</td><td style="padding:6px 0;">${data.clientContactName}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#6b7280;">File</td><td style="padding:6px 0;">${data.fileName}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Period</td><td style="padding:6px 0;">${data.periodLabel}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Status</td><td style="padding:6px 0;">${statusBadge}</td></tr>
    </table>

    <div style="text-align:center;margin:28px 0;">
      <a href="${data.dashboardUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        View in Dashboard
      </a>
    </div>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">BookDrop Upload Notification</p>
</div>
</body>
</html>`
}

export function welcomeEmailHtml(data: {
  clientName: string
  businessName: string
  practitionerName: string
  practiceName: string
  portalUrl: string
  periodLabel: string
  dueDay: number
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
  <div style="background:white;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#111827;">${data.practiceName || data.practitionerName}</h2>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">You've been invited to upload documents</p>

    <p style="font-size:15px;color:#374151;">Hi ${data.clientName || 'there'},</p>

    <p style="font-size:14px;color:#374151;margin:16px 0;">
      ${data.practitionerName} has set up a secure document portal for <strong>${data.businessName}</strong>.
      Please upload your monthly financial documents by the <strong>${data.dueDay}th of each month</strong>.
    </p>

    <div style="text-align:center;margin:28px 0;">
      <a href="${data.portalUrl}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        Open Your Upload Portal
      </a>
    </div>

    <p style="font-size:13px;color:#6b7280;">
      Save this link — you'll use it every month. No account or password needed.
    </p>

    <p style="font-size:13px;color:#6b7280;margin-top:24px;">
      Questions? Reply to this email to reach ${data.practitionerName} directly.
    </p>
  </div>
  <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px;">
    Sent by BookDrop on behalf of ${data.practiceName || data.practitionerName}
  </p>
</div>
</body>
</html>`
}


// ─── BLOCK 3 E1: Signature confirmation emails ───────────────────────────────
// Sent after a successful e-signature commit. Two templates: one for the signer
// (client-facing, "you signed [doc]"), one for the bookkeeper ("[client] signed [doc]").
// Both include audit details so the trail is preserved in the recipient's inbox.

interface SignerConfirmationData {
  signerName: string
  documentLabel: string
  practitionerName: string
  practiceName: string
  signedAt: string                 // ISO timestamp
  ipAddress: string | null
  userAgent: string | null
  consentVersion: string
  signedDocumentUrl: string | null // 1-hour signed URL; may be null if storage save failed
  practitionerReplyTo: string | null
}

function escapeHtmlSafe(s: string | null | undefined): string {
  if (s == null) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Email sent to the SIGNER confirming their signature. */
export function signerConfirmationEmailHtml(data: SignerConfirmationData): string {
  const signedAtPretty = new Date(data.signedAt).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>You signed ${escapeHtmlSafe(data.documentLabel)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 22px; color: #065f46;">✓ Signature received</h1>
  </div>

  <p>Hi ${escapeHtmlSafe(data.signerName)},</p>

  <p>This is a confirmation that you signed <strong>${escapeHtmlSafe(data.documentLabel)}</strong>${data.practiceName ? ` for ${escapeHtmlSafe(data.practiceName)}` : ''} on ${escapeHtmlSafe(signedAtPretty)}.</p>

  ${data.signedDocumentUrl ? `
  <p>
    <a href="${data.signedDocumentUrl}" style="display: inline-block; background: #10b981; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      Download Signed Copy
    </a>
  </p>
  <p style="font-size: 12px; color: #6b7280;">This download link expires in 1 hour. If you need access later, ask ${escapeHtmlSafe(data.practitionerName || 'your practitioner')} for a fresh link.</p>
  ` : `
  <p style="font-size: 12px; color: #6b7280;">A copy of the signed document is available from ${escapeHtmlSafe(data.practitionerName || 'your practitioner')} on request.</p>
  `}

  <h3 style="margin-top: 32px; font-size: 14px; color: #374151;">Signing audit record</h3>
  <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 8px;">
    <tr><td style="padding: 4px 0; color: #6b7280; width: 35%;">Signed at</td><td style="padding: 4px 0;">${escapeHtmlSafe(signedAtPretty)}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">IP address</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtmlSafe(data.ipAddress) || '—'}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Browser</td><td style="padding: 4px 0; font-size: 11px;">${escapeHtmlSafe(data.userAgent) || '—'}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Disclosure version</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtmlSafe(data.consentVersion)}</td></tr>
  </table>

  <p style="margin-top: 24px; padding: 12px; background: #f9fafb; border-radius: 4px; font-size: 12px; color: #6b7280;">
    If you did not authorize this signature, contact ${escapeHtmlSafe(data.practitionerName || 'your practitioner')}${data.practitionerReplyTo ? ` at <a href="mailto:${escapeHtmlSafe(data.practitionerReplyTo)}">${escapeHtmlSafe(data.practitionerReplyTo)}</a>` : ''} immediately.
  </p>

  <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
    This signature was captured under the federal ESIGN Act (15 U.S.C. §§ 7001-7031) and the Uniform Electronic Transactions Act (UETA).
  </p>
</body>
</html>`
}

/** Email sent to the BOOKKEEPER notifying them their client signed. */
export function bookkeeperSignatureNotificationHtml(data: SignerConfirmationData): string {
  const signedAtPretty = new Date(data.signedAt).toLocaleString('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtmlSafe(data.signerName)} signed ${escapeHtmlSafe(data.documentLabel)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
  <div style="border-bottom: 2px solid #10b981; padding-bottom: 16px; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 20px; color: #065f46;">Signature received</h1>
  </div>

  <p><strong>${escapeHtmlSafe(data.signerName)}</strong> signed <strong>${escapeHtmlSafe(data.documentLabel)}</strong> on ${escapeHtmlSafe(signedAtPretty)}.</p>

  ${data.signedDocumentUrl ? `
  <p>
    <a href="${data.signedDocumentUrl}" style="display: inline-block; background: #10b981; color: white; padding: 10px 18px; border-radius: 6px; text-decoration: none; font-weight: 600;">
      Download Signed Copy
    </a>
  </p>
  <p style="font-size: 12px; color: #6b7280;">Link expires in 1 hour. The signed PDF is also stored in your dashboard for permanent access.</p>
  ` : `
  <p style="font-size: 13px; color: #b45309; background: #fef3c7; padding: 10px; border-radius: 4px;">
    ⚠️ The signed PDF could not be saved to storage. Please check the audit log and contact support.
  </p>
  `}

  <h3 style="margin-top: 32px; font-size: 14px; color: #374151;">Audit record</h3>
  <table style="width: 100%; font-size: 13px; border-collapse: collapse; margin-top: 8px;">
    <tr><td style="padding: 4px 0; color: #6b7280; width: 35%;">Signer name</td><td style="padding: 4px 0;">${escapeHtmlSafe(data.signerName)}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Signed at</td><td style="padding: 4px 0;">${escapeHtmlSafe(signedAtPretty)}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">IP address</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtmlSafe(data.ipAddress) || '—'}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Browser</td><td style="padding: 4px 0; font-size: 11px;">${escapeHtmlSafe(data.userAgent) || '—'}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Disclosure version</td><td style="padding: 4px 0; font-family: monospace; font-size: 12px;">${escapeHtmlSafe(data.consentVersion)}</td></tr>
  </table>

  <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
    Signature captured per ESIGN Act + UETA. Full audit log is available in your BookDrop dashboard.
  </p>
</body>
</html>`
}
