# Webhook Delivery Service — HANDOFF (A-09 / T-09)

## Purpose
Reliable outbound HTTP delivery of loyalty platform events to tenant-registered
webhook endpoints. Consumes Service Bus fan-out topics, persists a durable
`webhook_deliveries` row per (hook, event), then runs a polling delivery loop
that applies the retry schedule and dead-letters after max attempts.

## Architecture
```
Service Bus topics ──▶ consumer.ts ──▶ webhook_deliveries (insert, status=pending)
                                            │
                        delivery-loop.ts  ──┘  claim TOP 50 WHERE pending & due
                                               POST target_url (10s timeout)
                                               2xx → delivered
                                               4xx → failed (permanent)
                                               5xx/network/timeout → schedule retry
                                               >= max_attempts → dead + webhook.delivery.failed
```

## Event subscriptions
Subscription name: **`webhook-worker`** (one per topic).
Topics:
- `member.enrolled`
- `member.updated`
- `member.deleted`
- `points.earned`
- `points.redeemed`
- `tier.upgraded`
- `tier.downgraded`
- `transaction.voided`

Messages are acked after the `webhook_deliveries` rows are persisted. Delivery
is therefore **exactly-once to the DB**, **at-least-once to the downstream HTTP
endpoint** (consumers must be idempotent; see `X-Loyalty-Delivery-Id`).

## Migration V8 — `webhook_deliveries`
File: `/services/tenant-migrations/V8__webhook_deliveries.sql`.
Idempotent (`IF OBJECT_ID(...) IS NULL`). Columns:

| column | type | notes |
|---|---|---|
| delivery_id | UNIQUEIDENTIFIER PK | `NEWID()` default |
| hook_id | UNIQUEIDENTIFIER | FK-by-convention to `webhook_configs` |
| event_id | UNIQUEIDENTIFIER | from envelope; unique per hook |
| event_type | NVARCHAR(100) | e.g. `points.earned` |
| target_url | NVARCHAR(2048) | |
| payload | NVARCHAR(MAX) | full JSON envelope |
| attempt | INT | current attempt count (0-indexed at insert) |
| max_attempts | INT | default 5 |
| next_attempt_at | DATETIME2 | driver for poll query |
| last_attempt_at | DATETIME2 | |
| status | NVARCHAR(20) | `pending`/`in_flight`/`delivered`/`failed`/`dead` |
| last_status_code | INT | |
| last_error | NVARCHAR(MAX) | |
| signature | NVARCHAR(256) | hex HMAC-SHA256 |
| created_at / updated_at | DATETIME2 | |

Indexes:
- `IX_webhook_deliveries_status_next_attempt (status, next_attempt_at)` — hot poll.
- `IX_webhook_deliveries_hook_id` — admin listings.
- `UX_webhook_deliveries_hook_event (hook_id, event_id)` — **unique**; guarantees
  idempotent redelivery from Service Bus.

## HMAC signature format (exact)
Canonical string: `${timestamp}.${body}`
Signature:        `hex(HMAC_SHA256(secret, canonicalString))`
Header value:     `sha256=${hex}`

Where:
- `timestamp` is the value of the `X-Loyalty-Timestamp` header (ISO-8601, the
  envelope's `timestamp` at consumer time; the delivery loop re-emits the
  current ISO at POST time in the header for freshness).
- `body` is the exact raw request body (the JSON-stringified envelope, byte-for-byte).
- `secret` is the tenant-provided shared secret, decrypted from `webhook_configs.secret_encrypted`.

### Verification pseudocode (consumer side)
```
expected = "sha256=" + hex(hmacSha256(secret, request.headers["X-Loyalty-Timestamp"] + "." + rawBody))
constantTimeEqual(expected, request.headers["X-Loyalty-Signature"])
```

### Request headers emitted
| header | value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Loyalty-Event` | event type, e.g. `points.earned` |
| `X-Loyalty-Signature` | `sha256=<hex>` |
| `X-Loyalty-Delivery-Id` | the `delivery_id` UUID — use for consumer idempotency |
| `X-Loyalty-Timestamp` | ISO-8601 timestamp used in the canonical string |

## Retry schedule
Fixed exponential backoff — applied to `attempt` (post-increment):

| attempt after failure | wait before next attempt |
|---|---|
| 1 | 30s |
| 2 | 2m |
| 3 | 10m |
| 4 | 1h |
| 5 | 6h |

When `attempt >= max_attempts` (default 5), the row is marked `dead` and a
`webhook.delivery.failed` event is emitted (hook for admin dashboard / alerting).

4xx responses are **permanent failures** — no retry.
2xx responses are success.
5xx, network error, and timeout (10s) all trigger retry.

## HTTP admin endpoints
Listens on `PORT` (default **3009**). All `/admin/*` routes require a Bearer
token (or `SKIP_AUTH=true` for dev). Real JWT + admin-role enforcement is
delegated to `@loyalty/shared-auth`'s `authenticateJWT` when the service is
wired behind APIM.

| method | path | description |
|---|---|---|
| GET  | `/health` | liveness |
| GET  | `/ready`  | readiness |
| GET  | `/admin/webhooks/deliveries?hookId=&status=&limit=` | paginated listing |
| POST | `/admin/webhooks/deliveries/:id/retry` | requeue (`attempt=0`, `status=pending`, `next_attempt_at=now`) |
| POST | `/admin/webhooks/test/:hookId` | insert a synthetic `webhook.test` event for the hook |

## Environment variables
| var | default | purpose |
|---|---|---|
| `PORT` | 3009 | admin HTTP port |
| `SERVICE_BUS_CONNECTION_STRING` | — | if unset, consumer loop is disabled (dev mode) |
| `CONTROL_PLANE_SQL_CONNSTR` | — | target for `MssqlWebhookRepository` (not yet wired) |
| `KEY_VAULT_URI` | — | source for the webhook secret-decrypt key |
| `DELIVERY_POLL_MS` | 2000 | poll interval for the delivery loop |
| `DELIVERY_BATCH_SIZE` | 50 | `TOP N` per poll |
| `HTTP_TIMEOUT_MS` | 10000 | per-request timeout |
| `SKIP_AUTH` | — | `true` disables admin auth (dev only) |

## Files
```
src/index.ts            bootstrap, admin HTTP, consumer wiring, delivery loop
src/consumer.ts         event fan-out → webhook_deliveries insert
src/delivery-loop.ts    poller + HTTP sender + state machine
src/repository.ts       WebhookRepository interface + in-memory + mssql stub
src/signer.ts           HMAC-SHA256 signer
src/backoff.ts          retry schedule
src/secrets.ts          stub secret decryption (plain:/b64:/verbatim)
src/config.ts           zod env schema

tests/signer.test.ts
tests/backoff.test.ts
tests/delivery-loop.test.ts
tests/consumer.test.ts
```

Test count: **19 passing** across 4 suites (`pnpm --filter webhook-worker test`).

## Dead-letter triage runbook
1. **Find dead deliveries**
   ```
   GET /admin/webhooks/deliveries?status=dead&limit=100
   ```
   or SQL:
   ```sql
   SELECT TOP 100 delivery_id, hook_id, event_type, last_status_code,
                  last_error, last_attempt_at
   FROM dbo.webhook_deliveries
   WHERE status = 'dead'
   ORDER BY last_attempt_at DESC;
   ```
2. **Classify the root cause** from `last_status_code` / `last_error`:
   - `5xx` repeated → downstream incident; check with the hook owner.
   - `network: ENOTFOUND` → DNS / target URL rot; ask tenant to re-register.
   - `timeout: ...` → slow handler; consider asking tenant to ack within 10s and process async.
   - `4xx` dead (should not happen, 4xx marks `failed` not `dead`) → investigate as a bug.
3. **Replay individual deliveries** once the downstream is healthy:
   ```
   POST /admin/webhooks/deliveries/{delivery_id}/retry
   ```
4. **Bulk replay for one hook**
   ```sql
   UPDATE dbo.webhook_deliveries
   SET status = 'pending',
       attempt = 0,
       next_attempt_at = SYSUTCDATETIME(),
       last_error = NULL,
       last_status_code = NULL,
       updated_at = SYSUTCDATETIME()
   WHERE hook_id = @HookId AND status = 'dead';
   ```
5. **Disable a chronically-failing hook**
   ```sql
   UPDATE dbo.webhook_configs SET is_active = 0 WHERE hook_id = @HookId;
   ```
6. **Emit / consume `webhook.delivery.failed`** — admin-dashboard consumers
   listen for this event and surface an ops alert. The event is emitted at the
   moment a delivery transitions to `dead` (see `onDead` hook in
   `delivery-loop.ts`).

## Deploy
`deploy.sh` is a placeholder documenting the `az containerapp create`
invocation. A-12 owns the actual build + push + deploy pipeline targeting the
`loyalty-dev-cae` Container Apps environment. This script is intentionally
NOT executed by A-09.

## Open items / blockers
- `MssqlWebhookRepository` is a typed stub. A-12 or a follow-up task must wire
  the real `mssql` client (tedious/tarn) — interface is fixed.
- `secrets.ts` is a stub for the secret-decryption path; swap for Key Vault
  + envelope-encryption once A-02's secret-wrapping helper lands.
- `webhook.delivery.failed` event emission is a hook callback (`onDead`) — the
  actual publisher wire to Service Bus is TODO for the admin-dashboard consumer
  (A-10/A-11) to consume.
