# App Service Migration -- Smoke Test Results

**Date:** 2026-04-10
**Target:** Azure App Service (loyalty-dev-asp, P1v3 Linux)
**Container Registry:** loyaltydevacr4a8a43.azurecr.io
**Auth mode:** SKIP_AUTH=true (x-tenant-id / x-user-id / x-user-role headers)
**Test tenant:** `273684b8-4d97-48b0-afb8-cfe831555bc8` (daiso-test)
**SQL Server:** `loyalty-dev-sql-5rdrqhw.database.windows.net` (westus2)

---

## App Service URLs

| Service | App Service URL | Status |
|---------|----------------|--------|
| member-service | https://loyalty-dev-member-service.azurewebsites.net | Running |
| loyalty-engine | https://loyalty-dev-loyalty-engine.azurewebsites.net | Running |
| notification-service | https://loyalty-dev-notification-service.azurewebsites.net | Running |
| offer-service | https://loyalty-dev-offer-service.azurewebsites.net | Running |
| admin-api | https://loyalty-dev-admin-api.azurewebsites.net | Running |
| analytics-service | https://loyalty-dev-analytics-service.azurewebsites.net | Running |

Workers remain on Container Apps:
- tier-eval-worker (Container Apps)
- webhook-worker (Container Apps)

---

## Migration Details

### Infrastructure
- **App Service Plan:** `loyalty-dev-asp` (P1v3 Linux, already provisioned)
- **Deployment:** Container images from ACR (`loyaltydevacr4a8a43.azurecr.io/<service>:dev`)
- **Platform:** linux/amd64 (rebuilt from arm64)
- **Managed Identity:** Enabled on all 6 web apps, Key Vault Secrets User role granted

### Code Fixes Applied

1. **Admin API points-adjust endpoint** (`services/admin-api/src/http-clients.ts`):
   - Changed URL from `/v1/points/adjust` to `/v1/members/:id/adjustments`
   - Added `x-user-role: admin` and `idempotency-key` headers

2. **SQL tenant_id column mismatch** (all SQL repositories):
   - Tenant DB schema uses database-level isolation (no `tenant_id` columns)
   - Fixed `analytics-service/src/sql-repositories.ts` -- removed tenant_id from all queries
   - Fixed `offer-service/src/sql-db.ts` -- removed tenant_id from all queries
   - Fixed `admin-api/src/sql-repositories.ts` -- removed tenant_id, fixed column names
     (tiers: `min_points` not `threshold_points`, webhook_configs: `hook_id` not `id`,
      program_config: singleton `id=1` not `tenant_id`)

3. **Mobile dashboard SQL data provider** (`services/member-service/src/mobile/data-provider.sql.ts`):
   - Created `SqlMobileDataProvider` implementing the `MobileDataProvider` interface
   - Wired into member-service `index.ts` when `TENANT_SQL_CONNSTR` is set
   - Queries members, tiers (min_points), transactions (txn_id, amount), offers, notifications

4. **Container Apps HTTP services scaled to zero** to avoid double-billing

---

## Smoke Test Results (13/13 PASS)

| # | Test | Status | Evidence |
|---|------|--------|----------|
| 1 | Health checks (6 services) | **PASS** | All 6 returned HTTP 200 |
| 2 | Member enrollment | **PASS** | POST /v1/members -> 200, new member created in SQL |
| 3 | Phone lookup | **PASS** | GET /v1/members?phone -> 200, member found via SQL |
| 4 | Record transaction | **PASS** | POST /v1/transactions -> 200, transactionId returned |
| 5 | Check balance | **PASS** | GET /v1/members/:id/balance -> 200, balance returned |
| 6 | Idempotency replay | **PASS** | Same idempotency-key returns same transactionId |
| 7 | Admin member lookup | **PASS** | GET /v1/admin/members/:id -> 200, cross-service HTTP call works |
| 8 | Points adjustment | **PASS** | POST /v1/admin/members/:id/points-adjust -> 200, ledgerId returned |
| 9 | Eligible offers | **PASS** | GET /v1/members/:id/offers -> 200, empty items (no offers seeded) |
| 10 | Analytics summary | **PASS** | GET /v1/analytics/summary -> 200, empty summaries with derived zeros |
| 11 | Mobile dashboard | **PASS** | GET /v1/mobile/dashboard/:id -> 200, full dashboard with tier progress |
| 12 | GDPR delete | **PASS** | DELETE /v1/members/:id -> 204 |
| 13 | Verify 404 after delete | **PASS** | GET /v1/members/:id -> 404 |

**Summary: 13 PASS, 0 FAIL, 0 WARN**
