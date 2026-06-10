# Analytics Service — HANDOFF (A-16 / T-16)

Analytics aggregation, reporting endpoints, bulk export, and real-time KPIs for the Loyalty Platform.

Port: `3006` (default via `PORT`). Base path: none.

## Decision Log

- **Language**: Task spec originally designated Python; A-02 created Node/TypeScript scaffolds for all services. Sticking with Node/TypeScript for consistency across the platform.
- **Migration version**: V12 (as assigned in `loyalty-parallel-agents.md`), not V8 (as in the original implementation plan prompt which predated the migration numbering scheme).
- **Schema**: Uses the `analytics_daily_summary` + `analytics_member_cohort` tables from V12 rather than the `daily_program_summary` / `tier_snapshot` / `offer_daily_stats` tables from the original prompt. The generic metric-key design is more flexible and avoids schema changes when new metrics are added.

## Endpoints

All analytics endpoints require `x-tenant-id` + `x-user-id` headers (dev mode) or a valid JWT with `tenantId` claim.

### Health (unauthenticated)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health check |
| GET | `/ready` | Readiness probe |

### Analytics API

| Method | Path | Query Params | Description |
|--------|------|-------------|-------------|
| GET | `/v1/analytics/summary` | `from`, `to`, `metrics` (comma-separated) | Daily summaries with derived KPIs. Metrics: `enrollments`, `transactions`, `total_spend`, `points_issued`, `points_redeemed`, `points_expired`, `redemptions`, `active_members` |
| GET | `/v1/analytics/enrollment` | `from`, `to`, `groupBy` (day\|week\|month) | Enrollment trends with channel breakdown |
| GET | `/v1/analytics/transactions` | `from`, `to`, `groupBy` (day\|week\|month) | Transaction volume, spend, avg basket, points/txn, channel breakdown |
| GET | `/v1/analytics/points-economy` | `from`, `to` | Issued vs redeemed vs expired, net outstanding, liability estimate |
| GET | `/v1/analytics/tier-distribution` | — | Count + % per tier |
| GET | `/v1/analytics/retention-cohort` | `from?`, `to?` | Cohort retention matrix |
| GET | `/v1/analytics/export/:entity` | `format` (csv\|json), `since?`, `limit?` | Bulk export. Entity: `members`, `transactions`, `ledger`, `redemptions`. CSV streams with `Content-Disposition: attachment`. |
| GET | `/v1/analytics/kpi/realtime` | — | Live metrics: active members today, transactions today, points issued today, redemptions today |

### Response Schemas

**GET /v1/analytics/summary**
```json
{
  "from": "2025-06-01",
  "to": "2025-06-30",
  "summaries": [
    { "summaryDate": "2025-06-01", "metricKey": "enrollments", "metricValue": 10, "dimensionsJson": { "pos": 6, "mobile": 4 } }
  ],
  "derived": {
    "avgTransactionValue": 5000,
    "pointsPerTransaction": 50,
    "redemptionRate": 0.15,
    "enrollmentGrowthRate": 0.05,
    "activeRate": 0.8
  }
}
```

**GET /v1/analytics/kpi/realtime**
```json
{
  "activeMembersToday": 42,
  "transactionsToday": 15,
  "pointsIssuedToday": 750,
  "redemptionsToday": 3,
  "asOf": "2025-06-01T12:00:00Z"
}
```

**GET /v1/analytics/tier-distribution**
```json
{
  "tiers": [
    { "tierId": "bronze", "tierName": "Bronze", "memberCount": 500, "percentage": 50 }
  ]
}
```

**GET /v1/analytics/retention-cohort**
```json
{
  "cohorts": [
    {
      "cohortMonth": "2025-01-01",
      "totalMembers": 100,
      "intervals": [
        { "daysSinceEnroll": 30, "activeCount": 80, "retentionRate": 0.8 }
      ]
    }
  ]
}
```

## Event Subscriptions

Subscription name: `analytics-service` on the following Service Bus topics:

| Topic | Handler | Effect |
|-------|---------|--------|
| `points.earned` | `handlePointsEarned` | Increment `points_issued` + `transactions` (if transactionId present) |
| `points.redeemed` | `handlePointsRedeemed` | Increment `points_redeemed` + `redemptions` |
| `member.enrolled` | `handleMemberEnrolled` | Increment `enrollments` with channel dimension |
| `tier.upgraded` | `handleTierUpgraded` | Logged for tier distribution tracking |
| `tier.downgraded` | `handleTierDowngraded` | Logged for tier distribution tracking |

All subscriptions use `maxDeliveryCount: 10` with `deadLetterOnProcessFailure: true`.

## Metric Keys

| Key | Description | Populated by |
|-----|-------------|-------------|
| `enrollments` | New member enrollments | `member.enrolled` events |
| `transactions` | Transaction count | `points.earned` events (with transactionId) |
| `total_spend` | Total spend in minor currency units | Nightly rebuild from transactions table |
| `points_issued` | Total points issued | `points.earned` events |
| `points_redeemed` | Total points redeemed | `points.redeemed` events |
| `points_expired` | Total points expired | Nightly rebuild / expiry worker events |
| `redemptions` | Redemption count | `points.redeemed` events |
| `active_members` | Members with activity in last 30 days | Nightly rebuild |

## Cron Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| 3:00 AM UTC daily | `rebuildRecentSummaries` | Recomputes all daily summaries from raw tables for the past 7 days (self-healing) |
| 4:00 AM UTC Sundays | `refreshCohorts` | Recomputes retention cohort table |

## Migration V12

File: `/services/tenant-migrations/V12__analytics_summaries.sql`

Tables created (idempotent):
- `dbo.analytics_daily_summary` — PK: `(summary_date, metric_key)`, stores daily aggregated metrics with optional JSON dimensions
- `dbo.analytics_member_cohort` — PK: `(cohort_month, days_since_enroll)`, stores retention cohort data with computed `retention_rate` column

## KQL Queries

Location: `/infra/monitoring/kql/`

| File | Purpose |
|------|---------|
| `slo-member-lookup-p99.kql` | Member lookup p99 latency (target < 100ms) |
| `slo-transaction-p99.kql` | Transaction processing p99 (target < 200ms) |
| `error-rate-by-service.kql` | Error rate per service (cloud_RoleName) |
| `dlq-depth.kql` | Service Bus dead-letter queue depth |

## Environment Variables

| Var | Purpose | Default |
|-----|---------|---------|
| `PORT` | HTTP port | `3006` |
| `NODE_ENV` | Environment | `development` |
| `KEY_VAULT_URI` | Azure Key Vault URI | — |
| `CONTROL_PLANE_SQL_CONNSTR` | Control plane DB connection string | — |
| `REDIS_URL` | ioredis-compatible Redis URL | — |
| `SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus connection | — |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights telemetry | — |
| `SKIP_AUTH` | Dev-only, trust x-tenant-id/x-user-id headers | `false` |

## In-Memory Mode

When infrastructure env vars are unset, the service boots with in-memory repositories. Used for tests and local dev. Not suitable for production.

## Tests

58 tests across 7 test suites, all passing:

- `tests/health.test.ts` — 2 tests (health, ready)
- `tests/aggregator.test.ts` — 14 tests (dateToBucket, groupSummaries, enrollment/transaction trend, points economy, metric key validation)
- `tests/csv-stream.test.ts` — 8 tests (escape, rowToCsv, stream, columns)
- `tests/kpi-calculator.test.ts` — 5 tests (derived KPIs, edge cases, todayUtc)
- `tests/cohort-builder.test.ts` — 6 tests (matrix building, retention computation, intervals)
- `tests/event-consumer.test.ts` — 7 tests (points earned/redeemed, enrollment, tier events, accumulation)
- `tests/routes.integration.test.ts` — 16 tests (all endpoints via supertest, validation, CSV streaming, missing tenant)

```
pnpm --filter @loyalty/analytics-service build    # 0 errors
pnpm --filter @loyalty/analytics-service test     # 58/58 passing
```

## Coordination Notes

- **A-19 (Admin Dashboard Frontend)**: Consumes all analytics endpoints above. The `/v1/analytics/summary` endpoint returns both raw summaries and derived KPIs in a single call. Realtime KPIs at `/v1/analytics/kpi/realtime` are designed for a dashboard polling pattern (sub-10ms response from Redis counters in production).
- **A-05 (Loyalty Engine)**: This service subscribes to `points.earned` and `points.redeemed` events. Payload compatibility follows the V1 schemas from `@loyalty/shared-events`.
- **A-04 (Member Service)**: Subscribes to `member.enrolled` events. Uses the standard `MemberEnrolledEvent` payload.
- **A-08 (Tier Eval Worker)**: Subscribes to `tier.upgraded` and `tier.downgraded` events for tracking purposes.
- **A-13 (Offer Service)**: Offer performance analytics (impressions, redemption rates) can be added by extending the metric keys in `analytics_daily_summary` without schema changes.
- **A-11 (Admin API)**: The admin dashboard frontend routes through the admin API for auth; analytics endpoints can be proxied or called directly depending on APIM routing.
