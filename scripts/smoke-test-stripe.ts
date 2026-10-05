// scripts/smoke-test-stripe.ts
//
// One-off smoke test for the Stripe integration. Run after setting
// STRIPE_SECRET_KEY + STRIPE_PRICE_STARTER + STRIPE_PRICE_PRO in your
// environment.
//
// Usage:
//   npx tsx scripts/smoke-test-stripe.ts [starter|pro]
//
// Creates a Stripe Checkout Session in TEST MODE and prints the URL. Open
// the URL in a browser to verify Stripe's hosted checkout page loads with
// the right product + price + branding. You can fill the test card
// 4242 4242 4242 4242 (any future date, any CVC) to verify end-to-end —
// or just close the page after confirming it loads correctly.
//
// This script does NOT touch your Supabase or send any email — focused check
// for the Stripe layer alone. Used in LAUNCH_CHECKLIST.md Step 2e.

import Stripe from 'stripe'

const tier = (process.argv[2] ?? 'starter').toLowerCase()
if (tier !== 'starter' && tier !== 'pro') {
  console.error('Usage: npx tsx scripts/smoke-test-stripe.ts [starter|pro]')
  process.exit(1)
}

const secretKey = process.env.STRIPE_SECRET_KEY
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY env var is not set. Set it first:')
  console.error('  PowerShell:  $env:STRIPE_SECRET_KEY = "sk_test_..."')
  console.error('  bash:         export STRIPE_SECRET_KEY="sk_test_..."')
  process.exit(1)
}

const priceId = tier === 'starter' ? process.env.STRIPE_PRICE_STARTER : process.env.STRIPE_PRICE_PRO
if (!priceId) {
  console.error(`STRIPE_PRICE_${tier.toUpperCase()} env var is not set.`)
  console.error('Get the Price ID from Stripe Dashboard → Products → click product → Pricing.')
  process.exit(1)
}

if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
  console.error('STRIPE_SECRET_KEY does not look valid (must start with sk_test_ or sk_live_)')
  process.exit(1)
}

const isLive = secretKey.startsWith('sk_live_')

console.log('─── Stripe Smoke Test ───')
console.log(`Mode:     ${isLive ? '🔴 LIVE' : 'TEST'}`)
console.log(`Tier:     ${tier}`)
console.log(`Price ID: ${priceId}`)
console.log('')

if (isLive) {
  console.log('⚠️  Using LIVE mode — any completed checkout charges a real card.')
  console.log('   For pre-launch verification, use TEST mode (sk_test_...).')
  console.log('')
}

const stripe = new Stripe(secretKey)

try {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: 'https://bookkeeper-portal.vercel.app/dashboard?checkout=success',
    cancel_url: 'https://bookkeeper-portal.vercel.app/dashboard?checkout=cancelled',
    customer_email: 'smoke-test@example.com',
    subscription_data: {
      trial_period_days: 14,
    },
    metadata: {
      smoke_test: 'true',
      tier,
    },
  })

  console.log('✓ Checkout Session created successfully')
  console.log(`  Session ID:  ${session.id}`)
  console.log(`  URL:         ${session.url}`)
  console.log('')
  console.log('Open the URL above in a browser to verify:')
  console.log(`  • Branded checkout page loads with "${tier === 'starter' ? 'BookDrop Starter' : 'BookDrop Pro'}"`)
  console.log(`  • Price shows correctly ($${tier === 'starter' ? '39' : '79'} / month)`)
  console.log('  • 14-day trial is offered')
  console.log('')
  if (!isLive) {
    console.log('In TEST mode, you can complete the checkout with:')
    console.log('  Card:    4242 4242 4242 4242')
    console.log('  Expiry:  any future date')
    console.log('  CVC:     any 3 digits')
    console.log('  ZIP:     any 5 digits')
  }
} catch (err) {
  console.error('❌ Stripe rejected the request:')
  console.error(err)
  process.exit(2)
}
