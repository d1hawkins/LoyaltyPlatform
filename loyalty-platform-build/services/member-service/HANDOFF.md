# Member Service — HANDOFF (A-04)

Task T-04 — Enrollment, Profile & Lookup.

## Base URL

- Local dev: `http://localhost:3001`
- Via APIM (once A-07 is done): `${apimUrl}/members/v1/members`
- Health: `GET /health`, `GET /ready` (unauthenticated)

All business endpoints are under **`/v1/members`**.

## Auth

Middleware order applied to `/v1/members`:

```
correlationId  →  requestLogger  →  authenticateJWT({ skipAuth })  →  resolveTenant  →  router  →  errorHandler
```

Two supported modes:

| Mode | Headers |
|---|---|
| Production | `Authorization: Bearer {jwt}` — token must carry `tenantId` and `sub` claims. |
| Dev (`SKIP_AUTH=true`) | `x-tenant-id: <uuid>` and `x-user-id: <id>` — JWT verification is skipped. |

Both modes **also** require `x-tenant-id` on every request — the router reads it alongside `req.user.tenantId` so the same wire format works in both modes.

## Environment variables

| Name | Purpose |
|---|---|
| `PORT` | HTTP port (default 3001). |
| `NODE_ENV` | `development` / `production`. |
| `KEY_VAULT_URI` | Azure Key Vault URI used by `@loyalty/shared-db-client`. |
| `CONTROL_PLANE_SQL_CONNSTR` | Control-plane DB connection string. |
| `REDIS_URL` | ioredis-compatible URL for the balance cache. |
| `SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus namespace connection string. |
| `MEMBER_PII_KEY_HEX` | 32-byte AES-256-GCM key, hex encoded (64 chars). **In production this is delivered from Key Vault secret `member-pii-key` via Managed Identity — do not store the raw key in config.** |
| `MEMBER_HASH_PEPPER` | Base pepper for the per-tenant HMAC used to hash email / phone for deterministic lookup. Per-tenant pepper = `HMAC-SHA256(basePepper, tenantId)`. |
| `SKIP_AUTH` | `true` enables dev mode (bypass JWT). |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights telemetry. |

## Endpoints

All under `/v1/members`. All require auth + `x-tenant-id`.

### `POST /v1/members` — enroll

Request body (zod `enrollMemberSchema`):

```ts
{
  email?:           string,        // optional, email format
  phone:            string,        // required; normalized to pseudo-E.164
  firstName:        string,        // 1–100
  lastName:         string,        // 1–100
  dateOfBirth?:     string,        // YYYY-MM-DD
  enrolledChannel:  'pos' | 'ecommerce' | 'mobile' | 'admin',
}
```

Behaviour:

- Normalizes phone.
- Computes per-tenant HMAC-SHA256 `phone_hash` (and `email_hash` if provided).
- Encrypts email/phone with AES-256-GCM using the per-tenant PII key (`member-pii-key`).
- Rejects duplicates (by phone_hash, then email_hash) with `409 DUPLICATE_MEMBER` containing `existingMemberId`.
- Assigns the default tier (tier with lowest `sort_order`, typically Bronze).
- Publishes `member.enrolled` to Service Bus.
- Returns `201 Created` with a `MemberDTO` (PII decrypted for authorized callers).

### `GET /v1/members/:id`

Returns the full `MemberDTO`. Target **p99 < 100ms**.

### `GET /v1/members?phone={phone}`

POS lookup. **Hot path — target p99 < 100ms @ 500 RPS.** Returns `MemberSummaryDTO` including a placeholder `eligibleOffers: []` (populated in Phase 2 by offer-service).

### `GET /v1/members?email={email}`

Lookup by `email_hash`. Same `MemberSummaryDTO` shape.

### `PATCH /v1/members/:id`

Update any of `firstName`, `lastName`, `email`, `phone`, `communicationPrefs`. Updating `email` or `phone` re-hashes + re-encrypts and runs a duplicate check. Publishes `member.updated` with the list of changed fields.

### `POST /v1/members/:id/status`

Body: `{ status: 'active' | 'suspended' | 'closed', reason: string }`. Validates transition via:

| from \ to | active | suspended | closed |
|---|---|---|---|
| active | — | allowed | allowed |
| suspended | allowed | — | allowed |
| closed | — | — | — (terminal) |

Transitioning to `closed` additionally triggers the GDPR soft-delete path (same as `DELETE`). Returns `422 INVALID_STATUS_TRANSITION` on illegal transitions.

### `DELETE /v1/members/:id`

GDPR soft delete: sets `is_deleted=1` + `deleted_at=NOW()`, invalidates the balance cache, publishes `member.deleted`. Returns `204`. A T+30d scrub worker is stubbed — today it simply enqueues the `member.deleted` message which the worker will consume later.

### `GET /v1/members/:id/export`

GDPR data export (JSON). Shape:

```ts
{
  profile: MemberDTO,
  ledgerSummary: { count: number; balance: number },
  transactions: { note: 'Full transaction export deferred to T-11 admin API' },
}
```

### `GET /v1/members/:id/ledger?after=&limit=`

Paginated ledger. `limit` defaults to 50, max 200. `after` is an opaque cursor = `base64url(ledger_id)`. Response:

```ts
{
  items: LedgerEntryDTO[],
  nextCursor?: string,  // present only when another page exists
}
```

## DTOs

```ts
interface MemberDTO {
  id: string;
  tenantId: string;
  status: 'active' | 'suspended' | 'closed';
  tierId: string;
  tierName: string;
  pointsBalance: number;
  firstName: string;
  lastName: string;
  email?: string;          // decrypted
  phone: string;           // decrypted
  dateOfBirth?: string;
  enrolledChannel: string;
  enrolledAt: string;
  communicationPrefs?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface MemberSummaryDTO {
  id: string;
  firstName: string;
  lastName: string;
  tierId: string;
  tierName: string;
  pointsBalance: number;
  eligibleOffers: unknown[]; // Phase 2 placeholder
}

interface LedgerEntryDTO {
  id: string;
  memberId: string;
  transactionId?: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note?: string;
  createdAt: string;
}
```

## Error codes

All errors serialized as RFC7807 problem+JSON by `@loyalty/shared-errors`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | zod validation failed / bad phone / missing `x-tenant-id`. |
| 401 | `UNAUTHORIZED` | Missing/invalid bearer token (or missing `x-tenant-id/x-user-id` in dev). |
| 403 | `TENANT_MISMATCH` | Member belongs to a different tenant. |
| 404 | `MEMBER_NOT_FOUND` | Member id / lookup miss. |
| 404 | `NOT_FOUND` | Default tier missing, etc. |
| 404 | `TENANT_NOT_FOUND` | Tenant lookup miss. |
| 409 | `DUPLICATE_MEMBER` | Email or phone hash already enrolled. Body includes `existingMemberId`. |
| 422 | `INVALID_STATUS_TRANSITION` | Illegal transition. Body includes `from`, `to`. |

## Service Bus events published

All events use the standard `EventEnvelope<T>` from `@loyalty/shared-events`.

- **`member.enrolled`** — `{ memberId, channel, enrolledAt, tierId }`
- **`member.updated`** — `{ memberId, changedFields: string[], reason? }`
- **`member.deleted`** — `{ memberId, deletedAt }`

## Redis balance cache contract

- Key: `tenant:{tenantId}:member:{memberId}:balance`
- Value: integer (string)
- TTL: **300s**
- Populator: this service (on cache miss, reads `v_member_balance` then sets).
- Invalidator: **T-05 loyalty-engine** is expected to `DEL` this key whenever it writes a `points_ledger` entry. This is the documented contract — member-service does not subscribe to points events itself.

## PII encryption

AES-256-GCM, random 96-bit IV per field. Wire format:

```
base64( version:uint8 | iv:12 | authTag:16 | ciphertext )
```

`version` enables key rotation (Phase 2). `StaticPiiKeyProvider` is used in dev/tests. In production the key comes from Key Vault secret **`member-pii-key`** and is loaded into `MEMBER_PII_KEY_HEX` at startup (32-byte key, 64 hex chars). Key rotation is not implemented in Phase 1 but the encryption layer is already version-tagged so older ciphertexts will remain decryptable after rotation.

Email/phone **lookup hashes** use a separate HMAC-SHA256 with a **per-tenant pepper** derived as `HMAC-SHA256(MEMBER_HASH_PEPPER, tenantId)`, so hashes are not comparable across tenants and the base pepper is not recoverable from any hash.

## Data access

- Uses `@loyalty/shared-db-client` `TenantDbClient.getTenantPool(tenantId)` in production via `SqlMemberRepository` (`src/repository.sql.ts`), which takes a `PoolFactory = (tenantId) => Promise<sql.ConnectionPool>`.
- Depends on the tenant schema from T-03 (V1 + V4 migrations): `members`, `tiers`, `points_ledger`, `v_member_balance`.
- Tests use `InMemoryMemberRepository` (`src/repository.memory.ts`) — testcontainers / mssql are **not** required.

## Tests

- Unit: zod schemas, status transitions, cursor round-trip, PII encrypt/decrypt + hashing + phone normalization + tamper detection.
- HTTP integration (supertest + in-memory repo): enroll, duplicate detection, lookup by phone/email, get-by-id, patch, invalid status transition, delete, export, ledger pagination.
- **30 tests, all passing.**
- Load test: k6 script at `tests/load-test.js`, 500 RPS for 60s, p99 < 100ms threshold. **Script ready but not executed** — k6 binary not available in this environment.

### Integration tests — testcontainers decision

Spec asked for `@testcontainers/mssqlserver` against SQL Server 2022. Docker / testcontainers are not available in this build environment and spinning SQL Server up from Node routinely exceeds the 2-minute timeout budget. Per the task fallback clause, the service ships with an in-memory integration layer that exercises every endpoint via supertest against the same Express app. A dedicated testcontainers suite can be added trivially once a Docker host is available by swapping `InMemoryMemberRepository` for `SqlMemberRepository` in the test harness — see `src/index.ts` `CreateAppDeps`.

## Commands

```
pnpm --filter @loyalty/member-service build    # 0 errors
pnpm --filter @loyalty/member-service test     # 30/30 passing
pnpm --filter @loyalty/member-service lint     # 0 errors
```

## Coordination notes

- **A-03**: tenant schema is consumed via `SqlMemberRepository`. If the columns change, update `SELECT_COLS` and the insert statement in `src/repository.sql.ts`. `@loyalty/shared-types` `Member` is used as the canonical shape; the service DTO intentionally adds `tierName` + decrypted PII, which is an API concern and not part of shared-types.
- **A-05 (loyalty-engine)**: please `DEL tenant:{tenantId}:member:{memberId}:balance` whenever you append a ledger row (Redis cache invalidation contract above). Do not rename these endpoints.
- **A-06 (auth)**: set `SKIP_AUTH=false` and provide `JWKS_URI` / `issuer` / `audience` via the `authenticateJWT` options once real auth is wired up — currently the service picks `skipAuth` from `process.env.SKIP_AUTH`.

## Mobile API (A-15 — T-15)

Consumer-facing mobile endpoints added to the member-service. All routes are under `/v1/mobile` and share the same auth middleware chain as `/v1/members`.

### Mobile endpoints

#### `GET /v1/mobile/dashboard/:memberId`

Aggregated response for mobile home screen. **Target p99 < 200ms.**

Response `200`:
```ts
{
  member: { id: string; firstName: string; lastName: string; status: string };
  tier: { id: string; name: string };
  balance: number;
  tierProgress: {
    current: { tierId: string; tierName: string; rank: number; thresholdPoints: number; benefits: TierBenefitsDTO };
    next: { tierId: string; tierName: string; rank: number; thresholdPoints: number; benefits: TierBenefitsDTO } | null;
    pointsToNext: number;
    percentComplete: number;
  };
  recentTransactions: MobileTransactionDTO[];   // last 5
  eligibleOffers: MobileOfferDTO[];             // top 5
  unreadNotifications: number;
}
```

**Caching strategy:**
- Redis key: `tenant:{tenantId}:mobile:dashboard:{memberId}`
- TTL: **60 seconds**
- On cache miss: parallel-fetch member profile + balance + all tiers + last 5 transactions + top 5 offers + unread notification count, serialize to single response, cache, return.

#### `GET /v1/mobile/transactions/:memberId?after=&limit=`

Paginated transaction history enriched with `pointsEarned` per transaction.

Response `200`:
```ts
{ items: MobileTransactionDTO[]; nextCursor?: string }
```

`MobileTransactionDTO`:
```ts
{ id: string; memberId: string; channel: string; amountCents: number; currency: string; pointsEarned: number; createdAt: string }
```

#### `GET /v1/mobile/offers/:memberId`

Eligible offers with richer metadata including `imageUrl` extracted from offer `conditionsJson`.

Response `200`:
```ts
{ offers: MobileOfferDTO[] }
```

`MobileOfferDTO`:
```ts
{ id: string; code: string; name: string; description?: string; type: string; value: number; startsAt: string; endsAt: string; imageUrl?: string }
```

#### `GET /v1/mobile/tier-progress/:memberId`

Detailed tier progress with current and next tier benefits and comparison.

Response `200`: `TierProgressDTO` (same shape as `tierProgress` in the dashboard response).

#### `POST /v1/mobile/notifications/preferences`

Update push notification opt-in per `template_key`.

Request body:
```ts
{ memberId: string; templateKey: string; optedIn: boolean }
```

Response: `204 No Content`.

#### `GET /v1/mobile/notifications/:memberId?limit=`

Notification history for a member (most recent first).

Response `200`:
```ts
{ notifications: MobileNotificationDTO[] }
```

`MobileNotificationDTO`:
```ts
{ id: string; templateKey: string; channel: string; status: string; createdAt: string }
```

### Push notification registration

#### `POST /v1/mobile/push/register`

Register a mobile device for push notifications.

Request body:
```ts
{ memberId: string; deviceToken: string; platform: 'ios' | 'android' }
```

Response `201`:
```ts
{ memberId: string; deviceToken: string; platform: 'ios' | 'android'; registeredAt: string }
```

**Storage:** In-memory `push_registrations` map keyed by `memberId`. Real persistence table deferred to future sprint. The notification-service (A-10) is responsible for actual push dispatch — this endpoint only registers the device token.

**Deduplication:** If the same `deviceToken` is registered again for a member, the existing entry is replaced (supports platform change). Multiple different tokens per member are supported (multiple devices).

### Architecture

- All mobile code lives under `/services/member-service/src/mobile/`
- `MobileDataProvider` interface abstracts data access — `InMemoryMobileDataProvider` for tests, SQL implementation deferred
- `DashboardCache` interface with `InMemoryDashboardCache` (tests) and `RedisDashboardCache` (production)
- Mobile router is wired into the Express app alongside the existing member router

### Performance

- Dashboard endpoint: Redis-cached with 60s TTL, parallel data fetching on cache miss
- k6 load test script at `tests/mobile-load-test.js` targeting 300 RPS with p99 < 200ms assertion (script only, not executed)

### Tests

- `tests/mobile-unit.test.ts` — 18 tests: dashboard aggregation, tier progress calculation (5 cases), cache hit/miss, push registration (3 cases), notification preferences, pagination
- `tests/mobile-http.test.ts` — 13 tests: supertest integration for all 7 mobile endpoints including error cases
- **61 total tests (30 original + 31 new), all passing**

### Coordination notes (Mobile)

- **A-10 (notification-service)**: push dispatch is handled by notification-service. Mobile API only registers device tokens via `POST /v1/mobile/push/register`. A-10 should consume push registrations and dispatch via Azure Notification Hubs when events like `tier.upgraded` or `points.earned` fire.
- **A-13 (offer-service)**: `GET /v1/mobile/offers/:memberId` currently uses `MobileDataProvider.getEligibleOffers()` which returns from in-memory store. Once A-13 ships, wire this to call offer-service's eligibility endpoint.
- **A-06 (auth/B2C)**: mobile endpoints use B2C consumer flow (`B2C_1A_SignUpOrSignin`). The `B2C_ISSUER_CONSUMER` and `B2C_AUDIENCE` (`api://loyalty-consumer`) should be configured on the `/v1/mobile` route when `SKIP_AUTH=false`.
