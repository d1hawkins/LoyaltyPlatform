# Loyalty Engine — HANDOFF (T-05 / A-05)

Transaction processing, points calculation, immutable ledger, idempotent writes, and canonical Service Bus event publication for the Loyalty Platform.

Port: `3002` (default via `PORT`). Base path: none (no global prefix).

All write endpoints require an `Idempotency-Key` HTTP header. All endpoints are tenant-scoped; in production the tenant is resolved from the JWT, in dev with `SKIP_AUTH=true` the service trusts `x-tenant-id` + `x-user-id` headers. Admin-only endpoints additionally require `roles: ['admin']` in the JWT or, in dev, the `x-user-role: admin` header.

## Endpoints

### POST /v1/transactions
Create an earn transaction and its ledger entry atomically.

Headers:
- `Idempotency-Key: <string>` (required, 24h retention)
- `x-tenant-id`, `x-user-id` (dev only)

Request body:
```json
{
  "memberId": "uuid",
  "channel": "pos|ecommerce|mobile|admin",
  "amount": 2500,
  "currency": "USD",
  "skuList": [
    { "sku": "COFFEE-12", "categoryId": "beverages", "amount": 2500 }
  ],
  "locationId": "store-42",
  "occurredAt": "2026-04-09T10:00:00Z"
}
```
`amount` and each `skuList[].amount` are in minor currency units (cents for USD/GBP/EUR, whole units for JPY).

Response `201 Created`:
```json
{
  "transactionId": "uuid",
  "pointsEarned": 25,
  "newBalance": 125,
  "tierId": "silver",
  "appliedMultipliers": [
    { "source": "category:beverages", "multiplier": 2, "points": 25 }
  ]
}
```

Errors: `400` validation, `403` member not active, `404` member not found, `409` idempotency-key reuse with different body, `500` atomic-write failure (rolled back).

### POST /v1/transactions/:id/void
Reverse a committed transaction within `program_config.void_window_hours` (default 168h).

Request: `{ "reason": "customer return" }`

Response `200 OK`:
```json
{
  "transactionId": "uuid",
  "pointsReversed": 25,
  "newBalance": 100,
  "negativeBalanceFlag": false
}
```

If reversal would drive balance below zero the void still completes, `negativeBalanceFlag=true`, and a `points.void.negative_balance` event is emitted for manual review.

Errors: `403` outside void window, `404` not found, `409` already voided.

### POST /v1/members/:id/adjustments  (admin-only)
Write a manual ledger entry (positive or negative).

Request:
```json
{ "delta": 500, "reasonCode": "adjust", "notes": "goodwill" }
```
`reasonCode` is one of `adjust` | `bonus`. `delta` must be a non-zero integer.

Response `200 OK`: `{ "ledgerId": "uuid", "delta": 500, "newBalance": 1625 }`

Publishes `points.earned` (delta > 0) or `points.redeemed` (delta < 0) on Service Bus.

### GET /v1/members/:id/balance
Response `200 OK`: `{ "balance": 125, "lastUpdated": "2026-04-09T10:00:00Z" }`

Served from Redis cache (`tenant:{tenantId}:member:{memberId}:balance`, TTL 300s). On miss the service recomputes via `SELECT SUM(delta) FROM points_ledger` (or `v_member_balance` if A-03 provides it) and rewrites the cache.

### POST /v1/redemptions
Burn points for an offer redemption.

Request:
```json
{ "memberId": "uuid", "offerId": "offer-1", "pointsToBurn": 200, "redemptionContext": {} }
```

Response `201 Created`: `{ "redemptionId": "uuid", "pointsUsed": 200, "newBalance": 925 }`

Errors: `400` invalid input, `403` member not active, `404` member not found, `422` insufficient balance.

Offer validity is delegated to the Offer Service (T-13); this endpoint validates only the current member balance.

## Canonical Service Bus event envelopes

All events are wrapped in the shared `EventEnvelope` (`@loyalty/shared-events`):
```json
{
  "eventId": "uuid",
  "eventType": "<type>",
  "tenantId": "uuid",
  "timestamp": "ISO-8601",
  "version": "1.0",
  "payload": { /* see below */ }
}
```

### Topic `points.earned` — `eventType: "points.earned"`
Published on every successful transaction create AND on positive admin adjustments.
```json
{
  "memberId": "uuid",
  "transactionId": "uuid",
  "ledgerId": "uuid",
  "delta": 25,
  "newBalance": 125,
  "channel": "pos",
  "reasonCode": "earn"
}
```
For admin adjustments: `transactionId` is omitted and `reasonCode` is `"adjust"` or `"bonus"`.

### Topic `transaction.voided` — `eventType: "transaction.voided"`
```json
{
  "memberId": "uuid",
  "transactionId": "uuid",
  "originalLedgerId": "uuid",
  "reversalLedgerId": "uuid",
  "delta": -25,
  "newBalance": 100,
  "reason": "customer return"
}
```

### Topic `points.redeemed` — `eventType: "points.redeemed"`
Published on every successful redemption AND on negative admin adjustments.
```json
{
  "memberId": "uuid",
  "redemptionId": "uuid",
  "ledgerId": "uuid",
  "delta": -200,
  "newBalance": 925,
  "offerId": "offer-1"
}
```

### Topic `points.void.negative_balance` — `eventType: "points.void.negative_balance"`
Emitted only when voiding would drive balance below zero. Consumers should route to a manual review queue (A-16 analytics + admin UI).
```json
{ "memberId": "uuid", "transactionId": "uuid", "newBalance": -10 }
```

## Idempotency semantics

- Header: `Idempotency-Key` (required on all write endpoints)
- Scope: `(tenantId, idempotencyKey)` — isolated per-tenant
- Retention: 24 hours
- Storage: `__idempotency_keys` table (see "Schema" below); created on-demand by the service at startup via `CREATE TABLE IF NOT EXISTS` so it does not consume a V-number (A-03 owns V1–V7)
- Replay with identical request body → returns the original status code and response body verbatim
- Replay with a different request body hash for the same key → `409 Conflict` (`Idempotency-Key reused with different request body`)
- The key is only persisted after the underlying operation fully commits; a failed/rolled-back transaction does NOT store the key, allowing safe client retry

## Schema — `__idempotency_keys`
```sql
CREATE TABLE IF NOT EXISTS __idempotency_keys (
  tenant_id        UNIQUEIDENTIFIER NOT NULL,
  idempotency_key  NVARCHAR(200)    NOT NULL,
  request_hash     NVARCHAR(128)    NOT NULL,
  status_code      INT              NOT NULL,
  response_body    NVARCHAR(MAX)    NOT NULL,
  created_at       DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT pk___idempotency_keys PRIMARY KEY (tenant_id, idempotency_key)
);
```
A nightly job should delete rows with `created_at < DATEADD(hour, -24, SYSUTCDATETIME())`.

## Atomic write contract

Every write (create transaction, void, adjustment, redemption) runs through `LoyaltyDb.withTransaction(tenantId, fn)`:
1. `BEGIN TRAN`
2. Insert/update `transactions`
3. Insert `points_ledger` (immutable — no UPDATE/DELETE; the A-03 DB trigger enforces append-only)
4. `COMMIT` — if any step throws, the whole unit rolls back. No ledger row is ever written without its matching transaction state, and vice versa.
5. After commit (outside the transaction): invalidate the Redis balance cache key, then publish the Service Bus event. A publisher failure does NOT roll back the DB write; the system relies on the ledger as source of truth and A-16 outbox-style reconciliation for at-least-once event delivery (future enhancement).

## Points calculator

Pure function in `src/points-calculator.ts` with no I/O. Contract:
```ts
calculate({
  amount, currency, skuList,
  baseEarnRate, tierMultiplier, promoMultipliers, multiplierCap
}) → { basePoints, bonusPoints, totalPoints, appliedMultipliers }
```
Rules:
- Base: `floor(amountMajor * baseEarnRate * tierMultiplier)`
- Bonus: per-line stacking of category/sku/global multipliers; effective multiplier `1 + Σ(bonus_i)` capped at `multiplierCap` (default 5)
- Floor rounding at every step. Negative `amount` throws. Zero amount returns zeroes.
- Zero-decimal currencies (JPY, KRW, VND, CLP, ISK) treat `amount` as whole units; all others divide by 100.

Unit test coverage: 100 % (lines & functions), 93.5 % branch. Test matrix covers zero amount, negative amount rejection, empty sku list, single category bonus, stacking-to-cap, global multiplier, tier interaction, floor rounding, decimal precision.

## Environment variables

| Var                                  | Purpose                                                   |
|--------------------------------------|-----------------------------------------------------------|
| `PORT`                               | HTTP port (default 3002)                                  |
| `NODE_ENV`                           | `development` \| `production`                             |
| `LOG_LEVEL`                          | pino level                                                |
| `KEY_VAULT_URI`                      | Azure Key Vault for tenant-DB secrets                     |
| `CONTROL_PLANE_SQL_CONNSTR`          | mssql connection string for control plane (tenant lookup) |
| `REDIS_URL`                          | ioredis-compatible URL for balance cache                  |
| `SERVICE_BUS_CONNECTION_STRING`      | Azure Service Bus namespace connection                    |
| `MEMBER_SERVICE_URL`                 | Base URL for A-04 Member Service (`/v1/members/:id`)      |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights telemetry                                 |
| `SKIP_AUTH`                          | `true` in dev to trust `x-tenant-id`/`x-user-id` headers  |

## Coordination notes

- **A-03 (tenant DB migrations)** — The engine depends on `transactions`, `points_ledger`, `program_config`, and the `v_member_balance` view created by migrations V1–V3. The append-only trigger on `points_ledger` is owned by A-03; this service does not issue UPDATE/DELETE against that table. The internal `__idempotency_keys` table is created on startup so it does not collide with A-03's V-numbering.
- **A-04 (member service)** — Member lookup is performed via HTTP against `MEMBER_SERVICE_URL`. Contract expected: `GET /v1/members/:id` returning `{ memberId, status, tierId, tierMultiplier }`. In tests a mock `MemberClient` is injected. If A-04 settles on a different field name for the tier multiplier, update `MemberClient.getMember` mapping in `src/member-client.ts` (shim to be added once A-04 HANDOFF lands).
- **A-06 (tier eval worker)** — Consumes `points.earned`. Payload extends the base `PointsEarnedPayload` with `ledgerId`, `newBalance`, `channel`, `reasonCode` — use the `PointsEarnedPayloadV1` type from `@loyalty/shared-events`.
- **A-10 (webhook worker)** and **A-16 (analytics)** — Consume `points.earned`, `points.redeemed`, `transaction.voided`. Use the V1 payload types.
- **A-13 (offer service)** — Will later supply offer validation that is currently stubbed in `POST /v1/redemptions` (balance-only check).

## In-memory mode

If `REDIS_URL` / `CONTROL_PLANE_SQL_CONNSTR` / `SERVICE_BUS_CONNECTION_STRING` / `MEMBER_SERVICE_URL` are unset, the service boots with in-memory adapters (`src/in-memory.ts`). This mode is used for the unit/integration test suite and local developer smoke testing. It is NOT suitable for production.

## Tests and commands
```
pnpm --filter @loyalty/loyalty-engine build
pnpm --filter @loyalty/loyalty-engine test    # 30 tests, calculator 100 % coverage
pnpm --filter @loyalty/loyalty-engine lint
```

Integration tests cover: full POST /v1/transactions flow, atomic rollback via fault injection on ledger insert, idempotency replay, idempotency conflict, void flow, void negative-balance flag, void-window rejection, admin adjustment role guard, redemption success + insufficient balance, and a 10-way concurrent POST that asserts monotonic `balance_after` sequence and final balance equal to the sum of deltas.

Testcontainers-mssql integration is deferred — the in-memory `withTransaction` implementation mirrors the commit/rollback and per-tenant serialization semantics of the real mssql adapter. Once the A-03 migrations ship to a provisioned test SQL server, add a `tests/mssql.integration.test.ts` that runs the same scenarios against real mssql. Logged in `BLOCKERS.md` if applicable.

## Points Expiry (T-17 / A-17)

### V13 Schema — `V13__expiry_columns.sql`

Adds to tenant databases:
- `points_ledger.expires_at DATETIME2 NULL` — when a credit entry expires
- `IX_points_ledger_expiry` — filtered index on `(expires_at, member_id) WHERE expires_at IS NOT NULL AND delta > 0`
- `program_config.points_expiry_months INT NULL DEFAULT 12` — how many months until points expire (NULL = no expiry)
- `program_config.expiry_notification_days NVARCHAR(50) NULL DEFAULT '30,7'` — comma-separated days before expiry to send warnings

### Cron Schedules

| Job | Default Cron | Env Var | Description |
|-----|-------------|---------|-------------|
| Expiry job | `0 2 * * *` (2am UTC) | `EXPIRY_CRON` | Expires credits where `expires_at <= now()`, inserts debit ledger entries with `reason_code = 'expire'` |
| Warning job | `0 8 * * *` (8am UTC) | `EXPIRY_WARNING_CRON` | Sends notification warnings N days before expiry per `expiry_notification_days` config |

### Expiry Admin Endpoints

All admin-only (require `admin` role in JWT or `x-user-role: admin` header).

#### `POST /v1/admin/expiry/dry-run`

Runs expiry logic without writing ledger entries. Returns:
```json
{
  "totalCreditsToExpire": 5,
  "totalPointsToExpire": 1200,
  "memberBreakdown": [
    { "memberId": "uuid", "points": 500, "expiresAt": "2026-04-01T00:00:00Z" }
  ]
}
```

#### `POST /v1/admin/expiry/backfill`

One-time migration helper. Sets `expires_at = created_at + points_expiry_months` for existing earn ledger entries that lack an `expires_at` value. Returns:
```json
{
  "totalUpdated": 42,
  "entries": [{ "ledgerId": "uuid", "expiresAt": "2027-01-15T10:00:00Z" }]
}
```

#### `POST /v1/admin/expiry/run`

Manually triggers the expiry job (same logic as the cron). Returns:
```json
{
  "totalCreditsExpired": 3,
  "totalPointsExpired": 750,
  "tenantBreakdown": [{ "tenantId": "uuid", "creditsExpired": 3, "pointsExpired": 750 }]
}
```

### Notification Template Contract

The expiry warning job publishes notification requests (via Service Bus topic `notification.send`) with:

| Template Key | Trigger | Variables |
|---|---|---|
| `points_expiry_reminder_30d` | Credit expiring in 30 days | `expiringPoints`, `expiryDate`, `daysUntilExpiry` |
| `points_expiry_reminder_7d` | Credit expiring in 7 days | `expiringPoints`, `expiryDate`, `daysUntilExpiry` |

Templates are deployed under `/services/notification-service/templates/points_expiry_reminder_30d/` and `points_expiry_reminder_7d/` (en-US locale, subject + HTML + text).

### Transaction Flow Modification

When `program_config.points_expiry_months` is set for a tenant, `POST /v1/transactions` now sets `expires_at` on the credit ledger entry to `now() + points_expiry_months months`.

### Environment Variables (new)

| Var | Purpose | Default |
|-----|---------|---------|
| `EXPIRY_CRON` | Cron expression for the nightly expiry job | `0 2 * * *` |
| `EXPIRY_WARNING_CRON` | Cron expression for the expiry warning notification job | `0 8 * * *` |

### Tests

`tests/expiry.test.ts` — 18 tests covering:
- Expiry calculator: partial redemption, fully redeemed skipped, zero remaining skipped, full delta
- Expiry worker: expired credits processed, future credits skipped, no-expiry tenant skipped, no double-expire
- Dry-run endpoint: preview without writes, admin role guard
- Backfill endpoint: sets expires_at, empty when no expiry configured
- Notification warnings: sends warnings for credits in window, skips unconfigured tenants
- Transaction flow: sets expires_at when configured, omits when not configured

## Fraud Detection (T-18 / A-18)

### V14 Schema — `V14__fraud_flags.sql`

Creates two tables in tenant databases:

**`fraud_flags`** — records suspicious activity for admin review:
- `flag_id` (PK, UNIQUEIDENTIFIER)
- `member_id`, `txn_id` (nullable), `rule_code`, `severity` (warning|block|quarantine)
- `details_json` — rule-specific context (threshold, actual, window)
- `status` (open|reviewed|dismissed|confirmed), `reviewed_by`, `reviewed_at`, `review_notes`
- Indexes: `IX_fraud_flags_member (member_id, created_at)`, `IX_fraud_flags_status (status, severity, created_at)`

**`fraud_rules`** — configurable rule definitions:
- `rule_code` (PK), `description`, `severity`, `is_enabled`, `config_json`, `updated_at`
- Seeded with 5 default rules (see below)

### Rule Codes and Default Configs

| Rule Code | Description | Default Severity | Default Config |
|---|---|---|---|
| `VELOCITY_TXN_COUNT` | Too many transactions in time window | warning | `maxCount: 10, windowMinutes: 60` |
| `VELOCITY_TXN_AMOUNT` | Spend exceeds threshold in time window | warning | `maxAmount: 1000, windowMinutes: 60` |
| `RAPID_ENROLLMENT_REDEEM` | Redemption too soon after enrollment | block | `minHoursAfterEnroll: 24` |
| `DUPLICATE_AMOUNT_PATTERN` | Repeated identical amounts in short window | warning | `maxRepeats: 3, windowMinutes: 30` |
| `BULK_ENROLLMENT` | Excessive enrollments from same source | quarantine | `maxEnrollments: 20, windowMinutes: 60` |

### Fraud Engine Architecture

- **Pre-processing check**: `fraudEngine.checkTransaction()` runs before the transaction is committed
- **Redis-only hot path**: all velocity tracking uses Redis counters, sorted sets, and TTL-based sliding windows — no SQL in the critical path
- **Performance target**: < 20ms overhead (benchmarked at < 5ms with in-memory cache)
- **Action resolution**: highest severity wins when multiple rules trigger
  - `allow` — no rules triggered, process normally
  - `warn` — warning-severity rule triggered, process normally, insert fraud_flag for admin review
  - `block` — block-severity rule triggered, return 403 `TRANSACTION_BLOCKED_FRAUD`, insert fraud_flag
  - `quarantine` — quarantine-severity rule triggered, process but flag for review

### Admin Endpoints

All under `/v1/admin/fraud`, require admin role:

| Method | Path | Description |
|---|---|---|
| GET | `/v1/admin/fraud/flags?memberId=&status=&severity=&limit=&offset=` | List fraud flags (paginated) |
| POST | `/v1/admin/fraud/flags/:id/review` | Review a flag: `{status: 'dismissed'\|'confirmed', notes}` |
| GET | `/v1/admin/fraud/rules` | List all rules with config |
| PUT | `/v1/admin/fraud/rules/:ruleCode` | Update rule thresholds: `{isEnabled, severity, config}` |
| GET | `/v1/admin/fraud/stats` | Summary: flags today, by severity, by rule |

### Environment Variables (new)

| Var | Purpose | Default |
|-----|---------|---------|
| `FRAUD_ENABLED` | Enable/disable fraud detection | `true` (enabled unless set to `"false"`) |

Rule thresholds are configurable per-tenant via the `fraud_rules` table and the `PUT /v1/admin/fraud/rules/:ruleCode` endpoint. No additional env vars needed for rule overrides.

### Source Files

- `src/fraud/types.ts` — interfaces (FraudCheckResult, FraudFlag, FraudCacheClient, FraudRepository, etc.)
- `src/fraud/rules.ts` — 5 individual rule functions (pure, independently testable)
- `src/fraud/engine.ts` — FraudEngine class orchestrating parallel rule checks
- `src/fraud/routes.ts` — admin fraud management routes
- `src/fraud/repository.memory.ts` — in-memory implementations for tests
- `src/fraud/index.ts` — barrel exports

### Tests

- `tests/fraud-rules.test.ts` — 20 tests: each rule independently with boundary values, within/outside window, exact threshold, cross-contamination checks
- `tests/fraud-engine.test.ts` — 9 tests: action resolution (highest severity wins), flag persistence, disabled rules, enrollment check, performance benchmark (< 5ms)
- `tests/fraud-integration.test.ts` — 13 tests: blocked transaction returns 403, warn still processes, fraud disabled mode, admin endpoints (list/filter/review/rules/update/stats/RBAC)
- **84 total tests (all existing + 42 new), all passing**

### Coordination Notes (Fraud)

- **A-17 (expiry)**: fraud detection and expiry are independent features in the same service; both modify `createTransaction` but do not conflict
- **A-11 (admin-api)**: fraud admin endpoints are mounted directly in loyalty-engine under `/v1/admin/fraud` rather than in admin-api, to keep fraud logic co-located with the transaction flow
- **A-19 (admin portal)**: fraud flags, rules, and stats endpoints are available for the admin dashboard to display
