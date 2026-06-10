# Shopify Integration Guide

Integrate the Loyalty Platform with your Shopify store to earn points on purchases, display member balances, and enable offer redemptions at checkout.

## Prerequisites

- A Loyalty Platform tenant with an active API subscription key
- Shopify store with admin access
- Node.js 18+ (for webhook handler)

## Architecture Overview

```
Shopify Store
  |
  |-- orders/create webhook --> Your server (shopify-webhook-handler.ts)
  |                                |
  |                                +--> Loyalty Platform API (recordTransaction)
  |
  |-- Storefront theme (Liquid) --> Loads loyalty-sdk.umd.js from CDN
  |                                    |
  |                                    +--> Loyalty Platform API (getBalance, getOffers)
  |
  |-- Checkout Extension --> Applies offer redemption at checkout
```

## Step 1: Set Up Webhook Handler

The webhook handler receives Shopify `orders/create` webhooks and records them as loyalty transactions.

### Deploy the handler

1. Copy `shopify-webhook-handler.ts` to your server project
2. Install dependencies:
   ```bash
   npm install @loyalty/loyalty-js-sdk express crypto
   ```
3. Configure environment variables:
   ```
   LOYALTY_API_URL=https://your-apim-gateway.azure-api.net
   LOYALTY_API_KEY=your-subscription-key
   LOYALTY_TENANT_ID=your-tenant-id
   SHOPIFY_WEBHOOK_SECRET=your-shopify-webhook-secret
   ```
4. Deploy to your server (e.g., Azure Functions, AWS Lambda, or Express server)

### Register the webhook in Shopify

1. Go to **Settings > Notifications > Webhooks** in Shopify Admin
2. Create webhook:
   - Event: `Order creation`
   - Format: `JSON`
   - URL: `https://your-server.com/webhooks/shopify/orders`
3. Copy the signing secret and set it as `SHOPIFY_WEBHOOK_SECRET`

## Step 2: Display Points Balance in Storefront

### Add the SDK to your theme

1. Copy `shopify-theme-snippet.liquid` to your theme's `snippets/` directory
2. Include it in your theme layout (e.g., `theme.liquid`):
   ```liquid
   {% include 'loyalty-balance' %}
   ```
3. Update the CDN URL placeholder in the snippet to point to your hosted SDK bundle

### Configuration

The snippet expects these theme settings or metafields:
- `loyalty_api_url` - Your APIM gateway URL
- `loyalty_api_key` - Your subscription key (consider using a read-only scoped key)
- `loyalty_tenant_id` - Your tenant ID

## Step 3: Checkout Extension (Optional)

The checkout extension scaffold in `shopify-checkout-extension.ts` demonstrates how to apply loyalty offer redemptions during Shopify checkout using Shopify Functions.

### Setup

1. Create a Shopify app with the Checkout UI Extension capability
2. Use the scaffold as a starting point for your discount function
3. The extension calls the Loyalty Platform API to validate and apply redemptions

## Mapping Shopify Data to Loyalty Platform

| Shopify Field | Loyalty Platform Field | Notes |
|---|---|---|
| `order.email` | `lookupByEmail()` | Member identification |
| `order.total_price` | `amount` (in cents) | Multiply by 100 for minor units |
| `order.currency` | `currency` | ISO 4217 code |
| `order.line_items[].sku` | `skuList[].sku` | Product SKU |
| `order.line_items[].price` | `skuList[].amount` | Per-item price in cents |
| `order.id` | Idempotency via order ID | Prevents duplicate point awards |

## Troubleshooting

- **Webhook not firing**: Verify the webhook URL is publicly accessible and returns 200
- **Duplicate points**: The handler uses the Shopify order ID as idempotency key
- **Member not found**: Ensure the customer email in Shopify matches the enrolled member email
- **Rate limits**: The platform allows 1000 requests/minute per subscription key

## Support

For API documentation, see the [SDK README](/packages/loyalty-js-sdk/README.md).
