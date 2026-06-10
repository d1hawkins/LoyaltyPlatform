/**
 * Shopify orders/create Webhook Handler
 *
 * Express route handler that receives Shopify order webhooks,
 * verifies the HMAC signature, and records a loyalty transaction.
 *
 * Environment variables:
 *   LOYALTY_API_URL          - Loyalty Platform APIM gateway URL
 *   LOYALTY_API_KEY          - APIM subscription key
 *   LOYALTY_TENANT_ID        - Tenant identifier
 *   SHOPIFY_WEBHOOK_SECRET   - Shopify webhook signing secret
 */

import { createHmac } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { LoyaltyClient } from '@loyalty/loyalty-js-sdk';

// ---- Types ----

interface ShopifyLineItem {
  sku: string;
  price: string;
  quantity: number;
  product_id: number;
  variant_id: number;
  title: string;
}

interface ShopifyOrder {
  id: number;
  email: string;
  total_price: string;
  currency: string;
  line_items: ShopifyLineItem[];
  created_at: string;
  financial_status: string;
  customer?: {
    email: string;
    phone?: string;
  };
}

// ---- Signature Verification ----

function verifyShopifyHmac(body: Buffer, secret: string, headerHmac: string): boolean {
  const computed = createHmac('sha256', secret).update(body).digest('base64');
  // Constant-time comparison
  if (computed.length !== headerHmac.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= (computed.charCodeAt(i) ?? 0) ^ (headerHmac.charCodeAt(i) ?? 0);
  }
  return mismatch === 0;
}

// ---- Initialize Loyalty Client ----

function createLoyaltyClient(): LoyaltyClient {
  const apiUrl = process.env['LOYALTY_API_URL'];
  const apiKey = process.env['LOYALTY_API_KEY'];
  const tenantId = process.env['LOYALTY_TENANT_ID'];

  if (!apiUrl || !apiKey || !tenantId) {
    throw new Error('Missing LOYALTY_API_URL, LOYALTY_API_KEY, or LOYALTY_TENANT_ID');
  }

  return new LoyaltyClient({ apiUrl, apiKey, tenantId });
}

// ---- Webhook Handler ----

/**
 * Express middleware for handling Shopify orders/create webhooks.
 *
 * Usage:
 * ```ts
 * import express from 'express';
 * import { shopifyOrderWebhookHandler } from './shopify-webhook-handler';
 *
 * const app = express();
 * // IMPORTANT: use raw body parser for webhook signature verification
 * app.post('/webhooks/shopify/orders', express.raw({ type: 'application/json' }), shopifyOrderWebhookHandler);
 * ```
 */
export async function shopifyOrderWebhookHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const secret = process.env['SHOPIFY_WEBHOOK_SECRET'];
  if (!secret) {
    console.error('SHOPIFY_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook secret not configured' });
    return;
  }

  // 1. Verify HMAC signature
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256') ?? '';
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));

  if (!verifyShopifyHmac(rawBody, secret, hmacHeader)) {
    console.warn('Invalid Shopify webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // 2. Parse order
  const order: ShopifyOrder = Buffer.isBuffer(req.body)
    ? JSON.parse(req.body.toString('utf-8'))
    : req.body;

  // 3. Only process paid orders
  if (order.financial_status !== 'paid') {
    console.info(`Skipping order ${order.id} — status: ${order.financial_status}`);
    res.status(200).json({ status: 'skipped', reason: 'not paid' });
    return;
  }

  // 4. Lookup member by email
  const client = createLoyaltyClient();
  const email = order.customer?.email ?? order.email;

  if (!email) {
    console.warn(`Order ${order.id} has no email — cannot attribute loyalty points`);
    res.status(200).json({ status: 'skipped', reason: 'no email' });
    return;
  }

  const member = await client.lookupByEmail(email);
  if (!member) {
    console.info(`No loyalty member found for email: ${email}`);
    res.status(200).json({ status: 'skipped', reason: 'member not found' });
    return;
  }

  // 5. Record transaction
  const amountCents = Math.round(parseFloat(order.total_price) * 100);
  const skuList = order.line_items.map((item) => ({
    sku: item.sku || `shopify-${item.product_id}`,
    amount: Math.round(parseFloat(item.price) * 100) * item.quantity,
  }));

  try {
    const result = await client.recordTransaction({
      memberId: member.id,
      channel: 'ecommerce',
      amount: amountCents,
      currency: order.currency,
      skuList,
      occurredAt: order.created_at,
    });

    console.info(
      `Order ${order.id}: awarded ${result.pointsEarned} points to member ${member.id} (new balance: ${result.newBalance})`,
    );

    res.status(200).json({
      status: 'processed',
      orderId: order.id,
      memberId: member.id,
      pointsEarned: result.pointsEarned,
      newBalance: result.newBalance,
    });
  } catch (err) {
    console.error(`Failed to record transaction for order ${order.id}:`, err);
    // Return 200 to Shopify to prevent retries — log the error for investigation
    res.status(200).json({ status: 'error', orderId: order.id });
  }
}
