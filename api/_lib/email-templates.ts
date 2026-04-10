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
