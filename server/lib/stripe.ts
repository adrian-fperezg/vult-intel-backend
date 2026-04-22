import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  console.warn('[Stripe] STRIPE_SECRET_KEY is missing from environment.');
}

export const stripe = stripeSecretKey 
  ? new Stripe(stripeSecretKey, {
      apiVersion: '2025-02-24-preview' as any,
    })
  : null as any;

/**
 * Verify a Stripe webhook signature using raw body and header.
 */
export function verifyStripeSignature(payload: string | Buffer, sig: string) {
  if (!stripeWebhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is missing');
  }
  return stripe.webhooks.constructEvent(payload, sig, stripeWebhookSecret);
}
