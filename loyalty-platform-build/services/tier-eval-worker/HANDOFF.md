# Tier Evaluation Worker — HANDOFF (T-06 / A-08)

Background worker that listens to points-ledger-impacting events from the
Loyalty Engine and promotes or demotes members based on their rolling 12-month
points total. Also runs a nightly demotion sweep for inactive members.

Deployment target: Azure Container Apps (CI/CD pipeline owned by A-12). Runs
headless — no HTTP endpoints.

## Events consumed

All inbound envelopes are the canonical `EventEnvelope<T>` from
`@loyalty/shared-events`; payloads are validated at the edge with zod
(`src/schemas.ts`) and malformed messages are dead-lettered with a reason.

### `points.earned` (V1 payload)
Published by the loyalty-engine on every successful transaction create AND on
positive admin adjustments. See `services/loyalty-engine/HANDOFF.md` for the
canonical definition — matched exactly here.

```ts
interface PointsEarnedPayloadV1 {
  memberId: string;
  transactionId: string;
  ledgerId: string;
  delta: number;
  newBalance: number;
  channel: string;
  reasonCode: 'earn' | 'adjust' | 'bonus';
}
```

### `transaction.voided` (V1 payload)
Published on voids. Used to trigger re-evaluation (potential demotion) when a
reversal drops the rolling total below the current tier's threshold.

```ts
interface TransactionVoidedPayloadV1 {
  memberId: string;
  transactionId: string;
  originalLedgerId: string;
  reversalLedgerId: string;
  delta: number;
  newBalance: number;
  reason: string;
}
```

Both topics are subscribed on the same subscription name
`SUBSCRIPTION_NAME` (default `tier-eval-worker`). On first boot the worker
idempotently creates the subscription via
`ServiceBusAdministrationClient.subscriptionExists` /
`createSubscription`. If A-01 pre-creates the subscription, the call is a
no-op.

## Events published

Published via `ServiceBusPublisher` from `@loyalty/shared-events`, wrapped in
the standard envelope (`eventId`, `eventType`, `tenantId`, `timestamp`,
`version: '1.0'`).

### `tier.upgraded` / `tier.downgraded`
```ts
interface TierChangedPayload {
  memberId: string;
  previousTierId: string | null;
  newTierId: string | null;
  rollingPoints: number;
  evaluatedAt: string;       // ISO 8601
  triggerEventId: string | null; // null for cron-driven demotions
}
```

Downstream consumers: webhook-worker (A-10), analytics (A-16), notification
service (A-10 fan-out for member notifications on downgrade).

## Processing pipeline

1. Dedupe the inbound Service Bus `messageId` via a Redis `SET NX EX`
   (prefix `tier-eval:dedupe:`, TTL 24h). Duplicates are logged at info and
   acked without side effects.
2. Parse the envelope and its payload with zod. Malformed → dead-letter.
3. Load the member (tenant DB). Missing member → dead-letter.
4. In parallel, load:
   - Rolling 12-month ledger sum:
     `SELECT SUM(delta) FROM points_ledger WHERE member_id = @mid AND created_at >= DATEADD(MONTH, -12, SYSUTCDATETIME())`
   - All active tiers for the tenant, sorted ASC by `min_points`.
5. Select the highest qualifying tier via `selectTier(rollingPoints, tiers)`
   (see `src/evaluator.ts`). Rules:
   - Member qualifies iff `rollingPoints >= tier.minPoints`.
   - Ties broken by `sortOrder` desc, then `minPoints` desc, then `id` for
     determinism.
   - Negative / NaN points clamped to 0.
6. Compare to the member's current `tier_id`. If unchanged → no-op (debug log).
7. If changed, in a single DB transaction:
   - `UPDATE members SET tier_id = @new WHERE id = @mid`
   - `INSERT INTO tier_history (...)`
8. Invalidate the Redis balance cache key
   `tenant:{tenantId}:member:{memberId}:balance` (matches the loyalty-engine
   key shape).
9. Publish `tier.upgraded` or `tier.downgraded` with the payload above.

Transient errors (DB deadlock, Redis timeout, publisher failure) propagate out
of the handler — the Service Bus receiver abandons the message and the broker
redelivers. Permanent errors (malformed payload, missing member, missing
messageId, unsupported eventType) are dead-lettered with a human-readable
reason in the `detail` property of the process result.

## Internal schema — `tier_history`

Created on first startup via `CREATE TABLE IF NOT EXISTS` in each tenant DB.
Does not consume a V-number (A-03 owns V1–V7).

```sql
CREATE TABLE IF NOT EXISTS dbo.tier_history (
  id                 UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  member_id          UNIQUEIDENTIFIER NOT NULL,
  previous_tier_id   UNIQUEIDENTIFIER NULL,
  new_tier_id        UNIQUEIDENTIFIER NULL,
  rolling_points     INT              NOT NULL,
  reason             NVARCHAR(32)     NOT NULL
                     CHECK (reason IN ('auto_promotion','auto_demotion','manual')),
  evaluated_at       DATETIME2        NOT NULL,
  trigger_event_id   NVARCHAR(64)     NULL,
  created_at         DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_tier_history_member ON dbo.tier_history (member_id, evaluated_at DESC);
```

## Demotion cron

Daily full scan. Schedule is configurable via `TIER_DEMOTION_CRON` (default
`0 3 * * *` — 3am UTC). A minimal daily-only cron parser lives in `src/index.ts`
(`parseDailyCron`, `msUntilNext`) — only `M H * * *` expressions are supported.
If a richer schedule is required, swap in `node-cron` in a follow-up.

For each active member with `last_transaction_at <= now() - N days`
(`N = TIER_DEMOTION_COOLDOWN_DAYS`, default 30 — the
`program_config.tier_demotion_cooldown_days` override will be wired in when
the mssql repository lands):

1. Recompute rolling 12-month points.
2. Re-run the same evaluation path (`applyEvaluation`).
3. If the resulting transition is a downgrade, update `members.tier_id`,
   insert a `tier_history` row with `reason='auto_demotion'`, invalidate the
   Redis cache key, and publish `tier.downgraded`.

Each member is wrapped in its own DB transaction so one failure does not
poison the batch. Per-member errors are logged at `error` and counted; the
scan returns `{ scanned, demoted, errors }`.

Downstream notification to the member is handled by A-10 consuming
`tier.downgraded` on the notification service.

## Environment variables

| Var                                 | Required (live) | Default           | Purpose                                                    |
|-------------------------------------|:---------------:|-------------------|------------------------------------------------------------|
| `NODE_ENV`                          |      no         | `development`     | Standard                                                   |
| `LOG_LEVEL`                         |      no         | `debug`/`info`    | pino level                                                 |
| `SERVICE_BUS_CONNECTION_STRING`     |     yes         | —                 | Azure Service Bus namespace                                |
| `CONTROL_PLANE_SQL_CONNSTR`         |     yes         | —                 | mssql conn string for control plane                        |
| `KEY_VAULT_URI`                     |     yes         | —                 | Key Vault for tenant-DB secrets                            |
| `REDIS_URL`                         |     yes         | —                 | ioredis URL for dedupe + cache invalidation                |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | no         | —                 | App Insights telemetry                                     |
| `SUBSCRIPTION_NAME`                 |      no         | `tier-eval-worker`| Service Bus subscription name on both topics               |
| `TIER_DEMOTION_CRON`                |      no         | `0 3 * * *`       | Daily cron expression (`M H * * *` only)                   |
| `TIER_DEMOTION_COOLDOWN_DAYS`       |      no         | `30`              | Inactivity window for demotion sweep                       |
| `DEDUPE_TTL_SECONDS`                |      no         | `86400`           | Dedupe Redis TTL                                           |

When any of `SERVICE_BUS_CONNECTION_STRING`, `CONTROL_PLANE_SQL_CONNSTR`,
`KEY_VAULT_URI` or `REDIS_URL` is unset, the worker boots in **in-memory
mode** with stub repo/dedupe/publisher/cache. This mirrors the loyalty-engine
pattern and is what the test suite and local dev use. Live mode currently
throws on boot until the mssql-backed `TierRepository` lands (see
`src/index.ts`) — this is intentional so the worker can never silently
mis-process events against a real SQL server.

## Dead-letter triage runbook

Each dead-lettered message carries a `detail` reason one of:

- `malformed_envelope:<zod err>` — publisher bug or schema drift; cross-check
  `services/loyalty-engine/HANDOFF.md` § canonical envelope.
- `malformed_points_earned:<zod err>` / `malformed_tx_voided:<zod err>` —
  payload field drift from the loyalty-engine V1 schema.
- `unsupported_event_type:<type>` — subscription is receiving traffic from a
  topic the worker doesn't handle; check Service Bus topic filters.
- `member_not_found` — member was hard-deleted between the trigger event and
  the tier eval; safe to drop in most cases.
- `missing_message_id` — upstream publisher did not set a `messageId`; this
  should never happen for events published via `ServiceBusPublisher` (it sets
  `messageId = envelope.eventId`). Investigate the producer.

To replay a dead-lettered message: read from the DLQ, fix the root cause
(usually a publisher), and requeue onto the main subscription. Because of the
Redis dedupe set the replay will be processed exactly once.

## Files

```
services/tier-eval-worker/src/
  index.ts              bootstrap, signal handling, cron scheduler, in-memory fallback
  evaluator.ts          pure tier-selection logic (100% covered)
  worker.ts             Service Bus consumer pipeline + demotion scan
  repository.ts         TierRepository interface
  repository.memory.ts  in-memory repo for tests + local dev
  dedupe.ts             Redis + in-memory dedupe stores
  config.ts             zod env schema
  schemas.ts            re-exports + zod validators for inbound payloads
services/tier-eval-worker/tests/
  evaluator.test.ts     pure logic — 12 cases, 100% coverage
  worker.test.ts        consumer-loop integration with in-memory deps
  idempotency.test.ts   duplicate messageId handling
  demotion-cron.test.ts demotion sweep + cron expression helpers
```

## Commands

```
pnpm --filter @loyalty/tier-eval-worker build   # 0 errors
pnpm --filter @loyalty/tier-eval-worker test    # 34 tests, evaluator 100%
```

## Coordination notes

- **A-01 / infra** — may pre-create the two subscriptions; the worker's
  `createSubscription` call is idempotent either way.
- **A-03 (migrations)** — depends on `members.tier_id`, `points_ledger`,
  `tiers` (V4). `tier_history` is created at runtime.
- **A-05 (loyalty-engine)** — canonical producer of `points.earned` /
  `transaction.voided`. Payload drift here requires coordinated updates to
  `src/schemas.ts`.
- **A-10 (notification / webhook)** — consumes `tier.upgraded` /
  `tier.downgraded` for member notifications and webhook fan-out.
- **A-12 (CI/CD)** — deploys this worker to Azure Container Apps. Dockerfile
  already exists at `services/tier-eval-worker/Dockerfile`.

## Known deferrals / follow-ups

- Live-mode mssql `TierRepository` + Service Bus receiver loop are stubbed;
  boot currently throws in live mode. The consumer pipeline and cron logic
  are fully implemented and unit-tested via in-memory adapters.
- Cron parser only supports `M H * * *`. Swap for `node-cron` if a richer
  schedule is required.
- `program_config.tier_demotion_cooldown_days` override is not yet read —
  the env var takes precedence until the mssql repo is wired.
