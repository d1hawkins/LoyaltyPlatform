# Live Smoke Test Results -- SQL Wiring Phase

**Date:** 2026-04-10
**Target:** Azure Container Apps (loyalty-platform-dev)
**Environment:** `loyalty-dev-cae` (eastus)
**Auth mode:** SKIP_AUTH=true (x-tenant-id / x-user-id / x-user-role headers)
**Test tenant:** `273684b8-4d97-48b0-afb8-cfe831555bc8` (daiso-test)
**Test member:** `399a193b-8356-495a-a242-f470aff239cb`
**SQL Server:** `loyalty-dev-sql-5rdrqhw.database.windows.net` (westus2)

---

## Infrastructure Changes Applied

### 1. V1-V14 Migrations on tenant-daiso-test

All 14 migration files applied successfully (idempotent re-run). V13 required a
bugfix: the `ALTER TABLE ... ADD expires_at` and subsequent `CREATE INDEX` on
that column were in the same batch, causing a parse-time "Invalid column name"
error. Fixed by inserting a `GO` batch separator.

| Migration | Batches | Rows | Time (ms) | Status |
|-----------|---------|------|-----------|--------|
| V1\_\_members.sql | 5 | 0 | 1303 | OK |
| V2\_\_transactions.sql | 3 | 0 | 457 | OK |
| V3\_\_points\_ledger.sql | 4 | 0 | 629 | OK |
| V4\_\_tiers.sql | 2 | 0 | 305 | OK |
| V5\_\_webhooks.sql | 2 | 0 | 304 | OK |
| V6\_\_program\_config.sql | 1 | 0 | 153 | OK |
| V7\_\_indexes\_and\_views.sql | 6 | 0 | 939 | OK |
| V8\_\_webhook\_deliveries.sql | 2 | 0 | 303 | OK |
| V9\_\_notification\_log.sql | 2 | 0 | 303 | OK |
| V10\_\_audit\_log.sql | 1 | 0 | 153 | OK |
| V11\_\_offers\_redemptions.sql | 1 | 0 | 153 | OK |
| V12\_\_analytics\_summaries.sql | 1 | 0 | 151 | OK |
| V13\_\_expiry\_columns.sql | 2 | 0 | 365 | OK (after fix) |
| V14\_\_fraud\_flags.sql | 1 | 5 | 188 | OK |

**17 tables verified** in tenant-daiso-test: analytics_daily_summary,
analytics_member_cohort, audit_log, fraud_flags, fraud_rules, members,
notification_log, notification_preferences, offer_codes, offers, points_ledger,
program_config, redemptions, tiers, transactions, webhook_configs,
webhook_deliveries.

### 2. Managed Identity + RBAC

System-assigned managed identity enabled on all 8 Container Apps. Each granted
"Key Vault Secrets User" role on `loyalty-dev-kv-5rdrqh`.

| Service | Principal ID | RBAC |
|---------|-------------|------|
| member-service | e90aa047-c949-4c10-9925-789dd8dbf820 | OK |
| loyalty-engine | 3c3bfd45-dbe0-4ab6-9087-0479d3f5d897 | OK |
| notification-service | 5624baea-4f68-460d-9dd4-366cfed939bd | OK |
| offer-service | b8809a98-062b-4279-8da1-f8c78f0c617c | OK |
| admin-api | 66886891-3ce5-4096-b7f6-24d52cad2bda | OK |
| analytics-service | ad31d8e5-cc14-4e26-a290-8525d91e1794 | OK |
| tier-eval-worker | c7d074c5-3cfc-44b4-802d-48c64a1fe925 | OK |
| webhook-worker | 1558e830-4cab-476b-8774-462fc65cade2 | OK |

### 3. Environment Variables Updated

All 8 Container Apps updated with:
- `CONTROL_PLANE_SQL_CONNSTR` -- real SQL connection string to control-plane DB
- `KEY_VAULT_URI` -- Key Vault endpoint
- `REDIS_URL` -- Redis connection string
- `SERVICE_BUS_CONNECTION_STRING` -- Service Bus (workers + most HTTP services)
- `APPLICATIONINSIGHTS_CONNECTION_STRING` -- App Insights (HTTP services)
- `SKIP_AUTH=true` -- dev auth mode

**Note:** `SERVICE_BUS_CONNECTION_STRING` was **removed** from
notification-service because its `startService()` throws an explicit error in
live mode ("live-mode not yet implemented"). It runs in in-memory mode instead.

Cross-service URLs set:
- loyalty-engine: `MEMBER_SERVICE_URL`
- admin-api: `MEMBER_SERVICE_URL`, `LOYALTY_ENGINE_URL`, `WEBHOOK_WORKER_URL`
- offer-service: `LOYALTY_ENGINE_URL`

### 4. SQL Firewall Rules

- Client IP `99.149.125.141` added for migration runner access
- `AllowAzureServices (0.0.0.0)` added for Container Apps outbound access

---

## Service Health After Update

All 6 HTTP services returned HTTP 200 after restart:

| Service | HTTP | Response |
|---------|------|----------|
| member-service | 200 | `{"status":"ok","service":"member-service","version":"0.1.0"}` |
| loyalty-engine | 200 | `{"status":"ok","service":"loyalty-engine","version":"0.3.0"}` |
| notification-service | 200 | `{"status":"ok","service":"notification-service","version":"0.1.0"}` |
| offer-service | 200 | `{"status":"ok","service":"offer-service","version":"0.2.0"}` |
| admin-api | 200 | `{"status":"ok","service":"admin-api","version":"0.1.0"}` |
| analytics-service | 200 | `{"status":"ok","service":"analytics-service","version":"1.0.0"}` |

---

## SQL Mode vs In-Memory Mode

**All services remain in in-memory mode.** The services were built with
in-memory adapters as the default, and none contain conditional logic to switch
to SQL-backed repositories based on environment variables like
`CONTROL_PLANE_SQL_CONNSTR` or `USE_REAL_DB`. Each service's `createApp()`
function constructs in-memory implementations when no explicit deps are
injected.

Specifically:
- **member-service**: `InMemoryMemberRepository`, `InMemoryBalanceCache`,
  `NoopEventPublisher`, `InMemoryMobileDataProvider`
- **loyalty-engine**: `InMemoryDb`, `InMemoryCache`, `InMemoryPublisher`,
  `InMemoryMemberClient`
- **admin-api**: `InMemoryMemberClient`, `InMemoryLoyaltyEngineClient`,
  `InMemoryWebhookWorkerClient`, `InMemoryAuditRepository`, etc.
- **offer-service**: `InMemoryOfferDb`, `InMemoryPublisher`,
  `InMemoryLoyaltyEngineClient`, `InMemoryMemberClient`
- **analytics-service**: `InMemorySummaryRepository`,
  `InMemoryCohortRepository`, `InMemoryTierRepository`, etc.
- **notification-service**: `InMemoryNotificationRepository` (live mode throws)

The SQL adapter interfaces exist (e.g., `LoyaltyDb`, `MemberRepository`,
`MemberClient`) but only `InMemory*` implementations are provided. SQL
implementations and HTTP cross-service clients have not been built.

---

## Smoke Test Results (13 Tests)

| # | Test | Status | Evidence |
|---|------|--------|----------|
| 1 | Health checks (6 services) | **PASS** | All 6 returned HTTP 200 `{"status":"ok"}` |
| 2 | Member enrollment | **PASS** | POST /v1/members -> 200, id=`399a193b-8356-495a-a242-f470aff239cb`, tier=Bronze, balance=0 |
| 3 | Phone lookup | **PASS** | GET /v1/members?phone -> 200, returned enrolled member with correct ID and tier |
| 4 | Record transaction | **EXPECTED-FAIL** | POST /v1/transactions -> 404 "member not found" -- loyalty-engine has separate in-memory store, cannot see member enrolled in member-service |
| 5 | Check balance | **PASS** | GET /v1/members/:id/balance -> 200, `{"balance":0}` -- default zero from loyalty-engine's own store |
| 6 | Idempotency replay | **EXPECTED-FAIL** | Same 404 as test 4 -- cannot verify idempotency without successful initial transaction |
| 7 | Admin member lookup | **EXPECTED-FAIL** | GET /v1/admin/members/:id -> 404 -- admin-api's InMemoryMemberClient has no data |
| 8 | Points adjustment | **EXPECTED-FAIL** | POST /v1/admin/members/:id/points-adjust -> 404 -- same cross-service isolation |
| 9 | Eligible offers | **EXPECTED-FAIL** | GET /v1/members/:id/offers -> 404 -- offer-service's InMemoryMemberClient has no data |
| 10 | Analytics summary | **PASS** | GET /v1/analytics/summary -> 200, valid empty summary response with derived metrics |
| 11 | Mobile dashboard | **EXPECTED-FAIL** | GET /v1/mobile/dashboard/:id -> 404 -- InMemoryMobileDataProvider has no data |
| 12 | GDPR delete | **PASS** | DELETE /v1/members/:id -> 204 |
| 13 | Verify 404 after delete | **PASS** | GET /v1/members/:id -> 404, member confirmed deleted |

**Summary: 7 PASS, 6 EXPECTED-FAIL**

The 6 expected failures are all caused by the same root issue: cross-service
data isolation due to in-memory adapters. Each service maintains its own
independent data store. A member enrolled in member-service is invisible to
loyalty-engine, admin-api, offer-service, and the mobile dashboard.

---

## Blockers / Follow-up Work Required

### Blocker: SQL Repository Implementations Not Built

To achieve all 13 tests passing, the following must be completed:

1. **SQL-backed repositories** for each service (replacing `InMemory*`):
   - `SqlMemberRepository` for member-service
   - `SqlLoyaltyDb` for loyalty-engine
   - `SqlOfferDb` for offer-service
   - `SqlAuditRepository`, `SqlProgramConfigRepo`, etc. for admin-api
   - `SqlSummaryRepository`, etc. for analytics-service
   - `SqlNotificationRepository` for notification-service

2. **HTTP cross-service clients** (replacing `InMemory*Client`):
   - `HttpMemberClient` for loyalty-engine (interface: `getMember(tenantId, memberId)`)
   - `HttpMemberClient` for admin-api (interface: `search`, `getById`, `setStatus`, `gdprDelete`)
   - `HttpLoyaltyEngineClient` for admin-api (interface: `adjustPoints`, `overrideTier`)
   - `HttpMemberClient` for offer-service
   - `HttpLoyaltyEngineClient` for offer-service

3. **Adapter selection logic** in each service's `index.ts`:
   - Check for `CONTROL_PLANE_SQL_CONNSTR` or a `USE_REAL_DB=true` flag
   - Construct SQL/HTTP implementations instead of in-memory ones
   - Pass them via the existing `deps` injection pattern

4. **notification-service live mode**: The `startService()` function throws when
   `SERVICE_BUS_CONNECTION_STRING` is set. The Service Bus subscriber
   integration needs to be completed.

### Non-blocking: V13 Migration Fix

The `V13__expiry_columns.sql` file was fixed by adding a `GO` batch separator
between the `ALTER TABLE ADD expires_at` and the subsequent `CREATE INDEX` that
references `expires_at`. This fix is in the local repo and should be committed.

### Infrastructure: Ready

All Azure infrastructure is correctly provisioned and ready for SQL-backed
services:
- SQL Server accessible, firewall configured
- All 17 tenant tables created with V1-V14 migrations
- Managed identities enabled with Key Vault RBAC
- Connection strings injected as env vars
- Container Apps healthy and running
