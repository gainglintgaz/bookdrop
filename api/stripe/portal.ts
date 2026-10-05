// api/stripe/portal.ts
// Vercel serverless function: Create a Stripe Customer Portal session.
// Lets existing subscribers manage their billing, cancel, change plan.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { supabaseAdmin } from '../_lib/supabase.js'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' })
  }

  const { bookkeeperId } = req.body ?? {}
  if (!bookkeeperId) return res.status(400).json({ error: 'Missing bookkeeperId' })

  try {
    const { data: bookkeeper, error } = await supabaseAdmin
      .from('bookkeepers')
      .select('stripe_customer_id')
      .eq('id', bookkeeperId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!bookkeeper?.stripe_customer_id) {
      return res.status(400).json({ error: 'No Stripe customer found. Please upgrade first.' })
    }

    const baseUrl = req.headers.origin ?? 'https://bookkeeper-portal.vercel.app'

    const session = await stripe.billingPortal.sessions.create({
      customer: bookkeeper.stripe_customer_id,
      return_url: `${baseUrl}/settings`,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe Portal] Error:', message)
    return res.status(500).json({ error: message })
  }
}
