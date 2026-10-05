// scripts/smoke-test-resend.ts
//
// One-off smoke test for the Resend integration. Run after setting
// RESEND_API_KEY (+ optionally RESEND_FROM_EMAIL) in your environment.
//
// Usage:
//   npx tsx scripts/smoke-test-resend.ts <recipient-email>
//
// Sends a test email and prints the Resend response. If your test inbox
// receives the email within ~30 seconds, the integration is working.
//
// This script does NOT touch Supabase — it's a focused integration check
// for the email layer alone. Used in LAUNCH_CHECKLIST.md Step 1d.

import { Resend } from 'resend'

const recipient = process.argv[2]
if (!recipient) {
  console.error('Usage: npx tsx scripts/smoke-test-resend.ts <recipient-email>')
  process.exit(1)
}

const apiKey = process.env.RESEND_API_KEY
if (!apiKey) {
  console.error('RESEND_API_KEY env var is not set. Set it first:')
  console.error('  PowerShell:  $env:RESEND_API_KEY = "re_..."')
  console.error('  bash:         export RESEND_API_KEY="re_..."')
  process.exit(1)
}

const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'BookDrop <onboarding@resend.dev>'

console.log('─── Resend Smoke Test ───')
console.log(`From:  ${fromEmail}`)
console.log(`To:    ${recipient}`)
console.log('')

const resend = new Resend(apiKey)

try {
  const { data, error } = await resend.emails.send({
    from: fromEmail,
    to: recipient,
    subject: '[BookDrop test] Resend smoke test',
    html: `
      <h2 style="font-family: -apple-system, sans-serif; color: #065f46;">✓ Resend integration working</h2>
      <p>This email was sent by <code>scripts/smoke-test-resend.ts</code> at ${new Date().toISOString()}.</p>
      <p>If you received this, your Resend API key is valid and the integration is healthy.</p>
      <p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
        BookDrop launch smoke test — safe to delete this email.
      </p>
    `,
  })

  if (error) {
    console.error('❌ Resend rejected the request:')
    console.error(error)
    process.exit(2)
  }

  console.log('✓ Email sent successfully')
  console.log(`  Resend email ID: ${data?.id}`)
  console.log('')
  console.log('Check the recipient inbox within 30 seconds.')
  console.log('If the email doesn\'t arrive:')
  console.log('  • Check spam folder')
  console.log('  • Verify the from-domain is verified in Resend dashboard')
  console.log('  • Check Resend logs at https://resend.com/emails')
} catch (err) {
  console.error('❌ Smoke test threw:')
  console.error(err)
  process.exit(3)
}
