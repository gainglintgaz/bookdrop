// api/stripe/webhook.ts
// Vercel serverless function: Handle Stripe webhook events.
// Processes subscription created/updated/deleted to update bookkeeper plan.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { supabaseAdmin } from '../_lib/supabase.js'

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

// Disable body parsing — Stripe needs the raw body for signature verification
export const config = { api: { bodyParser: false } }

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!stripe || !webhookSecret) {
    return res.status(500).json({ error: 'Stripe not configured' })
  }

  const sig = req.headers['stripe-signature'] as string
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' })

  let event: Stripe.Event

  try {
    const rawBody = await getRawBody(req)
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed'
    console.error('[Stripe Webhook] Signature error:', message)
    return res.status(400).json({ error: message })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const bookkeeperId = session.metadata?.bookkeeper_id
        const plan = session.metadata?.plan
        const subscriptionId = session.subscription as string

        if (bookkeeperId && plan) {
          await supabaseAdmin
            .from('bookkeepers')
            .update({
              plan,
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: session.customer as string,
            })
            .eq('id', bookkeeperId)

          console.log(`[Stripe] Bookkeeper ${bookkeeperId} upgraded to ${plan}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find bookkeeper by stripe_customer_id
        const { data: bookkeeper } = await supabaseAdmin
          .from('bookkeepers')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (bookkeeper) {
          const isActive = subscription.status === 'active' || subscription.status === 'trialing'

          if (isActive) {
            // Sync plan from the current price ID
            const priceId = subscription.items.data[0]?.price?.id
            const starterPriceId = process.env.STRIPE_PRICE_STARTER
            const proPriceId = process.env.STRIPE_PRICE_PRO
            let plan = 'free'
            if (priceId === starterPriceId) plan = 'starter'
            else if (priceId === proPriceId) plan = 'pro'

            await supabaseAdmin
              .from('bookkeepers')
              .update({
                plan,
                stripe_subscription_id: subscription.id,
              })
              .eq('id', bookkeeper.id)
          } else {
            // Subscription is canceled or past_due — downgrade to free
            await supabaseAdmin
              .from('bookkeepers')
              .update({ plan: 'free', stripe_subscription_id: null })
              .eq('id', bookkeeper.id)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        const { data: bookkeeper } = await supabaseAdmin
          .from('bookkeepers')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle()

        if (bookkeeper) {
          await supabaseAdmin
            .from('bookkeepers')
            .update({ plan: 'free', stripe_subscription_id: null })
            .eq('id', bookkeeper.id)

          console.log(`[Stripe] Bookkeeper ${bookkeeper.id} downgraded to free (subscription deleted)`)
        }
        break
      }

      default:
        // Unhandled event type — that's fine
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Webhook processing failed'
    console.error('[Stripe Webhook] Error:', message)
    return res.status(500).json({ error: message })
  }
}
