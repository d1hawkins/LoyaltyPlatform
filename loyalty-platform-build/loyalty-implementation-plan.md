# Loyalty Platform — Claude Implementation Task Plan

> 20 self-contained implementation prompts · 4 phases · Production-ready output per task

---

**LOYALTY PLATFORM**
Claude Implementation Task Plan
20 self-contained prompts · 4 phases · Production-ready output per task
Version 1.0 · April 2026 · CONFIDENTIAL

**How to Use This Plan**

Each task in this document is a complete, self-contained Claude implementation prompt. Open a fresh Claude conversation for each task. Paste the full prompt text (shown in the dark box) and provide the relevant context files when indicated.

  ----------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------
  **Task Card Element**               **What It Means**

  **Task ID + Title (navy bar)**      Unique reference ID and descriptive task name. Use this ID when referencing in other task prompts.

  **Domain badge (blue)**             The functional domain: Infra, Data, Members, Points, Tiers, Offers, Channel, Admin, Analytics, DevOps, Auth, Notif, Mobile, Platform.

  **Phase badge (gold)**              Which delivery phase this task belongs to. Complete Phase 1 before starting Phase 2.

  **DEPENDS ON**                      Task IDs that must be complete before starting this task. Their output code/config is assumed available in your repo.

  **DELIVERS**                        What files, services, or capabilities this task produces. Use to verify Claude completed everything.

  **CONTEXT (blue box)**              Background information to help Claude understand the broader system. Include this when starting the conversation.

  **CLAUDE PROMPT (dark box)**        The exact prompt to paste into a fresh Claude conversation. Copy the entire text block.

  **NOTES (gold box)**                Implementation caveats and gotchas. Read before starting; share with Claude if relevant errors occur.
  ----------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------

**Task Dependency Map**

Complete tasks in order within each phase. Tasks within the same phase with no shared dependencies can be run in parallel.

**Phase 1**

  ---------- -------------------------------------------------------- ------------------ ------------------
  **ID**     **Title**                                                **Domain**         **Depends On**

  **T-01**   Azure Infrastructure Scaffold                            Infra              ---

  **T-02**   Monorepo Project Structure & Shared Tooling              Infra              T-01

  **T-03**   Control Plane Database & Tenant Provisioning             Data               T-01, T-02

  **T-04**   Member Service --- Enrollment, Profile & Lookup          Members            T-02, T-03

  **T-05**   Loyalty Engine --- Transaction Processing & Ledger       Points             T-02, T-03, T-04

  **T-06**   Tier Evaluation Worker                                   Tiers              T-05

  **T-07**   Azure API Management Configuration                       API                T-01, T-04, T-05

  **T-08**   Authentication --- Azure AD B2C Configuration            Auth               T-01

  **T-09**   Webhook Delivery Service                                 Webhooks           T-02, T-03

  **T-10**   Notification Service --- Email & Transactional           Notif              T-02, T-03

  **T-11**   Admin API --- Program Config, Member Management & RBAC   Admin              T-02, T-03, T-04

  **T-12**   CI/CD Pipeline & Deployment                              DevOps             T-01, T-02
  ---------- -------------------------------------------------------- ------------------ ------------------

**Phase 2**

  ---------- ------------------------------------------------------ ------------------ ------------------------
  **ID**     **Title**                                              **Domain**         **Depends On**

  **T-13**   Offer Service --- Catalog, Eligibility & Redemption    Offers             T-05, T-06, T-11

  **T-14**   E-Commerce Integration --- REST API & JavaScript SDK   Channel            T-04, T-05, T-13

  **T-15**   Consumer Mobile API & Push Notifications               Mobile             T-04, T-05, T-08, T-13

  **T-16**   Analytics Service & Reporting Dashboard Data           Analytics          T-05, T-06, T-11, T-13
  ---------- ------------------------------------------------------ ------------------ ------------------------

**Phase 3**

  ---------- ------------------------------------------------ ------------------ ------------------
  **ID**     **Title**                                        **Domain**         **Depends On**

  **T-17**   Points Expiry Engine                             Platform           T-05

  **T-18**   Fraud Detection --- Rule-Based Velocity Checks   Platform           T-05, T-04

  **T-19**   Admin Dashboard Frontend                         Admin              T-11, T-16
  ---------- ------------------------------------------------ ------------------ ------------------

**Phase 4**

  ---------- ------------------------------------- ------------------ ------------------
  **ID**     **Title**                             **Domain**         **Depends On**

  **T-20**   Self-Serve Tenant Onboarding Portal   Platform           T-03, T-19
  ---------- ------------------------------------- ------------------ ------------------

**PHASE 1**
**Foundation**
Core platform infrastructure: 12 tasks covering infra scaffold, auth, all primary services, CI/CD
12 implementation tasks

  ---------- -------------------------------------------------- ----------- -------------
  **T-01**   **Azure Infrastructure Scaffold**                  **Infra**   **Phase 1**

  ---------- -------------------------------------------------- ----------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
*None --- start here*             | Bicep/Terraform IaC files, GitHub Actions CI pipeline, environment config files

**CONTEXT**
This is the first task. All subsequent tasks deploy into this infrastructure. Use Azure CLI + Bicep/Terraform. Target: one resource group per environment (dev, staging, prod).

**▶ CLAUDE PROMPT**
You are building a production-grade Azure infrastructure scaffold for a multi-tenant retail loyalty platform.
Create complete Infrastructure-as-Code using Azure Bicep (preferred) or Terraform that provisions:
RESOURCES TO PROVISION (per environment: dev, staging, prod):
- Azure Resource Group (loyalty-platform-{env})
- Azure App Service Plan (P2v3, Linux) for API services
- Azure API Management (Developer tier for dev, Standard for prod)
- Azure Service Bus namespace (Standard tier) with topics:
member.enrolled, points.earned, points.redeemed, tier.upgraded,
tier.downgraded, transaction.voided, member.deleted
- Azure SQL Server (SQL auth + Azure AD auth)
- Azure Cache for Redis (C2 Standard)
- Azure Blob Storage account (LRS dev, GRS prod)
- Azure Key Vault (Standard tier)
- Azure Application Insights (workspace-based, Log Analytics workspace)
- Azure Container Apps Environment (for background workers)
- Azure AD B2C tenant configuration scaffold
OUTPUT STRUCTURE:
/infra
/modules
api-management.bicep
app-service.bicep
service-bus.bicep
sql-server.bicep
redis.bicep
storage.bicep
key-vault.bicep
app-insights.bicep
container-apps.bicep
main.bicep
parameters/
dev.parameters.json
staging.parameters.json
prod.parameters.json
/.github/workflows/
deploy-infra.yml (GitHub Actions pipeline)
REQUIREMENTS:
- All secrets stored in Key Vault, never in parameters files
- Managed Identity used for service-to-service auth where possible
- Tags: environment, project=loyalty-platform, owner on all resources
- App Insights connection string output as Key Vault secret
- Redis connection string output as Key Vault secret
- SQL connection strings output as Key Vault secrets (one per tenant slot)
- Service Bus connection string output as Key Vault secret
- Idempotent: re-running deploy should not recreate existing resources
Also produce a README.md with setup instructions and prerequisite CLI commands.

**⚠ NOTES FOR THIS TASK**
Run in a fresh Azure subscription or resource group. Verify APIM provisioning completes --- it can take 30--45 minutes on first deploy.

  ---------- -------------------------------------------------- ----------- -------------
  **T-02**   **Monorepo Project Structure & Shared Tooling**    **Infra**   **Phase 1**

  ---------- -------------------------------------------------- ----------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-01                              | Monorepo scaffold, shared packages (logger, errors, middleware, db-client), ESLint/Prettier config, test runner setup

**CONTEXT**
Establishes the Node.js monorepo that all services live in. Uses pnpm workspaces. All services share common middleware, logging, and error-handling packages defined here.

**▶ CLAUDE PROMPT**
Create a production-grade Node.js monorepo scaffold for a multi-tenant loyalty platform using pnpm workspaces.
MONOREPO STRUCTURE:
/loyalty-platform
pnpm-workspace.yaml
package.json (root)
tsconfig.base.json
.eslintrc.js
.prettierrc
jest.config.base.js
/packages
/shared-logger --- structured JSON logger (pino), always includes tenantId, correlationId
/shared-errors --- typed error classes (NotFoundError, ValidationError, TenantError, etc.)
/shared-middleware --- Express middleware: auth JWT validation, tenant resolution, request logging, error handler
/shared-db-client --- Azure SQL connection pool factory; resolves tenant DB from control plane; caches in Redis
/shared-events --- Azure Service Bus publisher/subscriber factory with typed event schemas
/shared-types --- TypeScript interfaces for all domain entities (Member, Transaction, Ledger, Tier, Offer, etc.)
/services
/api-gateway-config --- APIM policy XMLs and OpenAPI specs (no runtime code)
/loyalty-engine --- (scaffold only --- implemented in T-05)
/member-service --- (scaffold only --- implemented in T-04)
/offer-service --- (scaffold only --- implemented in T-10)
/notification-service --- (scaffold only --- implemented in T-11)
/analytics-service --- (scaffold only --- implemented in T-13)
/admin-api --- (scaffold only --- implemented in T-12)
/tier-eval-worker --- (scaffold only --- implemented in T-06)
SHARED PACKAGES --- IMPLEMENT IN FULL:
shared-logger:
- Pino logger factory: createLogger(service: string) =\> Logger
- Auto-injects: service, environment, timestamp
- Request middleware adds: tenantId, correlationId, userId, method, path, statusCode, durationMs
shared-errors:
- Base AppError(message, code, statusCode)
- Subclasses: NotFoundError (404), ValidationError (400), UnauthorizedError (401),
ForbiddenError (403), ConflictError (409), TenantNotFoundError (404), RateLimitError (429)
- toJSON() method for RFC 7807 Problem Details format
shared-middleware:
- authenticateJWT: validates Azure AD B2C JWT, extracts tenantId + userId claims
- resolveTenant: loads tenant record from control plane, attaches to req.tenant
- correlationId: generates/propagates X-Correlation-ID header
- requestLogger: logs all requests with duration
- errorHandler: catches AppError subclasses, formats RFC 7807 response
shared-db-client:
- TenantDbClient class
- constructor takes KeyVault client + Redis client
- getConnection(tenantId): resolves Key Vault secret name from control plane, returns mssql ConnectionPool
- Connection pools cached in memory (max 10 per process)
- Control plane connection separate from tenant connections
shared-events:
- ServiceBusPublisher: publish(topic, eventType, payload, tenantId)
- ServiceBusSubscriber: subscribe(topic, handler, options)
- All events wrapped in envelope: { eventId, eventType, tenantId, timestamp, version, payload }
- Dead-letter handling + retry policy configuration
shared-types --- define TypeScript interfaces for:
Member, MemberStatus, Tier, Transaction, TransactionChannel,
PointsLedgerEntry, LedgerReason, Offer, OfferType, Redemption,
Tenant, TenantConfig, WebhookConfig, PaginatedResult\<T\>
Each service scaffold should be a minimal Express app that:
- Imports shared packages
- Has health endpoint GET /health returning { status: 'ok', service, version }
- Dockerfile (node:20-alpine, non-root user, health check)
- package.json with start, dev, build, test scripts
Produce complete, working TypeScript code. Include unit tests for all shared packages.

**⚠ NOTES FOR THIS TASK**
This task produces the foundation every other service task depends on. Take time to get shared-types right --- changes here cascade everywhere.

  ---------- -------------------------------------------------- ---------- -------------
  **T-03**   **Control Plane Database & Tenant Provisioning**   **Data**   **Phase 1**

  ---------- -------------------------------------------------- ---------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-01, T-02                        | Control plane schema migrations, tenant provisioning pipeline script, Flyway config

**CONTEXT**
The control plane is a single Azure SQL database that stores the tenant registry. It is separate from all tenant data databases. The provisioning pipeline creates a new tenant DB on demand.

**▶ CLAUDE PROMPT**
Implement the control plane database schema and automated tenant provisioning pipeline for a multi-tenant loyalty platform.
CONTROL PLANE DATABASE (single Azure SQL DB --- loyalty-control-plane):
Schema (Flyway migrations in /infra/control-plane/migrations/):
V1\_\_create_tenants.sql:
CREATE TABLE tenants (
tenant_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
name NVARCHAR(200) NOT NULL,
slug NVARCHAR(100) NOT NULL UNIQUE, -- used in API key prefixes
status NVARCHAR(20) NOT NULL DEFAULT 'active', -- active\|suspended\|deprovisioned
db_secret_name NVARCHAR(200) NOT NULL, -- Key Vault secret name for this tenant's DB conn string
config_json NVARCHAR(MAX), -- JSON: base earn rate, expiry days, tier mode, etc.
feature_flags NVARCHAR(MAX), -- JSON: { pointsTransfer: false, coalition: false, ... }
created_at DATETIME2 DEFAULT SYSUTCDATETIME(),
updated_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
V2\_\_create_api_credentials.sql:
CREATE TABLE api_credentials (
credential_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(tenant_id),
key_hash NVARCHAR(64) NOT NULL, -- SHA-256 hash of API key
key_prefix NVARCHAR(12) NOT NULL, -- first 8 chars for display (e.g. lp_sk_abc1)
label NVARCHAR(100),
scope NVARCHAR(20) DEFAULT 'read_write', -- read_only\|read_write
last_used_at DATETIME2,
expires_at DATETIME2,
is_active BIT DEFAULT 1,
created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_credentials_keyhash ON api_credentials(key_hash) WHERE is_active = 1;
V3\_\_create_webhook_configs.sql:
CREATE TABLE webhook_configs (
hook_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
tenant_id UNIQUEIDENTIFIER NOT NULL REFERENCES tenants(tenant_id),
event_type NVARCHAR(100) NOT NULL,
target_url NVARCHAR(500) NOT NULL,
secret_hash NVARCHAR(64) NOT NULL, -- for HMAC-SHA256 signing
is_active BIT DEFAULT 1,
retry_count INT DEFAULT 5,
created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
TENANT DATABASE TEMPLATE (applied to each new tenant DB):
Implement Flyway migration set in /services/tenant-migrations/:
V1\_\_members.sql --- members table (see shared-types Member interface)
V2\_\_tiers.sql --- tiers table with default Bronze/Silver/Gold seed data
V3\_\_transactions.sql --- transactions table (append-only, no deletes)
V4\_\_points_ledger.sql --- points_ledger table (immutable double-entry)
V5\_\_offers.sql --- offers table
V6\_\_redemptions.sql --- redemptions table
V7\_\_audit_log.sql --- audit_log table (actor, action, entity_type, entity_id, diff_json, timestamp)
All tables: include created_at, updated_at, is_deleted BIT DEFAULT 0, deleted_at.
Add appropriate indexes for: member lookups (email, phone), ledger queries (member_id + timestamp), active offer queries.
TENANT PROVISIONING PIPELINE (/scripts/provision-tenant.ts):
A CLI script that accepts: --name, --slug, --adminEmail, --environment
Steps:
1. Validate slug uniqueness in control plane
2. Create Azure SQL database (named loyalty-{slug}-{env}) using Azure SDK
3. Run Flyway tenant migrations against new DB
4. Store connection string in Key Vault as secret: loyalty-tenant-{slug}-{env}
5. Insert tenant record in control plane DB
6. Generate initial API key (prefix lp_sk\_, store hash + prefix in api_credentials)
7. Output: tenantId, apiKey (shown once), Key Vault secret name
8. Log all steps with timestamps
Include rollback logic: if any step fails, clean up previously created resources.
Target total provisioning time: \< 5 minutes.
Include unit tests for each step using mocked Azure SDK clients.

**⚠ NOTES FOR THIS TASK**
The provisioning script is used both for new tenant onboarding and automated test environment setup. Make it idempotent --- re-running with the same slug should detect existing tenant and exit gracefully.

  ---------- ----------------------------------------------------- ------------- -------------
  **T-04**   **Member Service --- Enrollment, Profile & Lookup**   **Members**   **Phase 1**

  ---------- ----------------------------------------------------- ------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-02, T-03                        | Member Service Express app with full CRUD, PII encryption, duplicate detection, GDPR delete, unit + integration tests

**CONTEXT**
The Member Service owns all member identity data. It is the authoritative source for member profiles. The POS lookup endpoint is the most latency-sensitive in the platform --- target p99 \< 100ms.

**▶ CLAUDE PROMPT**
Implement the Member Service for a multi-tenant retail loyalty platform.
Tech stack: Node.js 20, TypeScript, Express, mssql, ioredis, Azure Key Vault SDK.
Import from monorepo: \@loyalty/shared-logger, \@loyalty/shared-errors, \@loyalty/shared-middleware, \@loyalty/shared-db-client, \@loyalty/shared-events, \@loyalty/shared-types.
SERVICE: /services/member-service (port 3001)
ENDPOINTS:
POST /v1/members
Body: { email?, phone, firstName, lastName, birthDate?, channel: 'pos'\|'web'\|'mobile' }
- phone is required; email optional
- Normalize phone to E.164 format
- Encrypt email and phone at rest using AES-256-GCM, key from Azure Key Vault
- Duplicate check: query by phone_hash (SHA-256 of normalized phone) --- return 409 ConflictError with existing memberId if duplicate
- Insert member record with status='active', tier defaults to first configured tier
- Publish member.enrolled event to Service Bus
- Return: MemberResponse (id, firstName, lastName, tier, pointsBalance: 0, createdAt)
GET /v1/members/:memberId
- Return full member profile (no raw PII in response --- mask email, mask phone last 4 visible)
- Include: tier object, pointsBalance (from Redis cache, fallback to ledger sum), enrolledAt, channel
- Cache response in Redis with key member:{tenantId}:{memberId} TTL 300s
GET /v1/members?phone=:phone
- POS lookup endpoint --- OPTIMIZE FOR LATENCY
- Normalize phone to E.164, compute SHA-256 hash, query index
- Return same as GET /v1/members/:memberId
- Add Redis cache on phone_hash key TTL 60s
- Log lookup latency; alert if \> 150ms
PATCH /v1/members/:memberId
- Updateable fields: firstName, lastName, email, birthDate, communicationPreferences
- Phone NOT updatable via this endpoint (requires verification flow)
- Re-encrypt updated PII fields
- Invalidate Redis cache on update
- Write audit log entry
DELETE /v1/members/:memberId (GDPR)
- Soft-delete immediately: is_deleted=1, deleted_at=NOW(), status='pending_scrub'
- Publish member.deleted event
- Async scrub worker (same service, background job): replace PII fields with anonymized tokens after 30 days
- Return 204
GET /v1/members/:memberId/summary
- Lightweight endpoint for POS display: { memberId, firstName, tier, pointsBalance, eligibleOfferCount }
- Served entirely from Redis where possible
DATA MODEL additions to member table:
phone_hash NVARCHAR(64) NOT NULL (indexed, used for lookup)
email_encrypted NVARCHAR(500)
phone_encrypted NVARCHAR(500)
communication_prefs NVARCHAR(MAX) (JSON)
PII ENCRYPTION:
Use a per-tenant encryption key stored in Key Vault (secret: loyalty-tenant-{slug}-pii-key)
AES-256-GCM with random IV per field; store as base64(iv):base64(ciphertext)
Provide encryptPII(value, key) and decryptPII(value, key) utility functions
ERROR HANDLING:
- Invalid phone format → ValidationError with field-level message
- Duplicate member → ConflictError with existing memberId
- Tenant not found → TenantNotFoundError
- Member not found → NotFoundError
TESTS:
- Unit tests for phone normalization, PII encrypt/decrypt, duplicate detection logic
- Integration tests using testcontainers (SQL Server + Redis) for all endpoints
- Load test scaffold: k6 script targeting GET /v1/members?phone= at 500 RPS, assert p99 \< 100ms

**⚠ NOTES FOR THIS TASK**
The phone_hash index is critical for POS performance. Verify the index is covering. PII key rotation is a Phase 2 feature --- design the encrypt/decrypt layer to support key versioning even if not implemented now.

  ---------- -------------------------------------------------------- ------------ -------------
  **T-05**   **Loyalty Engine --- Transaction Processing & Ledger**   **Points**   **Phase 1**

  ---------- -------------------------------------------------------- ------------ -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-02, T-03, T-04                  | Loyalty Engine service, points calculation logic, immutable ledger, transaction void, idempotency, full test suite

**CONTEXT**
The Loyalty Engine is the heart of the platform. Every purchase flows through it. The points ledger must be immutable and consistent. The transaction + ledger write must be a single atomic DB transaction.

**▶ CLAUDE PROMPT**
Implement the Loyalty Engine service for a multi-tenant retail loyalty platform.
Tech stack: Node.js 20, TypeScript, Express, mssql, ioredis, Azure Service Bus.
Import from monorepo shared packages.
SERVICE: /services/loyalty-engine (port 3002)
ENDPOINTS:
POST /v1/transactions
Headers: Idempotency-Key (required)
Body: {
memberId, channel: 'pos'\|'web'\|'mobile',
amount: number (in cents),
items?: [{ sku, categoryCode, quantity, unitPrice }],
locationId?,
terminalId?,
externalRef? (POS receipt number)
occurredAt? (ISO datetime --- for offline/queued transactions)
}
Processing:
1. Check idempotency: if Idempotency-Key seen in last 24h (Redis), return cached response
2. Validate memberId exists and is active (call Member Service or shared DB read)
3. Load tenant loyalty config (earn rate, multipliers, active promos) from Redis cache
4. Calculate points:
- base = floor(amount_in_dollars * base_earn_rate)
- Apply category multipliers: for each item, if categoryCode has multiplier, apply to item subtotal
- Apply active promotion multipliers (time-bounded, tier-restricted)
- Cap total multiplier at tenant config max_multiplier (default 5x)
5. BEGIN SQL TRANSACTION:
a. INSERT transactions row
b. INSERT points_ledger row (delta = +points, reason='purchase', ref_txn_id)
c. UPDATE member points_balance_cache in Redis (INCRBY --- atomic)
d. COMMIT
6. Publish points.earned event to Service Bus
7. Store idempotency response in Redis (TTL 86400)
8. Return: { transactionId, pointsEarned, newBalance, tier, appliedMultipliers[] }
POST /v1/transactions/:transactionId/void
Body: { reason: string }
- Verify transaction exists and belongs to tenant
- Check void window (configurable, default 90 days)
- BEGIN SQL TRANSACTION:
a. UPDATE transactions SET status='voided'
b. INSERT points_ledger row (delta = -pointsEarned, reason='void', ref_txn_id)
c. Verify new balance \>= 0; if not, flag for manual review instead of blocking
d. Update Redis balance cache (DECRBY)
e. COMMIT
- Publish transaction.voided event
- Return: { transactionId, pointsReversed, newBalance }
GET /v1/members/:memberId/ledger
Query: ?limit=50&after=ledgerEntryId&dateFrom=&dateTo=
- Return paginated ledger entries (cursor-based, ordered by created_at DESC)
- Each entry: ledgerId, delta, balanceAfter, reasonCode, refTransactionId, description, createdAt
- Never allow cross-tenant ledger access
GET /v1/members/:memberId/balance
- Return current points balance
- Try Redis first (key: balance:{tenantId}:{memberId})
- On cache miss: SELECT SUM(delta) FROM points_ledger WHERE member_id = ? and recompute cache
- Return: { memberId, balance, asOf: timestamp }
POINTS CALCULATION ENGINE (src/points-calculator.ts):
Class PointsCalculator
- constructor(tenantConfig: TenantLoyaltyConfig)
- calculate(transaction: TransactionInput): CalculationResult
- CalculationResult: { basePoints, bonusPoints, totalPoints, appliedRules: AppliedRule[] }
- AppliedRule: { ruleType, description, multiplier, pointsAdded }
- Fully unit testable with no DB or network dependencies
IDEMPOTENCY:
Redis key: idempotency:{tenantId}:{idempotencyKey}
TTL: 86400 seconds
Store: { transactionId, response } as JSON
On duplicate: return 200 with original response + header Idempotent-Replay: true
TESTS:
- Unit tests for PointsCalculator covering: base earn, category multiplier, promo multiplier, multiplier cap, zero-amount transactions, fractional rounding
- Integration tests: transaction submit flow, void flow, ledger pagination, balance cache miss recovery
- Concurrency test: 10 simultaneous transactions for same member --- verify ledger integrity and correct final balance

**⚠ NOTES FOR THIS TASK**
The atomic transaction + ledger write in step 5 is non-negotiable. Never write ledger entries outside a DB transaction. The balance Redis cache is eventually consistent by design --- the ledger is always the source of truth.

  ---------- -------------------------------------------------- ----------- -------------
  **T-06**   **Tier Evaluation Worker**                         **Tiers**   **Phase 1**

  ---------- -------------------------------------------------- ----------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-05                              | Tier Eval Worker Container App, tier promotion/demotion logic, tier.upgraded/downgraded events, tests

**CONTEXT**
The Tier Eval Worker runs as an Azure Container App. It subscribes to the points.earned topic and asynchronously determines whether a member should be promoted or demoted. It must be idempotent.

**▶ CLAUDE PROMPT**
Implement the Tier Evaluation Worker for a multi-tenant loyalty platform.
Tech stack: Node.js 20, TypeScript, Azure Container Apps (long-running process, not HTTP server).
Import from monorepo shared packages.
SERVICE: /services/tier-eval-worker (Azure Container App --- no HTTP port, Service Bus triggered)
WORKER DESIGN:
- Subscribes to Service Bus topic: points.earned
- Also runs a nightly scheduled job for demotion evaluation (Azure Container App scheduled job trigger)
- Must be idempotent: processing the same event twice must not double-promote
TIER DATA MODEL:
Each tenant configures tiers in the tiers table (seeded with defaults):
{ tierId, name, minRollingPoints, retentionPoints, multiplierBonus, benefitsJson, sortOrder }
Default seed: Bronze (0), Silver (500), Gold (2000), Platinum (5000)
PROMOTION EVALUATION (triggered by points.earned event):
1. Load tenant tier configuration (cached in Redis TTL 600s)
2. Load member's current tier and rolling 12-month points:
SELECT SUM(delta) FROM points_ledger
WHERE member_id = ? AND created_at \>= DATEADD(year,-1,GETUTCDATE()) AND delta \> 0
3. Find highest tier where rolling_points \>= tier.minRollingPoints
4. If target tier != current tier AND target tier is higher:
a. BEGIN TRANSACTION
b. UPDATE member SET tier_id = newTierId, tier_updated_at = NOW()
c. INSERT audit_log entry
d. COMMIT
e. Publish tier.upgraded event: { memberId, previousTier, newTier, rollingPoints }
5. If already at correct tier: no-op, log and ack message
DEMOTION EVALUATION (nightly scheduled, 2:00 AM UTC):
- Load all members whose tier was last evaluated \> 365 days ago (configurable)
- For each member, calculate rolling 12-month points
- If rolling_points \< tier.retentionPoints:
a. Find correct tier based on rolling points
b. Demote member, publish tier.downgraded event
c. Log demotion with reason: 'annual_review'
- Batch in groups of 100; add 50ms delay between batches to avoid DB overload
IDEMPOTENCY:
- Redis key: tier-eval:{tenantId}:{memberId}:{eventId} TTL 3600
- If key exists, skip processing and ack message
- Set key before processing, delete on failure (at-least-once with dedup)
CONCURRENCY:
- Multiple worker instances may run simultaneously
- Use SQL optimistic concurrency: UPDATE members SET tier_id=? WHERE member_id=? AND tier_id=?
- If 0 rows affected, reload and re-evaluate (another worker processed first)
ERROR HANDLING:
- Transient DB errors: exponential backoff, max 3 retries, then dead-letter
- Member not found: log warning, ack (member may have been deleted)
- Tenant config not found: dead-letter with reason
TESTS:
- Unit tests: tier selection logic for various point balances and tier configs
- Integration tests: promotion from Bronze to Silver, skip-tier promotion (Bronze to Gold), no-op when already at correct tier
- Demotion test: member drops below retention threshold
- Idempotency test: same event processed twice produces one tier change

**⚠ NOTES FOR THIS TASK**
The nightly demotion job should have a dry-run mode (--dry-run flag) that logs what would change without making DB writes. Use this in staging before enabling in prod.

  ---------- -------------------------------------------------- --------- -------------
  **T-07**   **Azure API Management Configuration**             **API**   **Phase 1**

  ---------- -------------------------------------------------- --------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-01, T-04, T-05                  | APIM policy XMLs, OpenAPI 3.0 specs for all services, tenant routing policy, rate limit policy, APIM Terraform/Bicep config

**CONTEXT**
APIM is the single entry point for all external traffic. It handles tenant routing, JWT validation, rate limiting, and request logging. All services are internal and not directly accessible.

**▶ CLAUDE PROMPT**
Configure Azure API Management (APIM) as the API gateway for a multi-tenant loyalty platform.
Produce all APIM configuration as code (Bicep or Terraform) plus policy XML files.
OUTPUT STRUCTURE:
/infra/apim/
apis/
member-service.json (OpenAPI 3.0 spec)
loyalty-engine.json (OpenAPI 3.0 spec)
admin-api.json (OpenAPI 3.0 spec)
policies/
global-inbound.xml (applies to all APIs)
tenant-resolution.xml (fragment)
rate-limiting.xml (fragment)
jwt-validation.xml (fragment)
cors.xml (fragment)
logging.xml (fragment)
member-service-policy.xml
loyalty-engine-policy.xml
named-values.bicep (APIM named values for Key Vault refs)
apim-apis.bicep (API + operation definitions)
GLOBAL INBOUND POLICY (global-inbound.xml):
1. CORS: allow configured origins, methods GET/POST/PATCH/DELETE, headers Authorization/Content-Type/Idempotency-Key/X-Correlation-ID
2. Generate X-Correlation-ID if not present; set on request and response
3. JWT Validation:
- Validate Bearer token against Azure AD B2C JWKS endpoint
- Extract claim: extension_TenantId → set context variable tenant-id
- Extract claim: sub → set context variable user-id
- Extract claim: roles → set context variable user-roles
- On validation failure: return 401 with RFC 7807 body
4. Tenant Resolution:
- Look up tenant in APIM cache (TTL 300s) by tenant-id claim
- If not found: call internal tenant lookup backend, cache result
- If tenant status != 'active': return 403 with reason
- Set backend-url based on resolved service URL
5. Rate Limiting:
- Per-tenant: 1000 calls/minute (configurable via APIM named value per tenant)
- On exceed: return 429 with Retry-After header
- Rate limit counter key: tenant-{tenant-id}
6. Request logging: log method, path, tenant-id, correlation-id, user-id to App Insights
7. Add header X-Tenant-ID to all downstream requests
OUTBOUND POLICY:
- Add X-Correlation-ID to all responses
- Remove internal headers (X-Powered-By, Server, X-AspNet-Version)
- Log response status, duration to App Insights
OPENAPI SPECS:
Write complete OpenAPI 3.0 specs for:
- Member Service: all endpoints from T-04 with request/response schemas
- Loyalty Engine: all endpoints from T-05 with request/response schemas
Include: security schemes (BearerAuth), error response schemas (RFC 7807), examples for all operations.
NAMED VALUES:
- loyalty-jwt-issuer (from Key Vault ref)
- loyalty-jwt-audience (from Key Vault ref)
- loyalty-apim-logger-id (App Insights logger)
- loyalty-default-rate-limit (1000)
Also produce a Postman collection (loyalty-platform.postman_collection.json) with all endpoints, auth setup, and example requests for all operations.

**⚠ NOTES FOR THIS TASK**
The APIM JWT validation policy must reference the correct B2C tenant JWKS URL. Parameterize this as a named value --- it differs between dev and prod B2C tenants.

  ---------- --------------------------------------------------- ---------- -------------
  **T-08**   **Authentication --- Azure AD B2C Configuration**   **Auth**   **Phase 1**

  ---------- --------------------------------------------------- ---------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-01                              | B2C tenant config, custom policies, app registrations, token claims config, auth SDK wrapper

**CONTEXT**
Two auth flows: (1) Client Credentials for B2B (POS, e-commerce server-side), (2) PKCE for consumer mobile app. B2C tenant configuration managed as code using Microsoft Graph API or B2C Terraform provider.

**▶ CLAUDE PROMPT**
Configure Azure AD B2C authentication for a multi-tenant retail loyalty platform and implement auth utilities.
TWO AUTHENTICATION FLOWS:
1. B2B CLIENT CREDENTIALS (POS terminals, e-commerce server-side):
- App registration: loyalty-platform-b2b-{env}
- Grant type: OAuth 2.0 client_credentials
- Custom claim: extension_TenantId (string) --- set per API credential
- Custom claim: extension_Scope (read_only \| read_write)
- Token endpoint: POST /oauth2/v2.0/token
- Token lifetime: 3600s (1 hour)
- No refresh token (stateless server-side grant)
2. CONSUMER PKCE (mobile app):
- App registration: loyalty-platform-consumer-{env}
- Grant type: Authorization Code + PKCE
- Custom claim: extension_TenantId
- Custom claim: extension_MemberId
- Custom claim: roles: ['member']
- Token lifetime: 3600s access token, 30d refresh token
- Redirect URIs: loyalty://callback (mobile), https://localhost:3000/callback (dev)
B2C CUSTOM POLICIES (XML):
Implement TrustFrameworkBase.xml and SignUpSignIn.xml custom policy with:
- Sign up: collect email + phone, validate uniqueness via REST API call to Member Service enrollment check endpoint
- Sign in: email/password OR phone + OTP (SMS via Azure Communication Services)
- Password reset flow
- Custom claims: TenantId, MemberId populated via REST API call to member lookup
- Branded UI: custom HTML template (base only --- branding applied per-tenant in Phase 2)
APP REGISTRATION TERRAFORM:
/infra/b2c/
b2c-apps.tf --- both app registrations
b2c-custom-policies/
TrustFrameworkBase.xml
TrustFrameworkExtensions.xml
SignUpOrSignin.xml
PasswordReset.xml
AUTH SDK WRAPPER (/packages/shared-auth/):
Implement TypeScript module:
- verifyB2BToken(token: string, jwksUri: string): Promise\<B2BClaims\>
- verifyConsumerToken(token: string, jwksUri: string): Promise\<ConsumerClaims\>
- generateApiKey(): { key: string, prefix: string, hash: string }
(format: lp_sk\_ + 32 random chars; hash = SHA-256 for storage)
- validateApiKey(providedKey: string, storedHash: string): boolean
- B2BClaims: { tenantId, scope, sub, iat, exp }
- ConsumerClaims: { tenantId, memberId, roles, sub, iat, exp }
Include unit tests for all auth utilities.
Include a local development auth bypass mode (env var SKIP_AUTH=true) that accepts a mock JWT for testing without B2C.

**⚠ NOTES FOR THIS TASK**
B2C custom policy development is complex. The REST API calls within custom policies (for member lookup during sign-in) must be available before the policy can be tested. Implement a stub endpoint in Member Service first.

  ---------- -------------------------------------------------- -------------- -------------
  **T-09**   **Webhook Delivery Service**                       **Webhooks**   **Phase 1**

  ---------- -------------------------------------------------- -------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-02, T-03                        | Webhook delivery worker, HMAC signing, retry with exponential backoff, DLQ handler, delivery log, tests

**CONTEXT**
Webhook delivery runs as a background worker. It subscribes to all Service Bus topics and fans out to registered merchant webhook endpoints. HMAC signing and retry logic are critical for reliability.

**▶ CLAUDE PROMPT**
Implement the webhook delivery service for a multi-tenant loyalty platform.
Tech stack: Node.js 20, TypeScript, Azure Container Apps.
Import from monorepo shared packages.
SERVICE: /services/webhook-worker (Azure Container App --- Service Bus triggered)
DESIGN:
The webhook worker subscribes to ALL Service Bus topics. For each event received, it:
1. Looks up webhook registrations for that tenant + event type from DB (cached in Redis TTL 120s)
2. For each registered webhook endpoint, delivers the event via HTTP POST
3. Records delivery attempt result in webhook_deliveries table
4. On failure, schedules retry with exponential backoff
WEBHOOK DELIVERY TABLE (add to tenant migrations):
CREATE TABLE webhook_deliveries (
delivery_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
hook_id UNIQUEIDENTIFIER NOT NULL,
event_id NVARCHAR(100) NOT NULL,
event_type NVARCHAR(100) NOT NULL,
payload NVARCHAR(MAX) NOT NULL,
attempt_number INT NOT NULL DEFAULT 1,
status NVARCHAR(20) NOT NULL, -- pending\|success\|failed\|dead_lettered
response_status INT,
response_body NVARCHAR(MAX),
delivered_at DATETIME2,
next_retry_at DATETIME2,
created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
CREATE INDEX ix_wh_deliveries_status ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending','failed');
DELIVERY LOGIC:
1. Retrieve hook config: target_url, secret_hash
2. Build payload envelope:
{
eventId, eventType, tenantId, timestamp,
payload: \<event payload\>,
deliveryId
}
3. Sign with HMAC-SHA256:
signature = HMAC-SHA256(secret, JSON.stringify(envelope))
Add header: X-Loyalty-Signature: sha256={hex signature}
Add header: X-Loyalty-Event: {eventType}
Add header: X-Delivery-ID: {deliveryId}
4. POST to target_url with 10s timeout
5. Success: HTTP 2xx → mark delivered, log response
6. Failure: non-2xx or timeout → schedule retry
RETRY SCHEDULE (exponential backoff):
Attempt 1: immediate
Attempt 2: +30 seconds
Attempt 3: +2 minutes
Attempt 4: +10 minutes
Attempt 5: +1 hour
Attempt 6: Dead-letter --- update status='dead_lettered', notify merchant via email
RETRY WORKER:
Runs every 30 seconds, queries webhook_deliveries WHERE status='failed' AND next_retry_at \<= NOW()
Processes in batches of 50
DEAD-LETTER DASHBOARD API:
GET /internal/webhooks/dead-letters?tenantId= --- list dead-lettered deliveries
POST /internal/webhooks/dead-letters/:deliveryId/replay --- retry a dead-lettered delivery
(These endpoints protected by internal service auth, not exposed via APIM)
WEBHOOK REGISTRATION API (add to admin-api service in T-12):
POST /v1/webhooks --- { eventType, targetUrl, secret }
GET /v1/webhooks --- list registered hooks for tenant
DELETE /v1/webhooks/:hookId
POST /v1/webhooks/:hookId/test --- send a sample event payload to verify endpoint
TESTS:
- Unit: HMAC signing, retry schedule calculation
- Integration: successful delivery, failed delivery + retry scheduling, dead-letter after max attempts
- Test receiver: a simple Express server that logs incoming webhooks (for integration tests)

**⚠ NOTES FOR THIS TASK**
The secret stored in webhook_configs is the raw secret provided by the merchant. Store only the SHA-256 hash in DB; the raw secret is shown to the merchant once at registration time and never stored in plaintext.

  ---------- ---------------------------------------------------- ----------- -------------
  **T-10**   **Notification Service --- Email & Transactional**   **Notif**   **Phase 1**

  ---------- ---------------------------------------------------- ----------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-02, T-03                        | Notification Service, email dispatch via Azure Comm Services, template engine, event subscriptions, tests

**CONTEXT**
Phase 1 scope is email only (SMS and push in Phase 2). The notification service subscribes to domain events and dispatches templated emails via Azure Communication Services. Templates are tenant-brandable.

**▶ CLAUDE PROMPT**
Implement the Notification Service (Phase 1: email only) for a multi-tenant loyalty platform.
Tech stack: Node.js 20, TypeScript, Azure Container Apps, Azure Communication Services (Email).
Import from monorepo shared packages.
SERVICE: /services/notification-service (Azure Container App --- Service Bus triggered)
SUBSCRIPTIONS:
Subscribe to Service Bus topics:
- member.enrolled → send welcome email
- points.earned → queue for weekly digest (do NOT send per-transaction --- too noisy)
- tier.upgraded → send tier upgrade email immediately
- tier.downgraded → send tier downgrade email immediately
- member.deleted → send deletion confirmation email
EMAIL TEMPLATES (use Handlebars):
Templates stored in /services/notification-service/templates/
Each template has subject.hbs and body.hbs (HTML).
welcome.hbs variables: firstName, tierName, programName, enrollmentBonus (if any)
tier-upgraded.hbs variables: firstName, previousTier, newTier, newBenefits[], pointsBalance
tier-downgraded.hbs variables: firstName, previousTier, newTier, retentionTips, renewalDate
account-deleted.hbs variables: firstName, deletionDate, dataRetentionNote
weekly-digest.hbs variables: firstName, weekTransactionCount, pointsEarnedThisWeek, currentBalance, tierProgress (%), nextTierName, nextTierPointsNeeded
TENANT BRANDING:
Each template is rendered with tenant brand variables:
{ programName, primaryColor, logoUrl, senderName, senderEmail, supportEmail, websiteUrl }
These come from tenant config_json in the control plane.
Default brand values used if tenant has not configured branding.
WEEKLY DIGEST JOB:
Runs every Monday at 8:00 AM tenant local time (use tenant timezone from config)
For each tenant: query all active members who transacted in the past 7 days
Batch send digest emails using Azure Communication Services batch API
Skip members who have opted out of digest emails
AZURE COMMUNICATION SERVICES INTEGRATION:
Use \@azure/communication-email SDK
Sender domain must be verified (configured in T-01 infra)
Handle send errors: log, retry once, then log to notification_failures table
NOTIFICATION PREFERENCES:
Add to member profile: communicationPreferences JSON
{ emailOptOut: false, digestOptOut: false, tierAlertsOptOut: false }
Check preferences before sending any email
NOTIFICATION LOG TABLE (add to tenant migrations):
CREATE TABLE notification_log (
log_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
member_id UNIQUEIDENTIFIER NOT NULL,
template_name NVARCHAR(100) NOT NULL,
channel NVARCHAR(20) NOT NULL, -- email\|sms\|push
status NVARCHAR(20) NOT NULL, -- sent\|failed\|skipped
provider_ref NVARCHAR(200), -- Azure Communication Services message ID
sent_at DATETIME2,
created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
TESTS:
- Unit: template rendering with brand variables, opt-out check logic
- Integration: mock Azure Communication Services client, verify correct template sent per event
- Weekly digest test: verify correct members selected, correct data populated

**⚠ NOTES FOR THIS TASK**
Do not send a points.earned email per transaction --- this will annoy members and cause unsubscribes. The weekly digest aggregates all weekly activity. Tier change and welcome emails are the high-value immediate sends.

  ---------- ------------------------------------------------------------ ----------- -------------
  **T-11**   **Admin API --- Program Config, Member Management & RBAC**   **Admin**   **Phase 1**

  ---------- ------------------------------------------------------------ ----------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-02, T-03, T-04                  | Admin API service, loyalty program config endpoints, member management endpoints, RBAC middleware, audit logging

**CONTEXT**
The Admin API serves the merchant dashboard. It has broader data access than the consumer-facing APIs. RBAC enforced at the service layer. All write operations append to the audit log.

**▶ CLAUDE PROMPT**
Implement the Admin API service for a multi-tenant retail loyalty platform.
Tech stack: Node.js 20, TypeScript, Express.
Import from monorepo shared packages.
SERVICE: /services/admin-api (port 3005)
Auth: B2B JWT with role claim checked; roles: owner \| manager \| analyst
RBAC MIDDLEWARE:
requireRole(...roles: AdminRole[]) --- Express middleware
owner: all operations
manager: member management + offer management (no billing, no API keys)
analyst: GET only (no writes)
ENDPOINTS:
PROGRAM CONFIGURATION (owner only):
GET /v1/admin/program --- get current loyalty program config
PUT /v1/admin/program --- update program config
Program config schema: {
programName, baseEarnRate (points per dollar),
maxMultiplier, pointsExpiryDays,
tiers: [{ name, minRollingPoints, retentionPoints, multiplierBonus, benefits: {} }],
timezone, defaultBrandConfig: { primaryColor, logoUrl, senderName, ... }
}
On update: version config (store previous version in program_config_history table), publish config.updated event, invalidate Redis cache
TIER MANAGEMENT (owner):
GET /v1/admin/tiers --- list tiers for tenant
POST /v1/admin/tiers --- create tier
PUT /v1/admin/tiers/:tierId --- update tier
DELETE /v1/admin/tiers/:tierId --- delete tier (only if no members currently at this tier)
MEMBER MANAGEMENT (owner, manager):
GET /v1/admin/members --- search members (name/email/phone/memberId/tier)
GET /v1/admin/members/:memberId --- member detail with full history
PATCH /v1/admin/members/:memberId/status --- activate\|suspend\|close (with reason)
POST /v1/admin/members/:memberId/points --- manual points adjustment (delta, reasonCode, notes)
PATCH /v1/admin/members/:memberId/tier --- tier override (tierId, reason, notes)
GET /v1/admin/members/export --- CSV export of filtered member list (async, returns download link)
API KEY MANAGEMENT (owner):
GET /v1/admin/api-keys --- list keys (prefix + metadata only, never full key)
POST /v1/admin/api-keys --- generate new key (returns full key once)
PATCH /v1/admin/api-keys/:id --- update label, scope, expiry
DELETE /v1/admin/api-keys/:id --- revoke key
WEBHOOK MANAGEMENT (owner, manager):
GET /v1/admin/webhooks --- list webhook configs
POST /v1/admin/webhooks --- register webhook (returns secret once)
DELETE /v1/admin/webhooks/:hookId --- deactivate webhook
POST /v1/admin/webhooks/:hookId/test --- send test delivery
AUDIT LOG:
GET /v1/admin/audit-log (analyst, manager, owner)
Query: ?entityType=&entityId=&actorId=&dateFrom=&dateTo=&limit=50&after=cursor
Returns: paginated audit entries with full diff_json
AUDIT MIDDLEWARE:
auditLog(entityType: string) --- Express middleware that:
- Captures req body (before state) and response (after state)
- On success: writes to audit_log table
- Fields: tenantId, actorId, actorRole, action (HTTP method + path), entityType, entityId, diffJson, ipAddress, correlationId, timestamp
TESTS:
- RBAC tests: analyst cannot POST, manager cannot manage API keys, owner can do everything
- Member search: filter by each field type, pagination
- Manual points adjustment: verify ledger entry created, Redis cache updated, audit log written
- API key generation: verify only prefix returned on list, full key returned on create only

**⚠ NOTES FOR THIS TASK**
The member CSV export for large tenants can be slow. Implement as an async operation: POST returns a jobId, GET /export/:jobId returns status + download URL once complete. Use Azure Blob Storage for the generated CSV.

  ---------- -------------------------------------------------- ------------ -------------
  **T-12**   **CI/CD Pipeline & Deployment**                    **DevOps**   **Phase 1**

  ---------- -------------------------------------------------- ------------ -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-01, T-02                        | GitHub Actions workflows for all services, Dockerfiles, slot swap scripts, migration pipeline, environment promotion process

**CONTEXT**
Every service needs a reliable automated deployment pipeline. Blue/green deployments via App Service slots. Database migrations run before app swap. Container Apps deployed via GitHub Actions.

**▶ CLAUDE PROMPT**
Implement the complete CI/CD pipeline for a multi-tenant loyalty platform using GitHub Actions.
PIPELINE REQUIREMENTS:
- Monorepo with pnpm workspaces --- only build/deploy changed services
- Environments: dev (auto-deploy on push to main), staging (manual trigger), prod (manual trigger with approval)
- Blue/green deployment for App Service (slot swap after health check)
- Container Apps deployment for workers
- Database migrations run before app deployment, auto-rollback if migration fails
- All secrets from GitHub Actions OIDC → Azure Key Vault (no stored secrets in GitHub)
OUTPUT STRUCTURE:
/.github/
workflows/
ci.yml --- PR checks: lint, test, build for changed services
deploy-dev.yml --- auto deploy to dev on push to main
deploy-staging.yml --- manual deploy to staging with environment protection
deploy-prod.yml --- manual deploy to prod with required reviewers
run-migrations.yml --- reusable workflow for Flyway migrations
actions/
detect-changes/action.yml --- composite action: detect which services changed
deploy-app-service/action.yml --- composite action: build image, push ACR, slot swap
deploy-container-app/action.yml --- composite action: build image, push ACR, update Container App
CI WORKFLOW (ci.yml):
Triggers: pull_request to main
Jobs:
1. detect-changes: output matrix of changed services
2. lint: pnpm lint for changed services
3. typecheck: pnpm tsc --noEmit for changed services
4. test: pnpm test for changed services (with SQL Server + Redis testcontainers)
5. build: docker build for changed services (cache layers)
6. security-scan: trivy scan Docker images for HIGH/CRITICAL CVEs
DEPLOY WORKFLOW (reusable steps):
1. Checkout code
2. OIDC auth to Azure (no stored credentials)
3. Detect changed services (skip unchanged)
4. For each changed service:
a. Build Docker image with tag: {service}:{sha}-{env}
b. Push to Azure Container Registry
c. Run Flyway migrations (via run-migrations.yml) against target env DB
- If migrations fail: abort deployment, post failure comment on PR/commit
d. Deploy to App Service staging slot (App Service) OR update Container App revision
e. Run smoke tests against staging slot
f. If smoke tests pass: swap slots (zero-downtime)
g. If smoke tests fail: delete staging slot, alert via Slack
DOCKERFILES (produce for each service):
- Base: node:20-alpine
- Non-root user: node (UID 1000)
- Multi-stage build: deps → build → runtime
- Health check: HEALTHCHECK CMD wget -qO- http://localhost:{port}/health \|\| exit 1
- Expose correct port per service
SMOKE TEST SCRIPT (/scripts/smoke-test.sh):
After slot swap, verify each service:
- GET /health returns 200
- GET /v1/members returns 200 or 401 (not 500)
- Database connectivity (via /health/detailed endpoint)
- Redis connectivity
ENVIRONMENT VARIABLES STRATEGY:
All env vars pulled from Azure App Configuration or Key Vault references at startup.
No secrets in Dockerfile or GitHub Actions env blocks.
Produce /services/shared-config/src/config.ts that:
- Reads from process.env
- Validates required vars at startup (fail fast)
- Exports typed config object used by all services

**⚠ NOTES FOR THIS TASK**
The OIDC federated credential setup for GitHub Actions → Azure requires creating a federated identity credential in the Azure AD app registration. Document this as a one-time setup step in the README.

**PHASE 2**
**Offers, Mobile & E-Commerce**
Consumer-facing expansion: 4 tasks covering offer engine, mobile API, e-commerce SDK, analytics
4 implementation tasks

  ---------- --------------------------------------------------------- ------------ -------------
  **T-13**   **Offer Service --- Catalog, Eligibility & Redemption**   **Offers**   **Phase 2**

  ---------- --------------------------------------------------------- ------------ -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-05, T-06, T-11                  | Offer Service with full CRUD, eligibility engine, redemption endpoint, offer targeting, tests

**CONTEXT**
The Offer Service manages the full offer lifecycle. Eligibility evaluation is called at checkout --- must be fast. Redemption is transactional and must prevent double-redemption.

**▶ CLAUDE PROMPT**
Implement the Offer Service for a multi-tenant retail loyalty platform.
Tech stack: Node.js 20, TypeScript, Express.
Import from monorepo shared packages.
SERVICE: /services/offer-service (port 3003)
OFFER TYPES (offerType enum):
percentage_discount --- X% off total or category
fixed_discount --- \$X off (requires minPurchaseAmount)
free_product --- free SKU (requires skuCode)
threshold_reward --- auto-issued when spend/points threshold met in period
bonus_points --- earn X extra points on qualifying purchase
OFFER DATA MODEL (add fields to offers table):
offer_id, tenant_id, type, name, description,
value (number --- percent or cents or points),
min_purchase_cents, applicable_skus (JSON array),
applicable_categories (JSON array),
points_cost (to redeem, nullable --- null means tier benefit, no cost),
max_redemptions_total, max_redemptions_per_member,
valid_from, valid_to,
targeting_rules (JSON --- { tiers[], minEnrollmentDays, lastPurchaseDayMax, customTags[] }),
status (draft\|active\|paused\|expired),
created_at, updated_at
ENDPOINTS:
GET /v1/offers
- List all active offers for tenant
- Filterable: ?type=&status=&validNow=true
- Cached in Redis TTL 120s
GET /v1/members/:memberId/offers
- Returns personalized eligible offers for this member RIGHT NOW
- EligibilityEngine.evaluate(member, offers[]) → EligibleOffer[]
- Exclude: already redeemed (if max_per_member=1), expired, wrong tier, targeting rules not met
- Cached per member TTL 60s (invalidate on redemption or tier change)
POST /v1/redemptions
Body: { memberId, offerId, transactionId?, channel }
1. Load offer --- verify active, not expired
2. Verify member eligibility (re-check, not from cache)
3. Check redemption count: SELECT COUNT(*) from redemptions WHERE member_id=? AND offer_id=?
4. If points_cost \> 0: verify member balance \>= points_cost
5. BEGIN TRANSACTION:
a. INSERT redemption record
b. If points_cost \> 0: INSERT ledger entry (delta = -points_cost, reason='redemption')
c. UPDATE Redis balance cache
d. COMMIT
6. Publish points.redeemed event
7. Return: { redemptionId, discountType, discountValue, promoCode (if applicable), newBalance }
ELIGIBILITY ENGINE (src/eligibility-engine.ts):
Class EligibilityEngine
- evaluate(member: Member, offer: Offer, context: EvaluationContext): EligibilityResult
- EvaluationContext: { currentDateTime, memberRollingPoints, memberRedemptionHistory }
- Checks in order: active status, valid date range, tier match, min enrollment days, last purchase recency, max redemptions global, max redemptions per member, sufficient points balance
- Returns: { eligible: boolean, reason?: string }
- Fully unit testable, no DB/network dependencies
THRESHOLD REWARD AUTO-ISSUANCE:
Background worker (runs every hour) checks:
SELECT members who crossed a spend/points threshold in current period but haven't received the threshold reward
Issues reward by creating a redemption record with auto_issued=true
Publishes points.earned event for bonus points rewards
ADMIN OFFER MANAGEMENT (add to admin-api T-11):
POST /v1/admin/offers --- create offer (status=draft)
GET /v1/admin/offers/:id --- get offer with performance stats
PATCH /v1/admin/offers/:id --- update offer (if not yet active)
POST /v1/admin/offers/:id/activate --- activate draft offer
POST /v1/admin/offers/:id/pause --- pause active offer
GET /v1/admin/offers/:id/stats --- { impressions, redemptions, redemptionRate, totalDiscount }
TESTS:
- Unit: EligibilityEngine for each rule type, combination rules
- Unit: All offer types correctly calculated (percent, fixed, free product)
- Integration: full redemption flow with points deduction
- Integration: double-redemption prevention (concurrent requests for same member+offer)
- Integration: threshold reward auto-issuance

**⚠ NOTES FOR THIS TASK**
The double-redemption prevention in step 3+4+5 requires careful handling of the race condition. Use a SQL unique constraint on (member_id, offer_id) WHERE max_redemptions_per_member = 1, and handle the constraint violation as a 409 ConflictError.

  ---------- ---------------------------------------------------------- ------------- -------------
  **T-14**   **E-Commerce Integration --- REST API & JavaScript SDK**   **Channel**   **Phase 2**

  ---------- ---------------------------------------------------------- ------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-04, T-05, T-13                  | E-commerce integration guide, JavaScript SDK (npm package), Shopify plugin scaffold, WooCommerce plugin scaffold

**CONTEXT**
E-commerce platforms need server-side API integration for order processing and an optional client-side SDK for balance display and offer widgets. The SDK should work with Shopify and WooCommerce out of the box.

**▶ CLAUDE PROMPT**
Build the e-commerce integration layer for a multi-tenant loyalty platform.
DELIVERABLES:
1. JAVASCRIPT SDK (/packages/loyalty-js-sdk/)
npm package: \@loyalty-platform/sdk
TypeScript source, compiled to ESM + CJS bundles (tsup)
LoyaltySDK class:
constructor({ tenantId, apiBaseUrl, environment })
// Member
async enrollMember(data: EnrollmentInput): Promise\<MemberResult\>
async getMemberByEmail(email: string): Promise\<MemberResult \| null\>
// Balance & Tier
async getMemberBalance(memberId: string): Promise\<BalanceResult\>
async getMemberTier(memberId: string): Promise\<TierResult\>
// Transactions (server-side only --- requires API key)
async recordTransaction(data: TransactionInput): Promise\<TransactionResult\>
// Offers
async getEligibleOffers(memberId: string): Promise\<Offer[]\>
async redeemOffer(data: RedemptionInput): Promise\<RedemptionResult\>
// UI Widget helpers (client-side safe, no API key)
renderBalanceWidget(elementId: string, memberId: string): void
renderOffersWidget(elementId: string, memberId: string): void
Error handling: typed LoyaltySDKError with code, message, retryable flag
Retry: auto-retry on 429 and 5xx with exponential backoff (max 3 attempts)
Include README.md with full usage examples
2. SHOPIFY INTEGRATION GUIDE + SCAFFOLD
/integrations/shopify/
README.md --- step-by-step Shopify integration guide
loyalty-shopify-theme-extension/
assets/loyalty-widget.js --- theme extension JS using SDK renderBalanceWidget
blocks/loyalty-balance.liquid --- Liquid block for balance display
blocks/loyalty-offers.liquid --- Liquid block for eligible offers at cart
loyalty-shopify-webhook-handler/
index.ts --- Express handler for Shopify order/create webhook → POST /v1/transactions
3. WOOCOMMERCE INTEGRATION GUIDE + SCAFFOLD
/integrations/woocommerce/
README.md --- step-by-step WooCommerce integration guide
loyalty-woocommerce.php --- WordPress plugin scaffold:
- Hooks: woocommerce_order_status_completed → record transaction
- Hooks: woocommerce_checkout_fields → add loyalty member ID field
- Admin settings page: API key, tenant ID, program name
- Shortcodes: [loyalty_balance], [loyalty_offers]
4. INTEGRATION PATTERNS DOCUMENTATION
/docs/ecommerce-integration.md
Document standard integration patterns:
- Account creation → member enrollment
- Order completion → transaction recording
- Cart page → eligible offers display
- Account page → points balance, tier, history
- Checkout → offer redemption
Include sequence diagrams (Mermaid format) for each pattern.
Include error handling guidance and idempotency key strategy for order webhooks.
TESTS:
- SDK unit tests: all methods with mocked fetch
- SDK integration test: against local loyalty platform (docker-compose)
- Shopify webhook handler test: mock Shopify order payload → verify correct transaction recorded

**⚠ NOTES FOR THIS TASK**
The Shopify webhook handler must use an Idempotency-Key derived from the Shopify order ID to prevent double-crediting on webhook retries. Use: lp_shopify\_{orderId} as the idempotency key.

  ---------- -------------------------------------------------- ------------ -------------
  **T-15**   **Consumer Mobile API & Push Notifications**       **Mobile**   **Phase 2**

  ---------- -------------------------------------------------- ------------ -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-04, T-05, T-08, T-13            | Mobile-optimized API endpoints, push notification registration + dispatch, SMS notifications, notification preference management

**CONTEXT**
The consumer mobile API exposes member-specific endpoints optimized for mobile clients. Push notifications via Azure Notification Hubs. SMS via Azure Communication Services.

**▶ CLAUDE PROMPT**
Implement the consumer mobile API and push notification system for a multi-tenant loyalty platform.
Tech stack: Node.js 20, TypeScript, Express, Azure Notification Hubs, Azure Communication Services.
ADD TO MEMBER SERVICE (/services/member-service):
MOBILE-OPTIMIZED ENDPOINTS:
GET /v1/mobile/dashboard/:memberId
Single endpoint for mobile home screen --- avoids multiple round trips:
Returns: {
member: { firstName, tier, pointsBalance, pointsToNextTier, nextTierName },
recentTransactions: Transaction[5], // last 5 transactions
activeOffers: Offer[3], // top 3 eligible offers
notifications: Notification[3], // last 3 unread notifications
tierProgress: { current: number, nextThreshold: number, percentage: number }
}
Assembled from Redis cache where possible; max 200ms response target.
GET /v1/mobile/members/:memberId/transactions
Query: ?limit=20&after=cursor
Mobile-friendly transaction list with human-readable descriptions
Returns: cursor-paginated transactions with pointsEarned, formattedAmount, locationName, channel icon hint
GET /v1/mobile/members/:memberId/notifications
Returns in-app notification history (separate from email log)
Mark as read: PATCH /v1/mobile/notifications/:notifId/read
PUSH NOTIFICATION SYSTEM:
Device Registration:
POST /v1/mobile/devices
Body: { memberId, platform: 'ios'\|'android', pushToken, deviceId }
- Register/update device token in Azure Notification Hubs
- Store in device_registrations table
- One member can have multiple devices
DELETE /v1/mobile/devices/:deviceId --- deregister on logout
device_registrations table (add to tenant migrations):
device_id, member_id, platform, push_token, hub_registration_id,
last_active_at, created_at
Notification Dispatch (add to notification-service):
On tier.upgraded: push notification \"You've reached {tierName}! 🎉\"
On points.earned (threshold): push \"You're {X} points away from {nextTier}!\"
On offer.available (targeted): push \"{offerName} --- just for you!\"
On points expiry warning (30d): push \"Your {X} points expire in 30 days\"
sendPush(memberId, { title, body, data }) via Azure Notification Hubs:
- Look up member's registered devices
- Send to all active devices for member
- Handle: expired tokens (deregister), delivery failure (log, no retry for push)
SMS NOTIFICATIONS (Phase 2 addition to notification-service):
Trigger: member.enrolled (opt-in welcome SMS), tier.upgraded
Use Azure Communication Services SMS
Template: \"Welcome to {programName}! You're enrolled. Check your balance at {url}.\"
Respect SMS opt-out preference
Store SMS delivery status in notification_log
NOTIFICATION PREFERENCES API:
GET /v1/mobile/members/:memberId/preferences
PUT /v1/mobile/members/:memberId/preferences
Schema: {
emailOptOut: bool,
smsOptOut: bool,
pushEnabled: bool,
pushTierChanges: bool,
pushOffers: bool,
pushPointsAlerts: bool,
digestOptOut: bool
}
TESTS:
- Mobile dashboard: verify assembled from correct sources, Redis cache hit tested
- Push registration: verify correct hub registration ID stored
- Push dispatch: mock Azure Notification Hubs, verify correct template + data sent per event
- SMS dispatch: mock Azure Communication Services, verify opt-out respected

**⚠ NOTES FOR THIS TASK**
Azure Notification Hubs has per-device registration limits on lower tiers. For Phase 2, Developer tier (500 active devices) is fine. Plan migration to Standard tier when approaching limit.

  ---------- -------------------------------------------------- --------------- -------------
  **T-16**   **Analytics Service & Reporting Dashboard Data**   **Analytics**   **Phase 2**

  ---------- -------------------------------------------------- --------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-05, T-06, T-11, T-13            | Analytics Service, KPI aggregation jobs, report endpoints, data export API, App Insights dashboard workbooks

**CONTEXT**
The Analytics Service pre-aggregates KPIs into materialized summary tables to serve dashboard queries fast. Raw event data remains in transactional tables. Aggregation jobs run nightly and on-demand.

**▶ CLAUDE PROMPT**
Implement the Analytics Service for a multi-tenant loyalty platform.
Tech stack: Node.js 20, TypeScript, Azure Container Apps (scheduled jobs + HTTP service).
SERVICE: /services/analytics-service (port 3004 + scheduled Azure Container App jobs)
MATERIALIZED SUMMARY TABLES (add to tenant migrations):
V8\_\_analytics_summaries.sql:
CREATE TABLE daily_program_summary (
summary_date DATE NOT NULL,
new_enrollments INT DEFAULT 0,
active_members INT DEFAULT 0, -- transacted in last 30d as of summary_date
transactions INT DEFAULT 0,
total_spend_cents BIGINT DEFAULT 0,
points_issued BIGINT DEFAULT 0,
points_redeemed BIGINT DEFAULT 0,
points_expired BIGINT DEFAULT 0,
redemption_count INT DEFAULT 0,
PRIMARY KEY (summary_date)
);
CREATE TABLE tier_snapshot (
snapshot_date DATE NOT NULL,
tier_id UNIQUEIDENTIFIER NOT NULL,
member_count INT DEFAULT 0,
PRIMARY KEY (snapshot_date, tier_id)
);
CREATE TABLE offer_daily_stats (
summary_date DATE NOT NULL,
offer_id UNIQUEIDENTIFIER NOT NULL,
impressions INT DEFAULT 0,
redemptions INT DEFAULT 0,
total_discount_cents BIGINT DEFAULT 0,
PRIMARY KEY (summary_date, offer_id)
);
AGGREGATION JOBS (run nightly at 1:00 AM UTC per tenant, Azure Container App scheduled job):
aggregateDailyProgram(tenantId, date):
INSERT INTO daily_program_summary for date by computing from:
- transactions table (count, sum amount)
- points_ledger table (sum by reason_code)
- members table (new enrollments on date)
- active members: distinct members with transaction in last 30 days
Use INSERT ... ON DUPLICATE KEY UPDATE (upsert) for idempotency
aggregateTierSnapshot(tenantId, date):
SELECT tier_id, COUNT(*) FROM members WHERE is_deleted=0 GROUP BY tier_id
UPSERT into tier_snapshot
aggregateOfferStats(tenantId, date):
From redemptions table joined to offers
UPSERT into offer_daily_stats
ANALYTICS ENDPOINTS:
GET /v1/analytics/summary
Query: ?dateFrom=&dateTo=&granularity=day\|week\|month
Returns: daily_program_summary rows, aggregated by granularity
Compute derived metrics: avg_transaction_value, points_per_transaction, redemption_rate, points_liability_estimate
GET /v1/analytics/tiers
Returns: current tier distribution + 90-day trend
{ tiers: [{ tierName, memberCount, percentage, trend30d }] }
GET /v1/analytics/offers
Query: ?dateFrom=&dateTo=&offerId=
Returns: offer_daily_stats aggregated per offer with computed redemptionRate
GET /v1/analytics/members/retention
Returns: cohort table --- enrollment month × days_since_enrollment → retention %
Compute from transactions: member enrolled in month M, still active (transacted) at 30/60/90/180/365 days
Cache in Redis TTL 3600s (expensive query)
GET /v1/analytics/members/at-risk
Returns: members with no transaction in last 60 days (configurable) AND positive points balance
Paginated, exportable
DATA EXPORT API:
POST /v1/analytics/exports
Body: { entity: 'members'\|'transactions'\|'ledger'\|'redemptions', dateFrom, dateTo, format: 'csv'\|'json' }
- Creates async export job
- Background job queries data in batches, streams to Azure Blob Storage
- Returns: { exportId, status: 'pending' }
GET /v1/analytics/exports/:exportId
- Returns: { status: 'pending'\|'ready'\|'failed', downloadUrl (SAS URL, 1h expiry), rowCount }
REAL-TIME KPI ENDPOINT:
GET /v1/analytics/realtime
Returns metrics computed live from last 24h:
{ enrollmentsToday, transactionsToday, pointsIssuedToday, redemptionsToday }
Served from Redis counters (incremented by Loyalty Engine on each event) --- sub-10ms response
REDIS COUNTERS: realtime:{tenantId}:enrollments:{date}, transactions:{date}, etc.
Reset daily at midnight UTC by analytics aggregation job
APP INSIGHTS KQL QUERIES:
/infra/monitoring/kql/
p99-transaction-latency.kql
error-rate-by-service.kql
tier-eval-lag.kql
daily-enrollment-trend.kql
Each query usable in Azure Monitor Workbook or App Insights Analytics.
TESTS:
- Aggregation job idempotency: run twice for same date, verify no duplicate rows
- Retention cohort computation: known dataset with expected retention percentages
- Export job: verify correct data in output CSV, async status polling

**⚠ NOTES FOR THIS TASK**
The retention cohort query can be very slow on large datasets. Add a covering index on transactions(member_id, created_at). The first run may timeout --- implement chunking by member enrollment month.

**PHASE 3**
**Advanced Features**
Platform depth: 3 tasks covering points expiry, fraud detection, admin dashboard
3 implementation tasks

  ---------- -------------------------------------------------- -------------- -------------
  **T-17**   **Points Expiry Engine**                           **Platform**   **Phase 3**

  ---------- -------------------------------------------------- -------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-05                              | Points expiry worker, nightly batch job, expiry preview endpoint, pre-expiry notifications

**CONTEXT**
Points expiry is a nightly batch job that identifies expiring points and writes debit ledger entries. Members are notified in advance. The expiry model is rolling (per-earn-date) not calendar-year.

**▶ CLAUDE PROMPT**
Implement the points expiry engine for a multi-tenant loyalty platform.
SERVICE: Add as Azure Container App scheduled job to /services/tier-eval-worker (or separate worker)
EXPIRY MODEL:
- Rolling expiry: each ledger credit entry expires N days after its earn date (N = tenant config pointsExpiryDays, default 365)
- \"First In First Out\" --- oldest points expire first
- Points earned from manual adjustments by admin: expiry follows same rule unless reason_code = 'admin_grant_no_expiry'
- Redemptions consume oldest points first (FIFO)
EXPIRY TRACKING:
Add column to points_ledger: expires_at DATETIME2 (nullable --- null = never expires)
On every INSERT to points_ledger with delta \> 0 (credit):
Set expires_at = created_at + tenant.pointsExpiryDays days (if expiry enabled)
NIGHTLY EXPIRY JOB (runs 3:00 AM UTC per tenant):
1. Query: SELECT * FROM points_ledger WHERE expires_at \<= NOW() AND delta \> 0 AND expiry_processed = 0
2. For each expiring credit entry:
a. Calculate unexpired portion: credit_delta - SUM(debits referencing this entry)
b. If unexpired_amount \> 0:
INSERT points_ledger (delta = -unexpired_amount, reason='expiry', ref_ledger_id = expiring_entry_id)
UPDATE points_ledger SET expiry_processed = 1 WHERE ledger_id = expiring_entry_id
DECR Redis balance cache
3. Publish points.expired event for each member with expired points
30-DAY WARNING JOB (runs nightly, separate pass):
Query: members who have credits expiring in the next 30 days
For each: if 30-day warning not yet sent (check notification_log), publish points.expiry_warning event
Notification service picks up event → sends email/push
7-DAY WARNING JOB: same pattern, 7 days out
EXPIRY PREVIEW ENDPOINT (add to loyalty-engine service):
GET /v1/members/:memberId/points/expiring
Returns: [{ expiresAt, points, daysRemaining }] --- upcoming expiring point buckets
Useful for mobile app \"your points expire soon\" display
ADMIN OVERRIDE:
PATCH /v1/admin/members/:memberId/points/extend-expiry
Body: { months: number, reason: string }
Extends expiry on all non-expired credits by N months
Writes audit log entry
TESTS:
- Unit: FIFO consumption logic, unexpired portion calculation
- Integration: full expiry cycle --- earn points, advance mock date past expiry, run job, verify ledger and balance
- Warning notification: verify 30d and 7d warnings sent exactly once per expiring bucket
- Idempotency: running expiry job twice for same date produces no duplicate debits

**⚠ NOTES FOR THIS TASK**
The expiry_processed flag on the ledger prevents double-expiry. Add a database index on (expires_at, expiry_processed) for the nightly job query performance.

  ---------- ---------------------------------------------------- -------------- -------------
  **T-18**   **Fraud Detection --- Rule-Based Velocity Checks**   **Platform**   **Phase 3**

  ---------- ---------------------------------------------------- -------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-05, T-04                        | Fraud detection middleware in Loyalty Engine, rule engine, quarantine queue, admin review UI hooks, tests

**CONTEXT**
Rule-based fraud detection flags suspicious earn patterns without blocking transactions. Flagged transactions are quarantined for manual review. Rules are configurable per tenant.

**▶ CLAUDE PROMPT**
Implement rule-based fraud detection for a multi-tenant loyalty platform.
Add fraud detection layer to /services/loyalty-engine.
FRAUD DETECTION ARCHITECTURE:
- Non-blocking: fraud checks run AFTER transaction is recorded, not before
- Flagging: suspicious transactions are marked fraud_flag=true and published to a fraud review queue
- Admin review: flagged transactions visible in admin portal for manual disposition
- Auto-resolution: configurable auto-approve after N days of no action
FRAUD_FLAGS TABLE (add to tenant migrations):
CREATE TABLE fraud_flags (
flag_id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY,
transaction_id UNIQUEIDENTIFIER NOT NULL,
member_id UNIQUEIDENTIFIER NOT NULL,
rule_triggered NVARCHAR(100) NOT NULL,
rule_detail NVARCHAR(MAX), -- JSON: { threshold, actual, window }
status NVARCHAR(20) DEFAULT 'pending', -- pending\|approved\|rejected
reviewed_by NVARCHAR(200),
reviewed_at DATETIME2,
points_action NVARCHAR(20), -- kept\|reversed
created_at DATETIME2 DEFAULT SYSUTCDATETIME()
);
FRAUD RULES ENGINE (src/fraud/rules-engine.ts):
Implement FraudRulesEngine with configurable rules per tenant (stored in tenant config):
Rule 1: VELOCITY_EARN_DAILY
If member earns points \> N transactions in 24h window → flag
Default threshold: 20 transactions/day
Rule 2: VELOCITY_EARN_AMOUNT
If member earns points on single transaction \> X times their 90-day average transaction value → flag
Default: 10x average
Rule 3: BULK_ENROLLMENT_REDEMPTION
If member enrolled less than 24h ago AND already has a redemption → flag
Rule 4: DUPLICATE_EXTERNAL_REF
If externalRef (POS receipt number) appears more than once for same tenant in 1 hour → flag both
Rule 5: RAPID_BALANCE_DRAIN
If member redeems \> 80% of their balance within 1 hour of earning → flag
Rule 6: LOCATION_VELOCITY
If same member transacts at \> 3 distinct location IDs within 15 minutes → flag (impossible travel)
INTEGRATION WITH LOYALTY ENGINE:
After successful transaction write:
1. Run FraudRulesEngine.evaluate(transaction, member, context)
2. If any rules triggered:
a. INSERT fraud_flags row
b. Publish fraud.flagged event to Service Bus
c. Log rule violation details
3. Transaction is NOT reversed at this point --- admin decides
ADMIN FRAUD REVIEW (add to admin-api):
GET /v1/admin/fraud/flags?status=pending&dateFrom=&dateTo=
GET /v1/admin/fraud/flags/:flagId
POST /v1/admin/fraud/flags/:flagId/approve --- keep points, mark approved
POST /v1/admin/fraud/flags/:flagId/reject --- reverse points (INSERT ledger debit), mark rejected
TENANT RULE CONFIGURATION (add to program config):
fraudRules: {
velocityDailyThreshold: 20,
amountMultiplierThreshold: 10,
rapidDrainThreshold: 0.8,
locationVelocityWindowMinutes: 15,
locationVelocityMaxLocations: 3,
autoApproveAfterDays: 14
}
TESTS:
- Unit: each rule fires correctly at threshold, does not fire below threshold
- Unit: multiple rules can trigger on single transaction
- Integration: flagged transaction visible in admin API, points reversal on rejection
- Performance: fraud check adds \< 20ms to transaction processing time

**⚠ NOTES FOR THIS TASK**
Fraud rules must be evaluated asynchronously after the transaction commits --- do not add them to the critical path. Use a separate async function that fires after the transaction response is sent.

  ---------- -------------------------------------------------- ----------- -------------
  **T-19**   **Admin Dashboard Frontend**                       **Admin**   **Phase 3**

  ---------- -------------------------------------------------- ----------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-11, T-16                        | React admin portal (Vite + TypeScript), dashboard, member management UI, offer management UI, analytics charts, Azure Static Web Apps deployment

**CONTEXT**
The merchant admin portal is a React SPA. It connects to the Admin API and Analytics Service. Built with modern tooling, RBAC-aware, and fully responsive for desktop use.

**▶ CLAUDE PROMPT**
Build the merchant admin dashboard frontend for a multi-tenant retail loyalty platform.
Tech: React 18, TypeScript, Vite, TanStack Query, TanStack Router, Recharts, Tailwind CSS.
Deploy target: Azure Static Web Apps (add staticwebapp.config.json).
DESIGN SYSTEM:
Brand colors: navy #1A3C5E (primary), azure #0078D4 (accent), gold #C8960C (rewards)
Font: Inter (system-level readability for data-dense dashboards)
Style: clean data-forward enterprise --- no decorative elements, maximum information density
PAGES & COMPONENTS:
/dashboard (home)
- KPI cards row: Enrollments Today, Transactions Today, Points Issued, Active Members (30d)
- Points Economy chart: 30-day line chart (points issued vs redeemed vs expired) via Recharts
- Tier Distribution: donut chart showing member % at each tier
- Recent Flags: mini-table of last 5 fraud flags (if any pending)
- All data from GET /v1/analytics/summary + /realtime
/members
- DataTable with server-side pagination + search
- Columns: Name, Phone (masked), Tier badge, Points Balance, Enrolled, Status
- Row click → member detail drawer (slide-in panel)
- Member detail: profile, tier history, last 10 transactions, manual adjustment form
- Bulk actions: export CSV
/offers
- Offer list with status badges (draft/active/paused/expired)
- Create offer modal: form with offer type selector, targeting rules builder
- Offer stats inline: redemption count, redemption rate
/analytics
- Date range picker (last 7d, 30d, 90d, custom)
- Enrollment trend chart
- Offer performance table
- Retention cohort heatmap (table with % highlighted by value)
- At-risk members list with export button
/program
- Program config form: earn rate, expiry, tier definitions
- Tier editor: add/remove/reorder tiers, set thresholds and benefits
- Branding section: upload logo, set colors, preview email template
/settings/api-keys
- API key list (prefix + last used)
- Generate new key modal (shows full key once with copy button)
- Revoke key with confirmation
/settings/webhooks
- Webhook endpoint list with last delivery status
- Register webhook modal
- Test delivery button with response inspector
GLOBAL:
- Auth: OAuth 2.0 PKCE via MSAL.js (Azure AD B2C)
- React Context: TenantContext (tenantId, programName, userRole)
- RBAC: useRole() hook --- hide/disable actions based on role
- API client: axios instance with auth interceptor, automatic token refresh
- Error boundary + toast notifications for API errors
- Loading skeletons for all data tables and charts
STATE MANAGEMENT:
TanStack Query for all server state
Cache invalidation on mutations (e.g., after tier override, invalidate member query)
DEPLOYMENT:
/staticwebapp.config.json --- SPA routing (all routes → index.html), auth redirect config
/.github/workflows/deploy-admin-portal.yml --- build + deploy to Azure Static Web Apps
TESTS:
- Component tests (Vitest + Testing Library) for: member search, offer create form validation, RBAC hiding
- E2E test scaffold (Playwright): login flow, dashboard loads KPIs, member lookup

**⚠ NOTES FOR THIS TASK**
Keep the bundle size tight --- Azure Static Web Apps free tier has bandwidth limits. Use dynamic imports for Recharts (heavy). The MSAL.js B2C configuration requires the exact B2C tenant name and policy names from T-08.

**PHASE 4**
**Scale & Ecosystem**
Self-serve growth: 1 tasks covering self-onboarding portal and ecosystem foundations
1 implementation tasks

  ---------- -------------------------------------------------- -------------- -------------
  **T-20**   **Self-Serve Tenant Onboarding Portal**            **Platform**   **Phase 4**

  ---------- -------------------------------------------------- -------------- -------------

**DEPENDS ON**                    | **DELIVERS**
|
T-03, T-19                        | Self-serve onboarding React app, guided setup wizard, automated provisioning API, email-based account verification

**CONTEXT**
Phase 4 enables merchants to onboard themselves without ops involvement. The portal guides through program setup, runs the provisioning pipeline, and generates API credentials --- all within a single flow.

**▶ CLAUDE PROMPT**
Build the self-serve tenant onboarding portal for a multi-tenant loyalty platform.
This is a public-facing signup flow (separate from the admin portal in T-19).
Deploy to a separate Azure Static Web App or route under /signup.
ONBOARDING WIZARD (5 steps):
Step 1 --- Account Setup:
Form: companyName, slug (auto-suggested from companyName, editable, uniqueness check via API),
adminEmail, adminFirstName, adminPassword
Validate slug format (lowercase alphanumeric + hyphens, 3-50 chars)
Real-time slug availability check (debounced, GET /public/tenants/check-slug?slug=)
Step 2 --- Program Setup:
Form: programName, baseEarnRate (slider: 1--10 points per dollar),
pointsExpiryMonths (toggle + selector: 6/12/18/24 months or Never),
defaultTierNames (pre-filled Bronze/Silver/Gold with threshold suggestions)
Visual preview: \"Your members earn {rate} point(s) per \$1 spent\"
Step 3 --- Branding:
Upload logo (drag-drop, preview inline)
Color picker for primaryColor
Preview: mini email template preview renders in real-time with entered brand values
Step 4 --- Review & Launch:
Summary card of all configuration choices
Estimated monthly cost based on pricing tier
Accept Terms of Service (checkbox with link)
\"Launch Program\" button
Step 5 --- Confirmation:
\"Your loyalty program is live!\"
Display: tenantId, API key (show once with copy button), sandbox vs live environment selector
Quick-start guide links (Shopify, WooCommerce, custom API)
\"Go to Dashboard\" → redirect to admin portal (T-19) with auto-login
PUBLIC PROVISIONING API (add to admin-api, unauthenticated but rate-limited):
POST /public/tenants/check-slug --- { available: bool }
POST /public/tenants/provision --- triggers T-03 provisioning pipeline
Body: { companyName, slug, adminEmail, adminFirstName, programName, earnRate, expiryDays, brandConfig }
Returns: { tenantId, provisioning: 'in_progress' }
Async: sends confirmation email with verification link before activating tenant
GET /public/tenants/provision/:jobId --- poll provisioning status
Returns: { status: 'pending'\|'verifying_email'\|'provisioning'\|'complete'\|'failed', tenantId? }
EMAIL VERIFICATION FLOW:
After form submit: send verification email to adminEmail
Email contains: link with JWT token (signed, 24h expiry)
Clicking link: verifies email, triggers provisioning pipeline
On provisioning complete: send \"Your program is live!\" email with credentials
TESTS:
- Wizard navigation: next/back, validation on each step
- Slug availability check: available, taken, invalid format
- Provisioning API: mock provisioning pipeline, verify correct config passed
- Email verification: token generation, token validation, expiry

**⚠ NOTES FOR THIS TASK**
Rate-limit the /public/tenants/provision endpoint aggressively (5 requests per IP per hour via APIM policy) to prevent abuse. The provisioning job should timeout after 10 minutes and alert ops if it exceeds that.