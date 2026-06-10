# Offer Service — HANDOFF (T-13 / A-13)

Offer catalog, eligibility engine, redemption workflow, and code management for the Loyalty Platform.

Port: `3004` (default via `PORT`). Base path: none.

All business endpoints are tenant-scoped; in production the tenant is resolved from the JWT, in dev with `SKIP_AUTH=true` the service trusts `x-tenant-id` + `x-user-id` headers. Admin/manager endpoints additionally require `x-user-role: admin` or `x-user-role: manager` header (or equivalent JWT claims).

## Migration

**V11** (`/services/tenant-migrations/V11__offers_redemptions.sql`): creates `offers`, `redemptions`, and `offer_codes` tables. Idempotent.

## Endpoints

### Health

- `GET /health` — `{ status: 'ok', service: 'offer-service', version: '0.2.0' }`
- `GET /ready` — `{ ready: true }`

### Offer CRUD

#### `GET /v1/offers`

List offers for the tenant. Query params: `?type=percent|fixed|bogo|threshold`, `?active=true|false`.

Response `200`:
```json
{
  "items": [
    {
      "offerId": "uuid",
      "name": "Summer Sale",
      "description": "15% off everything",
      "type": "percent",
      "value": 15,
      "minPurchase": null,
      "pointsCost": null,
      "conditionsJson": null,
      "targetingJson": null,
      "validFrom": "2026-01-01T00:00:00Z",
      "validTo": "2026-12-31T23:59:59Z",
      "maxRedemptions": null,
      "currentRedemptions": 0,
      "perMemberLimit": 1,
      "isStackable": false,
      "isActive": true,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

#### `GET /v1/offers/:id`

Returns a single offer. `404` if not found.

#### `POST /v1/offers` (admin/manager)

Create an offer. Zod-validated request body:
```json
{
  "name": "string (1-200)",
  "description": "string (optional, max 2000)",
  "type": "percent|fixed|bogo|threshold",
  "value": "number (positive)",
  "minPurchase": "number (optional)",
  "pointsCost": "integer (optional) — points member must burn to redeem",
  "conditionsJson": "object (optional)",
  "targetingJson": "object (optional) — see Eligibility Rules below",
  "validFrom": "ISO 8601 datetime",
  "validTo": "ISO 8601 datetime",
  "maxRedemptions": "integer (optional) — global cap",
  "perMemberLimit": "integer (default 1)",
  "isStackable": "boolean (default false)",
  "isActive": "boolean (default true)"
}
```

Response `201`: full offer object including generated `offerId`.

#### `PUT /v1/offers/:id` (admin/manager)

Partial update. Same schema fields, all optional.

#### `DELETE /v1/offers/:id` (admin/manager)

Soft-deactivates the offer (`isActive = false`). Response `204`.

### Personalized Eligible Offers

#### `GET /v1/members/:memberId/offers`

Returns offers the member is currently eligible for, sorted by relevance (redeemable-with-points first, then soonest-expiring first).

Response `200`:
```json
{
  "items": [
    {
      "offerId": "uuid",
      "name": "...",
      "type": "percent",
      "value": 15,
      "pointsCost": 100,
      "eligibility": {
        "eligible": true,
        "reasons": []
      },
      "...all other offer fields..."
    }
  ]
}
```

`404` if member not found.

### Redemptions

#### `POST /v1/redemptions`

Redeem an offer for a member. Request body:
```json
{
  "memberId": "uuid",
  "offerId": "uuid",
  "channel": "pos|ecommerce|mobile|admin",
  "redemptionCode": "optional string — required if offer uses codes"
}
```

Flow:
1. Validate offer active + dates + member eligibility + per-member limit not exceeded + global max not exceeded
2. If `pointsCost` set on offer: calls loyalty-engine `POST /v1/redemptions` to debit points
3. Increments `current_redemptions`, inserts redemption row
4. Publishes `points.redeemed` event (if points deducted)
5. Marks code as redeemed (if `redemptionCode` provided)

Response `201`:
```json
{
  "redemptionId": "uuid",
  "discountValue": 15,
  "pointsUsed": 100,
  "newBalance": 400
}
```

Errors: `400` validation, `404` offer/member not found, `409` code already used, `422` not eligible (with reasons).

#### `POST /v1/redemptions/:id/reverse`

Reverse a completed redemption. Decrements offer counter, marks reversed, restores points if applicable, re-enables code.

Response `200`: `{ "reversed": true }`

Errors: `404` not found, `409` already reversed.

### Offer Codes

#### `POST /v1/offers/:id/generate-codes` (admin/manager)

Bulk-generate unique codes for an offer.

Request: `{ "count": 100, "prefix": "SUMMER" }`

Response `201`: `{ "codes": ["SUMMER-A1B2C3D4", ...], "count": 100 }`

#### `GET /v1/offers/:id/codes?status=available`

List codes for an offer. Optional `?status=available|assigned|redeemed|expired` filter.

Response `200`: `{ "codes": [{ "code": "...", "status": "available", "memberId": null }] }`

## Eligibility Rules

The `evaluateEligibility(member, offer, memberRedemptionCount, currentTimestamp)` pure function checks:

1. **offer_inactive** — `isActive` must be `true`
2. **offer_not_started** — current time must be >= `validFrom`
3. **offer_expired** — current time must be <= `validTo`
4. **max_global_redemptions_reached** — `currentRedemptions < maxRedemptions` (if set)
5. **per_member_limit_reached** — member's completed redemption count < `perMemberLimit`
6. **insufficient_points** — member must have >= `pointsCost` balance (if `pointsCost` > 0)
7. **tier_mismatch** — member's tier must be in `targetingJson.requiredTiers` (if set)
8. **tier_excluded** — member's tier must NOT be in `targetingJson.excludedTiers` (if set)
9. **below_minimum_points_balance** — member balance must be >= `targetingJson.minPointsBalance` (if set)
10. **member_status_mismatch** — member status must match `targetingJson.requiredStatus` (if set)

### `targetingJson` schema
```json
{
  "requiredTiers": ["gold", "platinum"],
  "excludedTiers": ["bronze"],
  "minPointsBalance": 500,
  "requiredStatus": "active"
}
```

All fields are optional. When omitted, the corresponding check is skipped.

## Event Schema

### `points.redeemed` (published when points are deducted)

Topic: `points.redeemed`. Wrapped in `EventEnvelope`.

```json
{
  "memberId": "uuid",
  "redemptionId": "uuid",
  "offerId": "uuid",
  "points": 100,
  "balanceAfter": 400
}
```

## Environment Variables

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 3004) |
| `NODE_ENV` | `development` / `production` |
| `LOG_LEVEL` | pino level |
| `KEY_VAULT_URI` | Azure Key Vault for tenant-DB secrets |
| `CONTROL_PLANE_SQL_CONNSTR` | mssql connection string for control plane |
| `REDIS_URL` | ioredis-compatible URL |
| `SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus namespace connection |
| `LOYALTY_ENGINE_URL` | Base URL for loyalty-engine (for points redemption) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights telemetry |
| `SKIP_AUTH` | `true` in dev to trust `x-tenant-id`/`x-user-id` headers |

## In-memory Mode

When infrastructure env vars are unset, the service boots with in-memory adapters. Used for unit/integration tests and local dev. NOT suitable for production.

## Tests

- **Unit**: eligibility engine (100% rule coverage, 25 cases), zod schemas (12 cases), code generation (6 cases)
- **Integration** (supertest + in-memory): full CRUD, eligible offers, redemption happy path, double-redeem blocked, code redemption, reverse, validation errors — 32 cases
- **Health**: 2 cases

```
pnpm --filter @loyalty/offer-service build   # 0 errors
pnpm --filter @loyalty/offer-service test    # 77 tests, all passing
```

## Coordination Notes

- **A-05 (loyalty-engine)** — This service calls `POST /v1/redemptions` on the loyalty engine to debit points when an offer has a `pointsCost`. The engine validates balance only; offer validity is handled here. On reversal, this service restores points via the engine.
- **A-04 (member-service)** — Member lookup via `MemberClient.getMember(tenantId, memberId)`. Expected shape: `{ memberId, tenantId, status, tierId, pointsBalance }`.
- **A-14 (e-commerce SDK)** — Import `GET /v1/members/:memberId/offers` for eligible offers at checkout. Response schema documented above.
- **A-15 (mobile API)** — Same `GET /v1/members/:memberId/offers` endpoint.
- **A-16 (analytics)** — Subscribes to `points.redeemed` events published by this service. Payload schema documented above.
- **A-11 (admin API)** — Admin endpoints (`POST /v1/offers`, `PUT`, `DELETE`, `POST generate-codes`) require `admin` or `manager` role.

## Files

```
services/offer-service/src/
  index.ts              bootstrap, in-memory fallback
  config.ts             zod env schema
  routes.ts             Express router with Zod validation
  service.ts            business logic orchestrator
  eligibility.ts        pure eligibility function (100% covered)
  code-generator.ts     bulk code generation
  schemas.ts            Zod request schemas
  deps.ts               dependency interfaces
  in-memory.ts          in-memory adapters for tests/dev
services/offer-service/tests/
  health.test.ts        health endpoint smoke tests
  eligibility.test.ts   pure eligibility engine — 25 cases
  schemas.test.ts       Zod schema validation — 12 cases
  code-generator.test.ts code generation — 6 cases
  integration.test.ts   HTTP integration — 32 cases
```
