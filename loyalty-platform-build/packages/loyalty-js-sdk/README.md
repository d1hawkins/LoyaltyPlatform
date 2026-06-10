# @loyalty/loyalty-js-sdk

Client-side JavaScript SDK for the Loyalty Platform. Provides a typed client for all loyalty operations (enrollment, transactions, balance, offers, ledger) plus pre-built widgets for rendering points balance, offers, and tier progress in the browser.

## Installation

```bash
npm install @loyalty/loyalty-js-sdk
# or
pnpm add @loyalty/loyalty-js-sdk
```

### CDN (UMD bundle for script tags)

```html
<script src="https://cdn.example.com/loyalty-sdk/latest/loyalty-sdk.umd.js"></script>
<script>
  const client = new LoyaltySDK.LoyaltyClient({ ... });
</script>
```

## Initialization

```ts
import { LoyaltyClient } from '@loyalty/loyalty-js-sdk';

const client = new LoyaltyClient({
  apiUrl: 'https://loyalty-dev-apim-5rdrqh.azure-api.net',
  apiKey: 'your-apim-subscription-key',
  tenantId: 'your-tenant-id',
  timeout: 10000,   // optional, default 10s
  maxRetries: 2,    // optional, default 2 retries on 429/5xx
});
```

### Headers injected automatically

| Header | Value | On |
|---|---|---|
| `Authorization` | `Bearer {apiKey}` | All requests |
| `X-Tenant-ID` | `{tenantId}` | All requests |
| `Ocp-Apim-Subscription-Key` | `{apiKey}` | All requests |
| `Idempotency-Key` | UUID v4 | POST requests |
| `Content-Type` | `application/json` | POST/PATCH requests |

### Retry behavior

- Retries on HTTP 429 (rate limit) and 5xx (server error)
- Exponential backoff: 500ms, 1000ms
- Configurable via `maxRetries` (default: 2)

## API Reference

### Members

```ts
// Enroll a new member
const member = await client.enrollMember({
  phone: '+15555551234',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',       // optional
  dateOfBirth: '1990-05-15',       // optional
  enrolledChannel: 'ecommerce',
});

// Get member by ID
const member = await client.getMember('member-uuid');

// Lookup by phone (returns null if not found)
const member = await client.lookupByPhone('+15555551234');

// Lookup by email (returns null if not found)
const member = await client.lookupByEmail('jane@example.com');
```

### Transactions

```ts
// Record a purchase transaction
const result = await client.recordTransaction({
  memberId: 'member-uuid',
  channel: 'ecommerce',
  amount: 2500,              // in cents (minor currency units)
  currency: 'USD',
  skuList: [                 // optional
    { sku: 'COFFEE-12', categoryId: 'beverages', amount: 2500 }
  ],
  locationId: 'store-42',   // optional
  occurredAt: '2026-04-09T10:00:00Z',  // optional, defaults to now
});
// result: { transactionId, pointsEarned, newBalance, tierId, appliedMultipliers }

// Void a transaction
await client.voidTransaction('transaction-uuid', 'customer return');
```

### Balance

```ts
const { balance, lastUpdated } = await client.getBalance('member-uuid');
```

### Offers

```ts
// Get eligible offers for a member (requires Offer Service / A-13)
const offers = await client.getEligibleOffers('member-uuid');

// Redeem an offer
const result = await client.redeemOffer({
  memberId: 'member-uuid',
  offerId: 'offer-uuid',
  pointsToBurn: 200,
  redemptionContext: {},  // optional
});
// result: { redemptionId, pointsUsed, newBalance }
```

### Ledger

```ts
// Get paginated ledger
const page1 = await client.getLedger('member-uuid', { limit: 20 });
// page1: { items: LedgerEntry[], nextCursor?: string }

// Get next page
if (page1.nextCursor) {
  const page2 = await client.getLedger('member-uuid', {
    after: page1.nextCursor,
    limit: 20,
  });
}
```

## Widgets

Pre-built UI widgets that render into any DOM element. Minimal inline styles, no external CSS required.

```ts
import {
  renderBalanceWidget,
  renderOffersWidget,
  renderTierProgressWidget,
} from '@loyalty/loyalty-js-sdk';

// Balance display
const balanceEl = document.getElementById('balance');
await renderBalanceWidget(balanceEl, client, 'member-uuid');

// Eligible offers list
const offersEl = document.getElementById('offers');
await renderOffersWidget(offersEl, client, 'member-uuid');

// Tier progress bar
const tierEl = document.getElementById('tier');
await renderTierProgressWidget(tierEl, client, 'member-uuid');
```

### UMD (script tag) usage

```html
<div id="balance"></div>
<div id="offers"></div>
<div id="tier"></div>

<script src="https://cdn.example.com/loyalty-sdk/latest/loyalty-sdk.umd.js"></script>
<script>
  var client = new LoyaltySDK.LoyaltyClient({
    apiUrl: 'https://your-apim.azure-api.net',
    apiKey: 'your-key',
    tenantId: 'your-tenant'
  });

  LoyaltySDK.renderBalanceWidget(document.getElementById('balance'), client, 'member-uuid');
  LoyaltySDK.renderOffersWidget(document.getElementById('offers'), client, 'member-uuid');
  LoyaltySDK.renderTierProgressWidget(document.getElementById('tier'), client, 'member-uuid');
</script>
```

## Error Handling

All errors extend `LoyaltyError`:

```ts
import { LoyaltyError, NotFoundError, RateLimitError } from '@loyalty/loyalty-js-sdk';

try {
  await client.getMember('nonexistent');
} catch (err) {
  if (err instanceof NotFoundError) {
    console.log('Member not found');
  } else if (err instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${err.retryAfterMs}ms`);
  } else if (err instanceof LoyaltyError) {
    console.log(`Error ${err.code}: ${err.message}`);
  }
}
```

| Error Class | HTTP Status | Code |
|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` |
| `UnauthorizedError` | 401 | `UNAUTHORIZED` |
| `ForbiddenError` | 403 | `FORBIDDEN` |
| `NotFoundError` | 404 | `NOT_FOUND` |
| `ConflictError` | 409 | `CONFLICT` |
| `RateLimitError` | 429 | `RATE_LIMIT` |
| `ServerError` | 5xx | `SERVER_ERROR` |
| `TimeoutError` | - | `TIMEOUT` |

## E-Commerce Platform Integrations

### Shopify

Step-by-step guide and ready-to-use scripts at [`/integrations/shopify/`](/integrations/shopify/README.md):
- Webhook handler for `orders/create` (auto-awards points)
- Liquid snippet for storefront balance display
- Checkout extension scaffold for offer redemption

### WooCommerce

WordPress plugin and shortcode at [`/integrations/woocommerce/`](/integrations/woocommerce/README.md):
- Auto-awards points on `woocommerce_payment_complete`
- `[loyalty_balance]` shortcode for balance widget
- My Account tab with full loyalty dashboard

## API Routes

The SDK maps to the following APIM-proxied service endpoints:

| SDK Method | HTTP | Path |
|---|---|---|
| `enrollMember` | POST | `/member/v1/members` |
| `getMember` | GET | `/member/v1/members/:id` |
| `lookupByPhone` | GET | `/member/v1/members?phone=` |
| `lookupByEmail` | GET | `/member/v1/members?email=` |
| `recordTransaction` | POST | `/engine/v1/transactions` |
| `voidTransaction` | POST | `/engine/v1/transactions/:id/void` |
| `getBalance` | GET | `/engine/v1/members/:id/balance` |
| `getEligibleOffers` | GET | `/member/v1/members/:id/offers` |
| `redeemOffer` | POST | `/engine/v1/redemptions` |
| `getLedger` | GET | `/member/v1/members/:id/ledger` |

## Build & Test

```bash
pnpm --filter @loyalty/loyalty-js-sdk build   # TypeScript + esbuild bundles
pnpm --filter @loyalty/loyalty-js-sdk test    # Jest tests (jsdom)
npm pack                                       # Produces tarball
```

## Coordination Notes

- **A-04 (Member Service)**: SDK calls `/member/v1/members` endpoints. See `/services/member-service/HANDOFF.md`.
- **A-05 (Loyalty Engine)**: SDK calls `/engine/v1/transactions` and `/engine/v1/redemptions`. See `/services/loyalty-engine/HANDOFF.md`.
- **A-07 (APIM)**: SDK sends `Ocp-Apim-Subscription-Key` for gateway auth. See `/infra/apim/HANDOFF.md`.
- **A-13 (Offer Service)**: `getEligibleOffers()` and `redeemOffer()` depend on the Offer Service. If A-13 is not yet deployed, these methods will return errors.
