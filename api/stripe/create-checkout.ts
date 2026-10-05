// api/stripe/create-checkout.ts
// Vercel serverless function: Create a Stripe Checkout session for plan upgrade.
// Called from the Settings page "Upgrade" button.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { supabaseAdmin } from '../_lib/supabase.js'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

// Price IDs — set these in Vercel env vars or hardcode after creating products in Stripe Dashboard
const PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY in environment.' })
  }

  const { bookkeeperId, plan } = req.body ?? {}

  if (!bookkeeperId || !plan) {
    return res.status(400).json({ error: 'Missing bookkeeperId or plan' })
  }

  const priceId = PRICE_IDS[plan]
  if (!priceId) {
    return res.status(400).json({ error: `No Stripe price configured for plan: ${plan}. Set STRIPE_PRICE_${plan.toUpperCase()} in env.` })
  }

  try {
    // Get bookkeeper
    const { data: bookkeeper, error: bkErr } = await supabaseAdmin
      .from('bookkeepers')
      .select('email, stripe_customer_id')
      .eq('id', bookkeeperId)
      .maybeSingle()

    if (bkErr) throw new Error(bkErr.message)
    if (!bookkeeper) return res.status(404).json({ error: 'Bookkeeper not found' })

    // Create or reuse Stripe customer
    let customerId = bookkeeper.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: bookkeeper.email,
        metadata: { bookkeeper_id: bookkeeperId },
      })
      customerId = customer.id

      // Save customer ID
      await supabaseAdmin
        .from('bookkeepers')
        .update({ stripe_customer_id: customerId })
        .eq('id', bookkeeperId)
    }

    // Create checkout session
    const baseUrl = req.headers.origin ?? 'https://bookkeeper-portal.vercel.app'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/settings?upgraded=true`,
      cancel_url: `${baseUrl}/settings?upgraded=false`,
      metadata: { bookkeeper_id: bookkeeperId, plan },
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe Checkout] Error:', message)
    return res.status(500).json({ error: message })
  }
}
