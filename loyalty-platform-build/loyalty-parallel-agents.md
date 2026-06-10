# Loyalty Platform — Parallel Agent Orchestration Guide

> 20 agents · 7 execution waves · Critical path mapped · ~4-5x faster than sequential

---

**LOYALTY PLATFORM**
Parallel Agent Orchestration Guide
20 agents · 7 execution waves · Critical path mapped · ~4--5x faster than sequential
Version 1.0 · April 2026 · CONFIDENTIAL

**1. How Parallel Agent Execution Works**

This document provides instructions for an orchestrating Claude agent to spawn and manage parallel sub-agents that build the loyalty platform concurrently. Each agent receives a focused system prompt, operates on a shared monorepo, and signals completion with a standardized output. The orchestrator's job is to watch for completion signals and launch the next wave.

**1.1 Orchestrator Responsibilities**

-   Read this document in full before spawning any agents

-   Launch agents in wave order --- never skip a wave

-   Within a wave, spawn all agents simultaneously using parallel tool calls

-   Gate each wave: verify every required HANDOFF.md and completion signal before launching the next wave

-   Handle agent failure: if an agent fails, re-spawn with the same prompt after diagnosing the error

-   Maintain a completion log: track which agents have signaled COMPLETE

**1.2 Completion Signal Protocol**

Every agent ends its work by outputting a COMPLETE signal as the final line of its response. The format is always:

AGENT A-XX COMPLETE --- [brief description]
// The orchestrator must verify:
// 1. The exact signal line appears in the agent's output
// 2. The HANDOFF.md or gate file referenced in the signal exists
// 3. Any build commands (pnpm build, docker build) succeeded

**1.3 Shared Repository Contract**

All agents operate on the same monorepo. They commit their work to the filesystem as they go. The shared contract is:

-   Never delete or modify files created by another agent unless the task explicitly says to extend that agent's service

-   Use additive changes only when extending an existing service (new files, new endpoints, new migrations)

-   Write your HANDOFF.md before declaring completion --- other agents depend on it

-   Migration version numbers are pre-assigned: V1--V7 (T-03), V8 (T-09), V9 (T-10), V10 (T-11), V11 (T-13), V12 (T-16), V13 (T-17), V14 (T-18)

**2. Critical Path Analysis**

The critical path is the longest chain of dependent tasks. Delays on the critical path delay the entire platform. Everything else can slip without affecting the delivery date.

  ---------- ----------------------------------------- --------------------------------------------------------------------------------------------
  **Task**   **Name**                                  **Why It's Critical**

  **T-01**   Azure Infrastructure Scaffold             Provisions all Azure resources. Nothing can deploy without this.

  **T-02**   Monorepo + Shared Packages                All services import shared types, middleware, DB client. No service compiles without this.

  **T-05**   Loyalty Engine --- Transaction & Ledger   Core write path. Tier worker, offer service, analytics all depend on this.

  **T-06**   Tier Evaluation Worker                    Must be running before offers can apply tier-restricted targeting.

  **T-12**   CI/CD Pipeline                            Gate between Phase 1 and Phase 2. All Phase 2 agents assume deployable services.

  **T-13**   Offer Service                             Mobile API, e-commerce SDK, fraud detection all depend on offer eligibility.

  **T-16**   Analytics Service                         Admin dashboard frontend requires analytics endpoints.

  **T-19**   Admin Dashboard Frontend                  Required before self-serve onboarding portal (T-20) can link to it.

  **T-20**   Self-Serve Onboarding Portal              Final platform capability --- depends on everything before it.
  ---------- ----------------------------------------- --------------------------------------------------------------------------------------------

Critical Path (must execute sequentially):
T-01 → T-02 → T-05 → T-06 → T-12 → T-13 → T-16 → T-19 → T-20
Everything else runs in parallel around this spine.
A delay to any node above delays the entire platform.

**3. Execution Wave Timeline**

Waves define which agents run concurrently. The orchestrator launches all agents in a wave simultaneously, then waits for all to complete before proceeding to the next wave.

  --------- ------------------------------- ---------------------------- ------------------------ ------------------------------------------------------------------
  **\#**    **Wave**                        **Agents**                   **Tasks**                **Launch Condition**

  **---**   Sequential Pre-work             **A-01, A-02**               T-01, T-02               Must complete before anything else

  **1**     Wave 1 --- Core Services        **A-03, A-04, A-05, A-06**   T-03, T-04, T-05, T-08   Launch all 4 in parallel after A-02 completes

  **2**     Wave 2 --- Engine Layer         **A-07, A-08**               T-06, T-07               A-07 needs A-05; A-08 needs A-04+A-05

  **3**     Wave 3 --- Integration Layer    **A-09, A-10, A-11**         T-09, T-10, T-11         All launchable after Wave 1 completes

  **4**     Wave 4 --- CI/CD & Go-Live      **A-12**                     T-12                     Integrates all Phase 1 services --- launch after Wave 3

  **5**     Wave 5 --- Offers + Analytics   **A-13, A-14, A-15, A-16**   T-13, T-14, T-15, T-16   All Phase 2 agents launch in parallel after A-12

  **6**     Wave 6 --- Advanced Features    **A-17, A-18, A-19**         T-17, T-18, T-19         A-17+A-18 need A-13; A-19 needs A-16

  **7**     Wave 7 --- Ecosystem            **A-20**                     T-20                     Final --- needs A-03 (tenant provisioning) + A-19 (admin portal)
  --------- ------------------------------- ---------------------------- ------------------------ ------------------------------------------------------------------

  ------------------------- ------------------------------ --------------------------------
                            **Sequential Execution**       **Parallel Execution**

  **Total agents needed**   1 (runs tasks one at a time)   20 agents (max concurrent)

  **Phase 1 completion**    12 sequential tasks            5 waves, max 4 parallel

  **Phase 2 completion**    4 more sequential tasks        2 waves, max 4 parallel

  **Phase 3 completion**    3 more sequential tasks        1 wave, max 3 parallel

  **Phase 4 completion**    1 final task                   1 final agent

  **Estimated speedup**     Baseline                       ~4--5x faster wall-clock time
  ------------------------- ------------------------------ --------------------------------

**4. Orchestrator Master Prompt**

Paste this prompt to the top-level orchestrating Claude instance. It directs the orchestrator on how to manage all 20 agents across all 7 waves.

You are the Orchestrator for building the Loyalty Platform.
You will manage 20 parallel sub-agents across 7 execution waves.
YOUR RULES:
1. Never spawn an agent before its dependencies are met.
2. Within each wave, spawn all agents SIMULTANEOUSLY using parallel tool calls.
3. Each agent's system prompt is in this document under its Agent ID.
4. Before launching a wave, verify ALL gate conditions for that wave.
5. After each agent completes, verify: COMPLETE signal exists + HANDOFF.md exists.
6. If an agent fails: re-read its error, adjust its prompt, re-spawn once.
7. Maintain a status table as you go --- update it after each agent finishes.
MIGRATION VERSION ASSIGNMENTS (pre-assign to avoid conflicts):
V1-V7: T-03 (A-03) --- core tenant schema
V8: T-09 (A-09) --- webhook_deliveries
V9: T-10 (A-10) --- notification_log
V10: T-11 (A-11) --- audit_log
V11: T-13 (A-13) --- offers, redemptions
V12: T-16 (A-16) --- analytics summaries
V13: T-17 (A-17) --- expiry columns
V14: T-18 (A-18) --- fraud_flags
BEGIN EXECUTION:
Wave 0, Agent A-01: spawn immediately.
Wave 0, Agent A-02: spawn after A-01 COMPLETE signal verified.
Wave 1 (A-03, A-04, A-05, A-06): spawn simultaneously after A-02 COMPLETE.
Wave 2 (A-07, A-08): A-07 needs A-04+A-05+A-06; A-08 needs only A-05.
Wave 3 (A-09, A-10, A-11): spawn after all Wave 1 complete.
Wave 4 (A-12): spawn after Wave 3 + A-07 complete.
Wave 5 (A-13, A-14, A-15, A-16): spawn after A-12 COMPLETE + /PHASE1_COMPLETE.md.
Wave 6 (A-17, A-18): need A-13. A-19: needs A-16 + A-11.
Wave 7 (A-20): needs A-19 + A-03.
On A-20 COMPLETE: run final e2e smoke test and write /PLATFORM_COMPLETE.md.

**5. Agent System Prompts**

The following pages contain the complete system prompt for each of the 20 agents. Give each agent only its own prompt --- do not share other agents' prompts with it.

**SEQUENTIAL PRE-WORK**
**Sequential Pre-Work --- Must run first, one at a time**

  ---------- ------------------------------------------- ---------------- ------------
  **A-01**   **T-01**                                    **SEQUENTIAL**   **1 Task**

  ---------- ------------------------------------------- ---------------- ------------

**🟢 NO DEPENDENCIES**                            | **📦 AGENT PRODUCES**
|
*Launch immediately --- no prior agents required* | /infra/ --- complete Bicep IaC, GitHub Actions deploy pipeline, all Azure resources provisioned in dev environment

**▶ AGENT SYSTEM PROMPT**
You are Agent A-01. Your sole responsibility is Task T-01: Azure Infrastructure Scaffold.
Reference the full T-01 prompt from the Loyalty Platform Implementation Plan.
CRITICAL OUTPUT REQUIREMENTS:
- Produce complete, runnable Bicep files in /infra/
- Output a deploy-infra.yml GitHub Actions workflow
- Output an infra-outputs.json after deployment containing:
{ resourceGroup, appServicePlanId, apimUrl, serviceBusNamespace,
sqlServerName, redisHostname, storageAccountName,
keyVaultName, appInsightsConnectionString, containerAppsEnvId }
- Commit all files to /infra/ in the shared monorepo root
DO NOT begin T-02 or any other task. Your work is complete when:
1. All Bicep files are syntactically valid (run: az bicep build)
2. infra-outputs.json exists and contains all required keys
3. A README.md under /infra/ explains how to run the deployment
Signal completion by outputting exactly:
AGENT A-01 COMPLETE --- infra scaffold ready, outputs at /infra/infra-outputs.json

**⚠ ORCHESTRATOR NOTES**
A-01 must finish before A-02 can start. The orchestrator must verify infra-outputs.json exists before launching A-02.

  ---------- ------------------------------------------- ---------------- ------------
  **A-02**   **T-02**                                    **SEQUENTIAL**   **1 Task**

  ---------- ------------------------------------------- ---------------- ------------

**⏳ WAIT FOR**                             | **📦 AGENT PRODUCES**
|
A-01 complete (infra-outputs.json verified) | /packages/ --- all shared packages (logger, errors, middleware, db-client, events, types), monorepo root config, each service scaffold

**▶ AGENT SYSTEM PROMPT**
You are Agent A-02. Your sole responsibility is Task T-02: Monorepo Project Structure & Shared Tooling.
Reference the full T-02 prompt from the Loyalty Platform Implementation Plan.
DEPENDENCY: A-01 must be complete. Read /infra/infra-outputs.json --- use the keyVaultName
and appInsightsConnectionString values to seed the shared-config package defaults.
CRITICAL OUTPUT REQUIREMENTS:
Produce and commit to the monorepo root:
- pnpm-workspace.yaml listing all packages/* and services/*
- tsconfig.base.json with strict TypeScript settings
- All 6 shared packages fully implemented with tests:
\@loyalty/shared-logger, \@loyalty/shared-errors, \@loyalty/shared-middleware,
\@loyalty/shared-db-client, \@loyalty/shared-events, \@loyalty/shared-types
- Minimal service scaffold (health endpoint + Dockerfile) for ALL 8 services:
member-service, loyalty-engine, offer-service, notification-service,
analytics-service, admin-api, tier-eval-worker, webhook-worker
- Run pnpm install && pnpm build at root --- must succeed with 0 errors
- Run pnpm test --- shared package tests must pass
HANDOFF CONTRACT --- write /packages/HANDOFF.md containing:
- Exact import paths for all shared packages
- TypeScript interface definitions for all entities in shared-types
- Environment variable names expected by shared-db-client and shared-events
- How to register a new Service Bus subscription
Signal completion by outputting exactly:
AGENT A-02 COMPLETE --- monorepo ready, all shared packages tested, handoff at /packages/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
A-02 is the most critical agent. Every Wave 1 agent reads /packages/HANDOFF.md before writing a single line of service code. The orchestrator must verify HANDOFF.md exists and pnpm build passes before launching Wave 1.

**WAVE 1**
**Wave 1 --- 4 Parallel Agents --- Launch simultaneously after A-02**

  ---------- ------------------------------------------- ------------ ------------
  **A-03**   **T-03**                                    **WAVE 1**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                        | **📦 AGENT PRODUCES**
|
A-02 complete (HANDOFF.md verified, pnpm build passes) | /infra/control-plane/ migrations, /scripts/provision-tenant.ts, control plane DB schema live in dev

**▶ AGENT SYSTEM PROMPT**
You are Agent A-03, running in parallel with A-04, A-05, and A-06.
Your sole responsibility is Task T-03: Control Plane Database & Tenant Provisioning.
Reference the full T-03 prompt from the Loyalty Platform Implementation Plan.
Read /packages/HANDOFF.md before writing any code.
INTEGRATION POINTS WITH OTHER WAVE 1 AGENTS:
- A-04 (Member Service) will call your provisioning pipeline to create test tenant DBs
- A-05 (Loyalty Engine) will use the tenant DB connection resolution you build in shared-db-client
- DO NOT wait for A-04 or A-05 --- build to the interface contract in HANDOFF.md
CRITICAL OUTPUT REQUIREMENTS:
1. /infra/control-plane/migrations/ --- all Flyway SQL migration files
2. /services/tenant-migrations/ --- all tenant DB migration files (V1--V7)
3. /scripts/provision-tenant.ts --- runnable CLI, verified with --dry-run flag
4. Run the provisioning script for a test tenant named \"daiso-test\" in dev environment
5. Output /scripts/PROVISIONING.md documenting the CLI flags and expected output
HANDOFF CONTRACT --- append to /scripts/PROVISIONING.md:
- Test tenant ID created: daiso-test
- Connection string Key Vault secret name for daiso-test
- All migration file names and what each creates
Signal completion by outputting exactly:
AGENT A-03 COMPLETE --- control plane live, test tenant provisioned, docs at /scripts/PROVISIONING.md

**⚠ ORCHESTRATOR NOTES**
Run the provisioning script against the dev Azure SQL instance provisioned by A-01. The test tenant \"daiso-test\" will be used by all integration tests in subsequent waves.

  ---------- ------------------------------------------- ------------ ------------
  **A-04**   **T-04**                                    **WAVE 1**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                     | **📦 AGENT PRODUCES**
|
A-02 complete (HANDOFF.md verified) | /services/member-service/ --- fully implemented, tested, Dockerized; GET /v1/members?phone= verified at \< 100ms

**▶ AGENT SYSTEM PROMPT**
You are Agent A-04, running in parallel with A-03, A-05, and A-06.
Your sole responsibility is Task T-04: Member Service.
Reference the full T-04 prompt from the Loyalty Platform Implementation Plan.
Read /packages/HANDOFF.md before writing any code.
PARALLEL EXECUTION NOTES:
- A-03 is building the tenant DB schema at the same time. Use the shared-types Member
interface from \@loyalty/shared-types --- do NOT invent your own schema.
- A-05 (Loyalty Engine) will call your member lookup endpoint. Build to the contract in HANDOFF.md.
- If A-03 is not yet complete when you need a live DB: use Docker testcontainers for SQL Server
in your integration tests --- do not block on A-03.
CRITICAL OUTPUT REQUIREMENTS:
1. All endpoints implemented and tested per T-04 spec
2. Integration tests pass using testcontainers (no dependency on A-03 completion)
3. k6 load test script at /services/member-service/tests/load-test.js
4. Dockerfile builds successfully (docker build .)
5. GET /v1/members?phone= responds in \< 100ms at p99 under 500 RPS (verified by k6 script)
HANDOFF CONTRACT --- write /services/member-service/HANDOFF.md:
- Base URL and all endpoint paths
- Request/response schemas for GET /v1/members/:id and GET /v1/members?phone=
- Auth header format expected
- Error codes returned
Signal completion by outputting exactly:
AGENT A-04 COMPLETE --- member service implemented, k6 load test passes, handoff at /services/member-service/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
A-05 (Loyalty Engine) needs the member lookup endpoint contract. A-04 must write its HANDOFF.md even if integration tests use mocked data --- A-05 will use this contract to call the real service.

  ---------- ------------------------------------------- ------------ ------------
  **A-05**   **T-05**                                    **WAVE 1**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                     | **📦 AGENT PRODUCES**
|
A-02 complete (HANDOFF.md verified) | /services/loyalty-engine/ --- fully implemented with atomic ledger, idempotency, tested; points calculator unit tested at 100% coverage

**▶ AGENT SYSTEM PROMPT**
You are Agent A-05, running in parallel with A-03, A-04, and A-06.
Your sole responsibility is Task T-05: Loyalty Engine --- Transaction Processing & Ledger.
Reference the full T-05 prompt from the Loyalty Platform Implementation Plan.
Read /packages/HANDOFF.md before writing any code.
PARALLEL EXECUTION NOTES:
- A-04 (Member Service) is building in parallel. For integration tests that need member data,
use the test tenant created by A-03 OR mock member lookups --- do NOT block on A-04.
- A-06 (Tier Eval Worker) will subscribe to your points.earned Service Bus events.
Your event schema MUST match the envelope format in \@loyalty/shared-events exactly.
- The shared-db-client package from A-02 handles tenant DB resolution --- use it.
CRITICAL OUTPUT REQUIREMENTS:
1. All endpoints implemented and tested per T-05 spec
2. PointsCalculator class --- 100% unit test coverage
3. Atomic transaction + ledger write verified (integration test: simulate DB failure mid-write)
4. Idempotency tested: same Idempotency-Key submitted twice returns cached response
5. Concurrency test: 10 simultaneous POST /v1/transactions for same member --- final balance correct
6. Service Bus event published for every successful transaction (verified in integration test)
HANDOFF CONTRACT --- write /services/loyalty-engine/HANDOFF.md:
- All endpoint paths, request/response schemas
- points.earned event schema (exact JSON envelope)
- transaction.voided event schema
- Idempotency-Key header behavior
Signal completion by outputting exactly:
AGENT A-05 COMPLETE --- loyalty engine implemented, concurrency tests pass, handoff at /services/loyalty-engine/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
The points.earned event schema in the HANDOFF.md is consumed by A-06 (Tier Worker), A-10 (Notification), and A-16 (Analytics). Get this right --- schema changes after these agents start will require coordination.

  ---------- ------------------------------------------- ------------ ------------
  **A-06**   **T-08**                                    **WAVE 1**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                     | **📦 AGENT PRODUCES**
|
A-02 complete (HANDOFF.md verified) | /infra/b2c/ --- B2C app registrations, custom policies; /packages/shared-auth/ --- token verification utilities

**▶ AGENT SYSTEM PROMPT**
You are Agent A-06, running in parallel with A-03, A-04, and A-05.
Your sole responsibility is Task T-08: Authentication --- Azure AD B2C Configuration.
Reference the full T-08 prompt from the Loyalty Platform Implementation Plan.
Read /packages/HANDOFF.md before writing any code.
PARALLEL EXECUTION NOTES:
- You are building auth in parallel with the service agents. The shared-middleware package
(already in HANDOFF.md) has placeholder JWT validation --- you are implementing the real version.
- A-07 (APIM) will import your B2C JWKS endpoint URLs and issuer values. Write them to your
HANDOFF.md so A-07 can consume them without waiting for you.
- Do not block other agents --- they use SKIP_AUTH=true in dev until you complete.
CRITICAL OUTPUT REQUIREMENTS:
1. Both B2C app registrations created via Terraform in /infra/b2c/
2. Custom sign-up/sign-in policy XML files tested in B2C dev tenant
3. /packages/shared-auth/ --- verifyB2BToken, verifyConsumerToken, generateApiKey, validateApiKey
--- all with 100% unit test coverage
4. Local auth bypass (SKIP_AUTH=true) documented and working for other agents' dev use
5. Postman environment file with B2C token acquisition pre-request script
HANDOFF CONTRACT --- write /infra/b2c/HANDOFF.md:
- B2C tenant name and domain
- JWKS endpoint URL (dev and prod)
- Token issuer URL
- Client IDs for both app registrations
- Custom policy names (SignUpOrSignin, PasswordReset)
- How to acquire a test B2B token via curl
Signal completion by outputting exactly:
AGENT A-06 COMPLETE --- B2C configured, shared-auth tested, handoff at /infra/b2c/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
Other Wave 1 and Wave 2 agents use SKIP_AUTH=true during development. Ensure the bypass mode is clearly documented. A-07 (APIM) needs your JWKS URL to configure JWT validation policy.

**WAVE 2**
**Wave 2 --- 2 Parallel Agents --- Launch when their specific dependencies complete**

  ---------- ------------------------------------------- ------------ ------------
  **A-07**   **T-07**                                    **WAVE 2**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                                                                        | **📦 AGENT PRODUCES**
|
A-04 complete (member-service HANDOFF.md) + A-05 complete (loyalty-engine HANDOFF.md) + A-06 complete (b2c HANDOFF.md) | /infra/apim/ --- all APIM policies, OpenAPI specs, Postman collection; APIM configured in dev with live routing

**▶ AGENT SYSTEM PROMPT**
You are Agent A-07. Your sole responsibility is Task T-07: Azure API Management Configuration.
Reference the full T-07 prompt from the Loyalty Platform Implementation Plan.
READ THESE HANDOFF FILES BEFORE STARTING:
- /services/member-service/HANDOFF.md --- member service endpoint contracts
- /services/loyalty-engine/HANDOFF.md --- loyalty engine endpoint contracts
- /infra/b2c/HANDOFF.md --- B2C JWKS URL and issuer for JWT validation policy
CRITICAL OUTPUT REQUIREMENTS:
1. Global inbound policy XML with JWT validation using B2C JWKS URL from A-06 HANDOFF.md
2. Tenant routing policy using tenantId claim from JWT
3. Rate limiting policy (1000 req/min per tenant)
4. OpenAPI 3.0 specs for member-service and loyalty-engine matching schemas in their HANDOFFs
5. APIM configured in dev environment with routes pointing to deployed services
6. Postman collection tested against dev APIM endpoint (all calls return expected status codes)
HANDOFF CONTRACT --- write /infra/apim/HANDOFF.md:
- Dev APIM base URL
- How to acquire a token and call each API through APIM
- Rate limit header names
- X-Correlation-ID header behavior
Signal completion by outputting exactly:
AGENT A-07 COMPLETE --- APIM configured, Postman collection verified, handoff at /infra/apim/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
A-07 cannot start until A-04, A-05, and A-06 all complete --- it needs their endpoint contracts and B2C JWKS URL. The orchestrator must verify all three HANDOFF.md files exist before launching A-07.

  ---------- ------------------------------------------- ------------ ------------
  **A-08**   **T-06**                                    **WAVE 2**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                                | **📦 AGENT PRODUCES**
|
A-05 complete (loyalty-engine HANDOFF.md --- needs points.earned event schema) | /services/tier-eval-worker/ --- fully implemented, tested, deployed to Azure Container Apps in dev

**▶ AGENT SYSTEM PROMPT**
You are Agent A-08. Your sole responsibility is Task T-06: Tier Evaluation Worker.
Reference the full T-06 prompt from the Loyalty Platform Implementation Plan.
READ BEFORE STARTING:
- /services/loyalty-engine/HANDOFF.md --- for the points.earned event schema your worker subscribes to
- /packages/HANDOFF.md --- for Service Bus subscription pattern
PARALLEL EXECUTION NOTES:
- A-07 (APIM) is running in parallel. You do not depend on APIM --- your worker is
Service Bus triggered, not HTTP triggered.
- A-03 should be complete by now. Use the \"daiso-test\" tenant for integration tests.
CRITICAL OUTPUT REQUIREMENTS:
1. Worker subscribes to points.earned topic using event schema from loyalty-engine HANDOFF.md
2. Tier promotion logic tested: Bronze→Silver, Bronze→Gold (skip), no-op if already correct tier
3. Nightly demotion job implemented with --dry-run flag
4. Idempotency verified: same event processed twice = one tier change max
5. Deployed to Azure Container Apps in dev (use Container Apps env from infra-outputs.json)
6. tier.upgraded and tier.downgraded events published with correct schema
HANDOFF CONTRACT --- write /services/tier-eval-worker/HANDOFF.md:
- tier.upgraded event schema
- tier.downgraded event schema
- How to trigger a manual tier re-evaluation for a member (admin use)
Signal completion by outputting exactly:
AGENT A-08 COMPLETE --- tier eval worker deployed, integration tests pass, handoff at /services/tier-eval-worker/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
A-08 only depends on A-05, not all of Wave 1. The orchestrator can launch A-08 as soon as A-05 completes, even if A-04 and A-06 are still running.

**WAVE 3**
**Wave 3 --- 3 Parallel Agents --- Launch simultaneously after all Wave 1 agents complete**

  ---------- ------------------------------------------- ------------ ------------
  **A-09**   **T-09**                                    **WAVE 3**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                     | **📦 AGENT PRODUCES**
|
All Wave 1 agents complete (A-03, A-04, A-05, A-06) | /services/webhook-worker/ --- HMAC signing, retry engine, dead-letter queue, delivery log, deployed to Container Apps

**▶ AGENT SYSTEM PROMPT**
You are Agent A-09, running in parallel with A-10 and A-11.
Your sole responsibility is Task T-09: Webhook Delivery Service.
Reference the full T-09 prompt from the Loyalty Platform Implementation Plan.
READ BEFORE STARTING:
- /packages/HANDOFF.md --- Service Bus subscription pattern
- /services/loyalty-engine/HANDOFF.md --- event schemas your worker will forward to merchant webhooks
- /services/tier-eval-worker/HANDOFF.md --- tier event schemas
CRITICAL OUTPUT REQUIREMENTS:
1. Webhook worker subscribes to ALL Service Bus topics and fans out to registered endpoints
2. HMAC-SHA256 signing on every delivery (verified by integration test receiver)
3. Exponential backoff retry: 30s, 2m, 10m, 1h, 6h --- verified by test
4. Dead-letter after 5 failures --- admin API endpoint to view and replay
5. webhook_deliveries table created via migration (add V8 to tenant migrations)
6. Test receiver Express app at /services/webhook-worker/tests/test-receiver.ts
Signal completion by outputting exactly:
AGENT A-09 COMPLETE --- webhook worker deployed, HMAC signing tested, dead-letter verified

  ---------- ------------------------------------------- ------------ ------------
  **A-10**   **T-10**                                    **WAVE 3**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                     | **📦 AGENT PRODUCES**
|
All Wave 1 agents complete (A-03, A-04, A-05, A-06) | /services/notification-service/ --- email dispatch, Handlebars templates, weekly digest job, deployed to Container Apps

**▶ AGENT SYSTEM PROMPT**
You are Agent A-10, running in parallel with A-09 and A-11.
Your sole responsibility is Task T-10: Notification Service (Phase 1: Email).
Reference the full T-10 prompt from the Loyalty Platform Implementation Plan.
READ BEFORE STARTING:
- /packages/HANDOFF.md --- Service Bus subscription pattern
- /services/loyalty-engine/HANDOFF.md --- points.earned event schema
- /services/tier-eval-worker/HANDOFF.md --- tier.upgraded / tier.downgraded event schemas
- /infra/infra-outputs.json --- for Azure Communication Services connection details
CRITICAL OUTPUT REQUIREMENTS:
1. Subscribes to: member.enrolled, tier.upgraded, tier.downgraded, member.deleted
2. All 5 Handlebars templates implemented with tenant brand variable injection
3. Weekly digest job with correct Monday 8AM UTC schedule
4. notification_log table via migration (add V9 to tenant migrations --- coordinate with A-09 on migration numbering)
5. Opt-out preference checks enforced for every send
6. Unit tests: template rendering, opt-out logic
7. Integration tests: mock Azure Communication Services client
MIGRATION COORDINATION: A-09 is adding V8. Add V9 for notification_log. If A-09 is not yet
complete when you write your migration, name yours V9 and note this in your HANDOFF.md.
Signal completion by outputting exactly:
AGENT A-10 COMPLETE --- notification service deployed, email templates tested, digest job scheduled

**⚠ ORCHESTRATOR NOTES**
A-09 and A-10 are both adding tenant DB migrations (V8 and V9). The orchestrator must ensure they use sequential version numbers. If running truly in parallel, assign V8=webhook_deliveries and V9=notification_log upfront in the orchestrator prompt.

  ---------- ------------------------------------------- ------------ ------------
  **A-11**   **T-11**                                    **WAVE 3**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                     | **📦 AGENT PRODUCES**
|
All Wave 1 agents complete (A-03, A-04, A-05, A-06) | /services/admin-api/ --- fully implemented with RBAC, program config, member management, audit log, deployed

**▶ AGENT SYSTEM PROMPT**
You are Agent A-11, running in parallel with A-09 and A-10.
Your sole responsibility is Task T-11: Admin API.
Reference the full T-11 prompt from the Loyalty Platform Implementation Plan.
READ BEFORE STARTING:
- /packages/HANDOFF.md --- shared middleware, RBAC patterns
- /infra/b2c/HANDOFF.md --- admin portal auth (B2B client credentials)
- /services/member-service/HANDOFF.md --- member endpoints you proxy/extend for admin use
- /services/loyalty-engine/HANDOFF.md --- manual points adjustment calls loyalty engine
MIGRATION COORDINATION:
A-09 is adding migration V8, A-10 is adding V9. Add audit_log as V10.
CRITICAL OUTPUT REQUIREMENTS:
1. RBAC enforced: owner/manager/analyst roles tested with dedicated test cases
2. Program config endpoints with version history
3. Member management: search, status change, manual points adjustment (calls loyalty engine), tier override
4. API key management: generate (returns full key once), list (prefix only), revoke
5. Audit log: every write operation recorded with diff_json
6. async CSV export via Blob Storage
7. audit_log migration added as V10
HANDOFF CONTRACT --- write /services/admin-api/HANDOFF.md:
- All endpoint paths and required roles
- How admin tokens are structured (role claim)
Signal completion by outputting exactly:
AGENT A-11 COMPLETE --- admin API deployed, RBAC tests pass, handoff at /services/admin-api/HANDOFF.md

**WAVE 4**
**Wave 4 --- Integration Gate --- Launch after Wave 3 + A-07 complete**

  ---------- ------------------------------------------- ------------ ------------
  **A-12**   **T-12**                                    **WAVE 4**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                      | **📦 AGENT PRODUCES**
|
All Wave 3 agents complete (A-09, A-10, A-11) + A-07 complete (APIM) | /.github/workflows/ --- full CI/CD pipeline for all Phase 1 services; all services successfully deployed to staging via pipeline

**▶ AGENT SYSTEM PROMPT**
You are Agent A-12. Your sole responsibility is Task T-12: CI/CD Pipeline & Deployment.
Reference the full T-12 prompt from the Loyalty Platform Implementation Plan.
This is the PHASE 1 INTEGRATION GATE. You are the last Phase 1 agent. Your job is to wire
everything together and prove the full platform deploys cleanly end-to-end.
READ ALL HANDOFF FILES:
- /infra/infra-outputs.json (A-01)
- /packages/HANDOFF.md (A-02)
- /infra/apim/HANDOFF.md (A-07)
- /infra/b2c/HANDOFF.md (A-06)
- All /services/*/HANDOFF.md files
CRITICAL OUTPUT REQUIREMENTS:
1. ci.yml --- PR checks: lint, typecheck, unit tests, Docker build for all services
2. deploy-dev.yml --- auto-deploy all services on push to main
3. deploy-staging.yml --- manual deploy with environment protection
4. run-migrations.yml --- Flyway migration runner (runs V1--V10 in correct order)
5. Smoke test script that verifies all 8 service health endpoints post-deploy
6. FULL END-TO-END TEST: deploy all Phase 1 services to staging via the pipeline
and run this sequence:
a. Provision test tenant via A-03's script
b. Enroll a member via member-service
c. Record a transaction via loyalty-engine
d. Verify tier eval worker promoted if applicable
e. Verify notification service sent welcome email (check notification_log)
f. Verify points.earned webhook delivered to test receiver
PHASE 2 GATE SIGNAL --- write /PHASE1_COMPLETE.md containing:
- Staging environment URLs for all services
- APIM base URL
- Test tenant ID and API key for Phase 2 agents to use
- Migration version currently applied (should be V10)
- All smoke test results (pass/fail per service)
Signal completion by outputting exactly:
AGENT A-12 COMPLETE --- Phase 1 pipeline live, e2e test passed, gate file at /PHASE1_COMPLETE.md

**⚠ ORCHESTRATOR NOTES**
This is the most important gate in the plan. Phase 2 agents must not start until /PHASE1_COMPLETE.md exists and all smoke tests show PASS. The orchestrator must verify this file before launching any Wave 5 agent.

**WAVE 5**
**Wave 5 --- 4 Parallel Agents --- Launch simultaneously after /PHASE1_COMPLETE.md verified**

  ---------- ------------------------------------------- ------------ ------------
  **A-13**   **T-13**                                    **WAVE 5**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                        | **📦 AGENT PRODUCES**
|
A-12 complete (/PHASE1_COMPLETE.md verified with all smoke tests PASS) | /services/offer-service/ --- full offer catalog, eligibility engine, redemption, admin endpoints, deployed

**▶ AGENT SYSTEM PROMPT**
You are Agent A-13, running in parallel with A-14, A-15, and A-16.
Your sole responsibility is Task T-13: Offer Service.
Reference the full T-13 prompt from the Loyalty Platform Implementation Plan.
Read /PHASE1_COMPLETE.md for staging URLs, test tenant ID, and API key.
PARALLEL EXECUTION NOTES:
- A-14 (e-commerce SDK) will import your offer eligibility endpoint. Write your HANDOFF.md
before finishing so A-14 can consume it even while you are still testing.
- A-15 (Mobile API) needs your GET /v1/members/:id/offers endpoint. Same --- HANDOFF.md first.
- A-16 (Analytics) subscribes to your points.redeemed events. Match the schema in shared-events.
CRITICAL OUTPUT REQUIREMENTS:
1. All 5 offer types implemented (percentage, fixed, free product, threshold, bonus points)
2. EligibilityEngine fully unit tested --- every rule type covered
3. Double-redemption prevention tested with concurrent requests
4. Admin offer management endpoints added to admin-api (coordinate with A-11's codebase)
5. Threshold reward auto-issuance worker implemented and scheduled
6. points.redeemed event published with correct schema
7. offer.available migration added as V11 to tenant migrations
HANDOFF CONTRACT --- write /services/offer-service/HANDOFF.md:
- GET /v1/members/:id/offers --- response schema
- POST /v1/redemptions --- request/response schema
- points.redeemed event schema
- Offer eligibility rules (for documentation in A-14 SDK)
Signal completion by outputting exactly:
AGENT A-13 COMPLETE --- offer service deployed, eligibility engine tested, handoff at /services/offer-service/HANDOFF.md

  ---------- ------------------------------------------- ------------ ------------
  **A-14**   **T-14**                                    **WAVE 5**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                              | **📦 AGENT PRODUCES**
|
A-12 complete (/PHASE1_COMPLETE.md verified) | /packages/loyalty-js-sdk/ --- published npm package; /integrations/shopify/ and /integrations/woocommerce/ scaffolds

**▶ AGENT SYSTEM PROMPT**
You are Agent A-14, running in parallel with A-13, A-15, and A-16.
Your sole responsibility is Task T-14: E-Commerce Integration --- REST API & JavaScript SDK.
Reference the full T-14 prompt from the Loyalty Platform Implementation Plan.
Read /PHASE1_COMPLETE.md for staging API base URL and test credentials.
PARALLEL EXECUTION NOTES:
- A-13 (Offer Service) is building in parallel. Check for /services/offer-service/HANDOFF.md
periodically. If not yet available, stub the offer methods with TODO comments and a note
that they require A-13 HANDOFF.md to finalize. Do NOT block --- complete everything else.
- Use the member and transaction endpoints (already live from Phase 1) to build and test
the core SDK methods independently of A-13.
CRITICAL OUTPUT REQUIREMENTS:
1. SDK compiles to ESM + CJS bundles (tsup build succeeds)
2. All SDK methods unit tested with mocked fetch
3. Integration test: full flow against staging (enroll → transact → get balance → get offers)
Note: offers test requires A-13 to be complete --- mark as conditional integration test
4. Shopify webhook handler tested with mock order payload
5. WooCommerce plugin scaffold syntactically valid PHP
6. README.md with complete usage examples and integration guide
Signal completion by outputting exactly:
AGENT A-14 COMPLETE --- JS SDK built and tested, integrations scaffolded

**⚠ ORCHESTRATOR NOTES**
A-14 can complete most of its work without A-13. The offer-related SDK methods can be stubbed until A-13 finishes. Do not hold up A-14 completion on this --- mark those tests as pending and note the A-13 dependency explicitly.

  ---------- ------------------------------------------- ------------ ------------
  **A-15**   **T-15**                                    **WAVE 5**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                              | **📦 AGENT PRODUCES**
|
A-12 complete (/PHASE1_COMPLETE.md verified) | /services/member-service additions --- mobile endpoints, device registration; notification-service additions --- push + SMS; Azure Notification Hubs configured

**▶ AGENT SYSTEM PROMPT**
You are Agent A-15, running in parallel with A-13, A-14, and A-16.
Your sole responsibility is Task T-15: Consumer Mobile API & Push Notifications.
Reference the full T-15 prompt from the Loyalty Platform Implementation Plan.
Read /PHASE1_COMPLETE.md for staging URLs and test credentials.
Read /services/member-service/HANDOFF.md for existing endpoints you are extending.
Read /services/notification-service/HANDOFF.md if available for extension points.
PARALLEL EXECUTION NOTES:
- You are ADDING endpoints to member-service (already deployed by A-04/A-12).
Make changes as additive --- do not modify existing endpoints.
- A-13 (Offer Service) is building the offers data your mobile dashboard needs.
Check for /services/offer-service/HANDOFF.md. If not yet available, stub
the activeOffers field in the dashboard response with an empty array.
CRITICAL OUTPUT REQUIREMENTS:
1. GET /v1/mobile/dashboard/:memberId --- assembled from Redis cache, \< 200ms
2. Device registration endpoints + Azure Notification Hubs integration
3. Push dispatch on tier.upgraded and points expiry warning events
4. SMS dispatch via Azure Communication Services for welcome + tier change
5. Notification preferences endpoints
6. All new member-service endpoints added without breaking existing tests
Signal completion by outputting exactly:
AGENT A-15 COMPLETE --- mobile API deployed, push notifications tested, SMS verified

  ---------- ------------------------------------------- ------------ ------------
  **A-16**   **T-16**                                    **WAVE 5**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                              | **📦 AGENT PRODUCES**
|
A-12 complete (/PHASE1_COMPLETE.md verified) | /services/analytics-service/ --- KPI aggregation jobs, report endpoints, data export API, App Insights KQL queries, deployed

**▶ AGENT SYSTEM PROMPT**
You are Agent A-16, running in parallel with A-13, A-14, and A-15.
Your sole responsibility is Task T-16: Analytics Service & Reporting.
Reference the full T-16 prompt from the Loyalty Platform Implementation Plan.
Read /PHASE1_COMPLETE.md for staging URLs, test tenant ID, and API key.
Read /services/loyalty-engine/HANDOFF.md --- realtime Redis counter keys your service reads.
PARALLEL EXECUTION NOTES:
- A-13 (Offer Service) publishes points.redeemed events your analytics aggregates.
Implement the offer stats aggregation job but mark the integration test as requiring A-13.
- Your GET /v1/analytics/summary and /realtime endpoints are required by A-19 (Admin Dashboard).
Write your HANDOFF.md with response schemas early.
CRITICAL OUTPUT REQUIREMENTS:
1. All 3 materialized summary tables added as migration V12 (coordinate: A-13 adds V11)
2. Nightly aggregation jobs idempotent and tested
3. Retention cohort query with covering index
4. Data export async job with Azure Blob Storage SAS URL
5. Real-time counters from Redis (incremented by loyalty engine, read here)
6. KQL queries for App Insights saved to /infra/monitoring/kql/
HANDOFF CONTRACT --- write /services/analytics-service/HANDOFF.md:
- GET /v1/analytics/summary --- response schema
- GET /v1/analytics/realtime --- response schema
- GET /v1/analytics/tiers --- response schema
- Export job polling endpoints
Signal completion by outputting exactly:
AGENT A-16 COMPLETE --- analytics service deployed, aggregation jobs scheduled, handoff at /services/analytics-service/HANDOFF.md

**WAVE 6**
**Wave 6 --- 3 Parallel Agents --- A-17+A-18 after A-13; A-19 after A-16+A-11**

  ---------- ------------------------------------------- ------------ ------------
  **A-17**   **T-17**                                    **WAVE 6**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                    | **📦 AGENT PRODUCES**
|
A-13 complete (offer service --- needs ledger for expiry tracking) | /services/loyalty-engine additions --- expiry engine, nightly batch job, expiry preview endpoint, pre-expiry notifications

**▶ AGENT SYSTEM PROMPT**
You are Agent A-17, running in parallel with A-18 and A-19.
Your sole responsibility is Task T-17: Points Expiry Engine.
Reference the full T-17 prompt from the Loyalty Platform Implementation Plan.
Read /services/loyalty-engine/HANDOFF.md and /services/offer-service/HANDOFF.md.
You are EXTENDING the loyalty-engine service. All changes must be additive.
Run the existing loyalty-engine test suite after your changes --- it must still fully pass.
MIGRATION: Add expires_at and expiry_processed columns to points_ledger as migration V13.
CRITICAL OUTPUT REQUIREMENTS:
1. expires_at set on all new credit ledger entries (from this point forward)
2. Nightly expiry job with --dry-run mode verified in staging
3. 30-day and 7-day warning events published and handled by notification service
4. GET /v1/members/:memberId/points/expiring endpoint implemented and documented
5. Existing loyalty-engine tests still pass (no regressions)
Signal completion by outputting exactly:
AGENT A-17 COMPLETE --- expiry engine deployed, dry-run verified in staging

  ---------- ------------------------------------------- ------------ ------------
  **A-18**   **T-18**                                    **WAVE 6**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                              | **📦 AGENT PRODUCES**
|
A-13 complete (offer service --- fraud checks reference redemption patterns) | /services/loyalty-engine additions --- fraud rules engine, fraud_flags table, admin review endpoints in admin-api

**▶ AGENT SYSTEM PROMPT**
You are Agent A-18, running in parallel with A-17 and A-19.
Your sole responsibility is Task T-18: Fraud Detection --- Rule-Based Velocity Checks.
Reference the full T-18 prompt from the Loyalty Platform Implementation Plan.
Read /services/loyalty-engine/HANDOFF.md and /services/admin-api/HANDOFF.md.
You are EXTENDING loyalty-engine (fraud checks) and admin-api (review UI endpoints).
All changes must be additive. Existing test suites must still pass.
CRITICAL REQUIREMENT: Fraud checks must be NON-BLOCKING.
They run after transaction.commit(), not before. Performance test: fraud check adds \< 20ms.
MIGRATION: Add fraud_flags table as V14.
CRITICAL OUTPUT REQUIREMENTS:
1. All 6 fraud rules implemented and unit tested (each rule fires at threshold, not below)
2. FraudRulesEngine.evaluate() adds \< 20ms (benchmark test)
3. Admin fraud review endpoints added to admin-api
4. fraud.flagged event published and documented
5. Tenant rule configuration in program config schema (admin-api)
Signal completion by outputting exactly:
AGENT A-18 COMPLETE --- fraud detection deployed, performance benchmark passes

  ---------- ------------------------------------------- ------------ ------------
  **A-19**   **T-19**                                    **WAVE 6**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                             | **📦 AGENT PRODUCES**
|
A-16 complete (analytics HANDOFF.md) + A-11 complete (admin-api HANDOFF.md) | /apps/admin-portal/ --- React SPA, all pages implemented, deployed to Azure Static Web Apps

**▶ AGENT SYSTEM PROMPT**
You are Agent A-19, running in parallel with A-17 and A-18.
Your sole responsibility is Task T-19: Admin Dashboard Frontend.
Reference the full T-19 prompt from the Loyalty Platform Implementation Plan.
READ BEFORE STARTING --- these define all the API endpoints you will call:
- /services/admin-api/HANDOFF.md (A-11)
- /services/analytics-service/HANDOFF.md (A-16)
- /services/offer-service/HANDOFF.md (A-13)
- /infra/apim/HANDOFF.md (A-07) --- APIM base URL and auth
- /infra/b2c/HANDOFF.md (A-06) --- MSAL.js B2C config
CRITICAL OUTPUT REQUIREMENTS:
1. All 8 pages implemented (dashboard, members, offers, analytics, program, api-keys, webhooks, fraud flags)
2. TanStack Query used for all server state --- no manual fetch calls
3. MSAL.js auth with B2C PKCE flow (use config from A-06 HANDOFF.md)
4. RBAC: analyst cannot see write actions, manager cannot see API keys section
5. Recharts bundle lazy-loaded (dynamic import)
6. Deployed to Azure Static Web Apps via /.github/workflows/deploy-admin-portal.yml
7. Vitest component tests pass for RBAC, member search, offer form validation
HANDOFF CONTRACT --- write /apps/admin-portal/HANDOFF.md:
- Deployed Static Web App URL
- How to log in with a test admin account
- Route map (for A-20 to link to from onboarding portal)
Signal completion by outputting exactly:
AGENT A-19 COMPLETE --- admin portal deployed to Static Web Apps, all pages functional, handoff at /apps/admin-portal/HANDOFF.md

**⚠ ORCHESTRATOR NOTES**
A-19 can mock API responses for pages whose backend agents (A-17, A-18) are still in progress. Fraud flags page can show empty state. The admin portal should gracefully handle 404s from unimplemented endpoints.

**WAVE 7**
**Wave 7 --- Final Agent --- Launch after A-19 + A-03 complete**

  ---------- ------------------------------------------- ------------ ------------
  **A-20**   **T-20**                                    **WAVE 7**   **1 Task**

  ---------- ------------------------------------------- ------------ ------------

**⏳ WAIT FOR**                                                                 | **📦 AGENT PRODUCES**
|
A-19 complete (admin portal HANDOFF.md) + A-03 complete (provisioning pipeline) | /apps/onboarding-portal/ --- 5-step self-serve signup wizard, provisioning API, email verification, deployed to Azure Static Web Apps

**▶ AGENT SYSTEM PROMPT**
You are Agent A-20. Your sole responsibility is Task T-20: Self-Serve Tenant Onboarding Portal.
Reference the full T-20 prompt from the Loyalty Platform Implementation Plan.
This is the FINAL agent. You are building the public-facing front door to the platform.
READ BEFORE STARTING:
- /apps/admin-portal/HANDOFF.md (A-19) --- URL to redirect to after onboarding completes
- /scripts/PROVISIONING.md (A-03) --- provisioning pipeline CLI you will trigger via API
- /infra/apim/HANDOFF.md (A-07) --- APIM rate limiting to apply to public endpoints
CRITICAL OUTPUT REQUIREMENTS:
1. All 5 wizard steps with client-side validation
2. Real-time slug availability check (debounced, \< 200ms)
3. Public provisioning API endpoints added to admin-api and rate-limited via APIM (5 req/IP/hour)
4. Email verification JWT flow: token generation, validation, expiry
5. Post-verification: provisioning pipeline triggered, \"program is live\" email sent
6. API key shown once with copy-to-clipboard and explicit \"save this now\" warning
7. \"Go to Dashboard\" redirects to admin portal URL from A-19 HANDOFF.md
8. Deployed to Azure Static Web Apps
PLATFORM COMPLETION SIGNAL --- write /PLATFORM_COMPLETE.md containing:
- All 20 agent completion signals (verify each COMPLETE signal file exists)
- Staging URLs for: APIM, admin portal, onboarding portal
- Test tenant: daiso-test credentials
- Migration version applied (should be V14)
- End-to-end smoke test results: full onboarding flow (sign up → provision → enroll member → transact → check balance)
Signal completion by outputting exactly:
AGENT A-20 COMPLETE --- onboarding portal live. Platform build complete. See /PLATFORM_COMPLETE.md

**⚠ ORCHESTRATOR NOTES**
A-20 is the final piece. When it completes, the full platform is live. The orchestrator should run a final end-to-end smoke test: new tenant signs up through the onboarding portal, receives credentials, enrolls a member, records a transaction, and verifies the points balance.