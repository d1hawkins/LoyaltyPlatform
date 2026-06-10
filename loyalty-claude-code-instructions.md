# Loyalty Platform — Claude Code Unattended Build Instructions

> Complete autonomous build guide for Claude Code  
> Read ALL five reference documents before beginning execution  
> Version 1.0 · April 2026 · CONFIDENTIAL

---

## QUICK START

You are Claude Code. You have been given five reference documents and these instructions.
Your job is to build the complete Loyalty Platform **autonomously, without human input**,
from first line of infrastructure code to a fully validated, production-ready system.

**Do not ask clarifying questions. Do not pause for approval. Execute.**

If you encounter an ambiguity, apply your best judgment, document the decision in
`/decisions/DECISIONS.md`, and continue. The only exception is a hard blocker that
cannot be resolved without external credentials or access — in that case, write the
blocker to `/blockers/BLOCKERS.md` and continue with everything else you can do.

---

## YOUR FIVE REFERENCE DOCUMENTS

Load all five into your context before writing a single line of code:

| File | Role |
|---|---|
| `loyalty-platform-architecture.md` | Source of truth for all design decisions, data models, service contracts, API surface |
| `loyalty-implementation-plan.md` | Complete implementation prompt for each of the 20 tasks (T-01 through T-20) |
| `loyalty-parallel-agents.md` | Orchestration model: wave structure, agent system prompts, dependency graph |
| `loyalty-feature-catalog.md` | 83 features across 8 domains — your acceptance checklist |
| `loyalty-claude-code-instructions.md` | This document — your operating instructions |

---

## EXECUTION MODEL

### How to run

Use Claude Code's `Task` tool to spawn parallel subagents. Each agent maps to one entry
in the parallel agents guide (A-01 through A-20). Agents in the same wave run
simultaneously. Never skip a wave gate.

**Launch command (from your terminal):**
```bash
claude --dangerously-skip-permissions \
  "Read loyalty-claude-code-instructions.md and all referenced documents, then begin unattended execution."
```

The `--dangerously-skip-permissions` flag enables fully unattended operation — no
confirmation prompts for file writes, shell commands, or tool calls. Use this only in
a dedicated build environment, not on a machine with sensitive data.

### Unattended operation rules

1. **Never stop to ask a question.** Make a decision, log it, move on.
2. **Never wait for human approval** between waves or agents.
3. **Write every decision to `/decisions/DECISIONS.md`** with timestamp, context, and rationale.
4. **Write every blocker to `/blockers/BLOCKERS.md`** with the agent that hit it, what is needed, and what you did instead.
5. **On agent failure**: retry once with the same prompt. On second failure: log to `/blockers/BLOCKERS.md`, mark the agent as FAILED, and continue with agents that do not depend on it.
6. **Continue building even if non-critical agents fail.** Only stop if A-01 or A-02 fail twice — nothing else can proceed without them.
7. **Log all progress** to `/build-log/BUILD_LOG.md` in real time.

---

## BUILD LOG PROTOCOL

Create and maintain `/build-log/BUILD_LOG.md` throughout execution.
Update it after every agent completion or failure. Format:

```
## Build Log — Loyalty Platform

### [TIMESTAMP] A-01 STARTED
Wave: 0 (Sequential)
Task: T-01 — Azure Infrastructure Scaffold

### [TIMESTAMP] A-01 COMPLETE
Duration: Xm Xs
Delivers: /infra/ Bicep files, infra-outputs.json
Gate check: infra-outputs.json ✓

### [TIMESTAMP] WAVE 1 STARTED
Agents launched in parallel: A-03, A-04, A-05, A-06

### [TIMESTAMP] A-04 FAILED (attempt 1)
Error: [error summary]
Action: Retrying

### [TIMESTAMP] A-04 COMPLETE (attempt 2)
...
```

---

## WAVE EXECUTION SEQUENCE

Execute waves in strict order. Within each wave, spawn all agents simultaneously.

### Wave 0 — Sequential Pre-Work
**A-01** → then **A-02** (A-02 cannot start until A-01 is complete)

Gate before proceeding to Wave 1:
- [ ] `/infra/infra-outputs.json` exists with all required keys
- [ ] `pnpm build` passes with 0 errors
- [ ] `/packages/HANDOFF.md` exists

---

### Wave 1 — Spawn simultaneously: A-03, A-04, A-05, A-06

Gate before proceeding to Wave 2:
- [ ] `/scripts/PROVISIONING.md` exists (A-03)
- [ ] Test tenant `daiso-test` provisioned in dev
- [ ] `/services/member-service/HANDOFF.md` exists (A-04)
- [ ] `/services/loyalty-engine/HANDOFF.md` exists (A-05)
- [ ] `/infra/b2c/HANDOFF.md` exists (A-06)

**Note:** A-08 (Wave 2) only needs A-05. You may launch A-08 as soon as A-05 completes,
without waiting for A-03, A-04, A-06. Optimize for speed.

---

### Wave 2 — Spawn when dependencies met: A-07, A-08

A-07 needs: A-04 + A-05 + A-06 complete
A-08 needs: A-05 complete only (may launch earlier — see note above)

Gate before proceeding to Wave 3:
- [ ] `/infra/apim/HANDOFF.md` exists (A-07)
- [ ] Postman collection verified against dev APIM (A-07)
- [ ] `/services/tier-eval-worker/HANDOFF.md` exists (A-08)

---

### Wave 3 — Spawn simultaneously: A-09, A-10, A-11

**Migration version pre-assignment** (enforce this — do not let agents pick their own):
- V8 → A-09 (webhook_deliveries)
- V9 → A-10 (notification_log)
- V10 → A-11 (audit_log)

Inject this into each agent's prompt before spawning:
> "Your migration is pre-assigned: [V8/V9/V10]. Use exactly this version number."

Gate before proceeding to Wave 4:
- [ ] Webhook worker deployed to Container Apps (A-09)
- [ ] Notification service deployed, email templates tested (A-10)
- [ ] `/services/admin-api/HANDOFF.md` exists (A-11)

---

### Wave 4 — A-12 (Phase 1 Integration Gate)

This is the most important gate in the build. A-12 must:
1. Deploy all Phase 1 services to staging via CI/CD pipeline
2. Run the full end-to-end smoke test sequence
3. Write `/PHASE1_COMPLETE.md` with all results

Gate before proceeding to Wave 5:
- [ ] `/PHASE1_COMPLETE.md` exists
- [ ] All 8 service health checks show PASS in `/PHASE1_COMPLETE.md`
- [ ] End-to-end test sequence passed (enroll → transact → tier eval → notification → webhook)
- [ ] Migration version V10 confirmed applied

**If any smoke test fails:** A-12 must diagnose and fix the failing service before writing
`/PHASE1_COMPLETE.md`. Do not proceed to Wave 5 until all Phase 1 smoke tests pass.

---

### Wave 5 — Spawn simultaneously: A-13, A-14, A-15, A-16

Migration pre-assignment:
- V11 → A-13 (offers, redemptions)
- V12 → A-16 (analytics summaries)

Gate before proceeding to Wave 6:
- [ ] `/services/offer-service/HANDOFF.md` exists (A-13)
- [ ] JS SDK builds successfully: `npm pack` passes (A-14)
- [ ] Mobile dashboard endpoint responds < 200ms (A-15)
- [ ] `/services/analytics-service/HANDOFF.md` exists (A-16)

---

### Wave 6 — Spawn when dependencies met: A-17, A-18, A-19

A-17 needs: A-13 complete → Migration V13 (expiry columns)
A-18 needs: A-13 complete → Migration V14 (fraud_flags)
A-19 needs: A-16 + A-11 complete

Gate before proceeding to Wave 7:
- [ ] Expiry dry-run passes in staging (A-17)
- [ ] Fraud detection benchmark: < 20ms overhead (A-18)
- [ ] Admin portal deployed to Static Web Apps (A-19)
- [ ] `/apps/admin-portal/HANDOFF.md` exists (A-19)

---

### Wave 7 — A-20 (Final Agent)

Needs: A-19 + A-03 complete

Completion signal:
- [ ] Onboarding portal deployed and reachable
- [ ] `/PLATFORM_COMPLETE.md` exists and all 20 COMPLETE signals verified

---

## VALIDATION & ACCEPTANCE PROTOCOL

This is how you prove the platform is production-ready.
Run validation **after each wave** and then again as a full final pass.

### Per-wave validation (run after each wave gate passes)

After each wave, spawn a **Validation Agent** with this prompt:

```
You are a Validation Agent for the Loyalty Platform build.
Read loyalty-feature-catalog.md.
Read /build-log/BUILD_LOG.md.

Your job: for every feature in the catalog that is in scope for the
phases covered by the agents that just completed, verify it is implemented.

For each feature, check:
1. Does the code exist that implements this feature?
2. Does a test exist that covers this feature?
3. Does the test pass?

Output a validation report to /validation/wave-{N}-validation.md in this format:

## Wave N Validation Report
Generated: [timestamp]

### PASSED (N features)
- [Feature name] | [Task] | [Evidence: file path or test name]

### FAILED (N features)
- [Feature name] | [Task] | [Reason: what is missing]

### NOT YET IN SCOPE (N features)
- [Feature name] | Phase X — will be validated in Wave Y

### Summary
- Pass rate: X/Y features in scope
- Blockers: [list any that block next wave]
```

**Do not proceed to the next wave if any P0 features in scope have FAILED.**
Fix the failure first. Retry the responsible agent if needed.

---

### Final full validation (after A-20 completes)

Spawn a **Final Validation Agent** with this prompt:

```
You are the Final Validation Agent for the Loyalty Platform.
Read loyalty-feature-catalog.md.
Read loyalty-platform-architecture.md.
Read all files in /validation/*.md.

Perform a complete acceptance validation of the entire platform:

STEP 1 — FEATURE COVERAGE CHECK
For every one of the 83 features in the catalog, verify:
- Implemented: code exists
- Tested: automated test exists
- Passing: test passes in CI

STEP 2 — ARCHITECTURE COMPLIANCE CHECK
Verify the built system matches the architecture document:
- Multi-tenant isolated DB pattern implemented correctly
- All 7 core services deployed and healthy
- APIM routing to correct services
- Service Bus topics all created and subscribed to
- Redis caching in place for balance reads and member lookups
- Key Vault used for all secrets (no hardcoded credentials anywhere)
- All PII fields encrypted at rest
- Audit log populated on all write operations

STEP 3 — END-TO-END SCENARIO TESTS
Run these complete scenarios against the staging environment:

Scenario 1 — Full Member Lifecycle:
  a. Enroll member via POS channel
  b. Record 3 transactions totalling $250
  c. Verify points balance correct (base rate × amount)
  d. Verify welcome email sent (check notification_log)
  e. Verify tier evaluated (check tier_eval worker logs)
  f. Redeem an offer
  g. Verify points deducted from balance
  h. Verify redemption recorded
  i. Request GDPR deletion
  j. Verify soft-delete + PII scrub scheduled

Scenario 2 — Tier Promotion:
  a. Enroll member at Bronze tier
  b. Record transactions totalling > Silver threshold (500 points)
  c. Verify tier.upgraded event published to Service Bus
  d. Verify tier upgraded to Silver in member record
  e. Verify tier upgrade email sent

Scenario 3 — POS Offline Resilience:
  a. Submit a transaction with a past occurredAt timestamp (simulate offline queue)
  b. Verify transaction accepted and points calculated correctly
  c. Submit same transaction again with same Idempotency-Key
  d. Verify idempotent response returned (no double-credit)

Scenario 4 — Webhook Delivery:
  a. Register a test webhook endpoint
  b. Record a transaction
  c. Verify points.earned event delivered to webhook within 30s
  d. Verify HMAC-SHA256 signature on delivery is valid
  e. Simulate webhook endpoint returning 500
  f. Verify retry scheduled

Scenario 5 — Multi-Tenant Isolation:
  a. Enroll members in two different tenants
  b. Record transactions for both
  c. Verify Tenant A cannot see Tenant B's member data (attempt cross-tenant lookup → expect 403)
  d. Verify Tenant A's points balance unaffected by Tenant B's transactions

Scenario 6 — Admin Portal:
  a. Log in as owner role
  b. Navigate to Members — search for enrolled member
  c. Manually adjust points (+100, reason: "test adjustment")
  d. Verify ledger entry created
  e. Navigate to Analytics — verify enrollment and transaction counts correct
  f. Generate and download a member CSV export

STEP 4 — PERFORMANCE VALIDATION
Run these benchmarks against staging:
- GET /v1/members?phone= at 500 RPS → assert p99 < 100ms
- POST /v1/transactions at 200 RPS → assert p99 < 500ms
- GET /v1/mobile/dashboard/:id at 300 RPS → assert p99 < 200ms

STEP 5 — SECURITY CHECKS
- Verify no API key or connection string appears in any source file (grep check)
- Verify all endpoints return 401 without a valid JWT
- Verify cross-tenant request returns 403 (not 200 or 500)
- Verify GDPR delete endpoint triggers soft-delete immediately
- Verify PII fields (email, phone) are not returned in plaintext in any API response

OUTPUT final report to /validation/FINAL_VALIDATION.md:

## Final Validation Report
Generated: [timestamp]
Platform Version: 1.0

### Feature Coverage
Total features: 83
- Implemented & passing: X
- Implemented, test missing: X
- Not implemented: X
- Out of scope (Phase 3+): X

### Architecture Compliance
[Pass/Fail per item]

### End-to-End Scenarios
[Pass/Fail per scenario with evidence]

### Performance Benchmarks
[Results vs targets]

### Security Checks
[Pass/Fail per check]

### OVERALL VERDICT
[PRODUCTION READY / NOT READY — reason]

### Outstanding Items
[List any items that are not blocking but should be addressed post-launch]
```

**The build is not complete until `/validation/FINAL_VALIDATION.md` exists
and OVERALL VERDICT = PRODUCTION READY.**

If the verdict is NOT READY: fix the blocking items, re-run the affected
scenarios, and update the report. Repeat until PRODUCTION READY.

---

## DECISION LOG PROTOCOL

Every time you make a judgment call, write it to `/decisions/DECISIONS.md`:

```markdown
## [TIMESTAMP] Decision: [Short title]

**Agent:** A-XX
**Context:** What situation required a decision
**Options considered:** What alternatives existed
**Decision:** What you chose
**Rationale:** Why
**Impact:** What this affects downstream
```

Examples of decisions to log:
- Choosing a specific library version when the task prompt did not specify
- Resolving a conflict between two agents writing to the same file
- Handling a missing Azure resource that was expected from A-01
- Defaulting a configuration value not specified in the architecture doc
- Choosing an alternative approach when the specified one fails

---

## BLOCKER PROTOCOL

Write to `/blockers/BLOCKERS.md` any time you cannot proceed:

```markdown
## [TIMESTAMP] Blocker: [Short title]

**Agent:** A-XX
**Severity:** HARD (cannot proceed) / SOFT (can proceed with workaround)
**Description:** What you need and don't have
**What I tried:** Steps taken to resolve
**Workaround:** What you did instead (for SOFT blockers)
**Needs from human:** Exact action required to unblock (for HARD blockers)
**Downstream impact:** Which agents / features are affected
```

### Common blockers and how to handle them unattended

| Blocker | Unattended resolution |
|---|---|
| Azure credentials not configured | Write to BLOCKERS.md. Continue building all non-Azure code (shared packages, services, tests). |
| B2C tenant not created | Use `SKIP_AUTH=true` mode for all services. Write blocker. All auth-dependent tests marked pending. |
| Azure SQL not reachable | Use Docker SQL Server (testcontainers) for all unit and integration tests. Write blocker. |
| Redis not reachable | Use in-memory mock Redis for tests. Write blocker. |
| APIM provisioning timeout | Retry once after 10 minutes. If still failing, skip APIM integration tests, write blocker. |
| npm package install fails | Try `--legacy-peer-deps`. If still failing, pin to last known good version, document in DECISIONS.md. |
| Test fails after 2 fix attempts | Skip with `.skip`, write to BLOCKERS.md with exact error, continue. |

---

## FILE STRUCTURE EXPECTATIONS

By the time A-20 completes, the repository should contain:

```
/loyalty-platform/
  /infra/                          ← A-01: all Azure Bicep/Terraform
    infra-outputs.json
    /b2c/                          ← A-06: B2C config + HANDOFF.md
    /apim/                         ← A-07: APIM policies + HANDOFF.md
    /control-plane/                ← A-03: control plane migrations
    /monitoring/kql/               ← A-16: App Insights KQL queries
  /packages/                       ← A-02: all shared packages
    HANDOFF.md
    /shared-logger/
    /shared-errors/
    /shared-middleware/
    /shared-db-client/
    /shared-events/
    /shared-types/
    /shared-auth/                  ← A-06
    /loyalty-js-sdk/               ← A-14
  /services/
    /member-service/               ← A-04 + A-15 extensions
    /loyalty-engine/               ← A-05 + A-17 + A-18 extensions
    /offer-service/                ← A-13
    /notification-service/         ← A-10 + A-15 extensions
    /analytics-service/            ← A-16
    /admin-api/                    ← A-11 + A-13 + A-18 extensions
    /tier-eval-worker/             ← A-08
    /webhook-worker/               ← A-09
    /tenant-migrations/            ← A-03: V1–V14 SQL migrations
  /apps/
    /admin-portal/                 ← A-19: React SPA + HANDOFF.md
    /onboarding-portal/            ← A-20: React SPA
  /integrations/
    /shopify/                      ← A-14
    /woocommerce/                  ← A-14
  /scripts/
    provision-tenant.ts            ← A-03
    PROVISIONING.md
  /.github/workflows/              ← A-12: all CI/CD pipelines
  /build-log/
    BUILD_LOG.md                   ← maintained throughout
  /decisions/
    DECISIONS.md                   ← all judgment calls logged
  /blockers/
    BLOCKERS.md                    ← all blockers logged
  /validation/
    wave-0-validation.md
    wave-1-validation.md
    wave-2-validation.md
    wave-3-validation.md
    wave-4-validation.md
    wave-5-validation.md
    wave-6-validation.md
    wave-7-validation.md
    FINAL_VALIDATION.md            ← must say PRODUCTION READY
  PHASE1_COMPLETE.md               ← written by A-12
  PLATFORM_COMPLETE.md             ← written by A-20
```

---

## ORCHESTRATOR STATUS TABLE

Maintain this table in `/build-log/BUILD_LOG.md` and update it after every agent event:

```markdown
## Agent Status

| Agent | Task | Wave | Status | Started | Completed | Notes |
|-------|------|------|--------|---------|-----------|-------|
| A-01  | T-01 | 0    | ⏳     |         |           |       |
| A-02  | T-02 | 0    | ⏳     |         |           |       |
| A-03  | T-03 | 1    | ⏳     |         |           |       |
| A-04  | T-04 | 1    | ⏳     |         |           |       |
| A-05  | T-05 | 1    | ⏳     |         |           |       |
| A-06  | T-08 | 1    | ⏳     |         |           |       |
| A-07  | T-07 | 2    | ⏳     |         |           |       |
| A-08  | T-06 | 2    | ⏳     |         |           |       |
| A-09  | T-09 | 3    | ⏳     |         |           |       |
| A-10  | T-10 | 3    | ⏳     |         |           |       |
| A-11  | T-11 | 3    | ⏳     |         |           |       |
| A-12  | T-12 | 4    | ⏳     |         |           |       |
| A-13  | T-13 | 5    | ⏳     |         |           |       |
| A-14  | T-14 | 5    | ⏳     |         |           |       |
| A-15  | T-15 | 5    | ⏳     |         |           |       |
| A-16  | T-16 | 5    | ⏳     |         |           |       |
| A-17  | T-17 | 6    | ⏳     |         |           |       |
| A-18  | T-18 | 6    | ⏳     |         |           |       |
| A-19  | T-19 | 6    | ⏳     |         |           |       |
| A-20  | T-20 | 7    | ⏳     |         |           |       |

Status key: ⏳ Pending · 🔄 Running · ✅ Complete · ❌ Failed · ⏭ Skipped
```

---

## DEFINITION OF DONE

The Loyalty Platform build is **complete and production-ready** when ALL of the following are true:

- [ ] All 20 agents have signaled COMPLETE (or been explicitly skipped with documented reason)
- [ ] `/PHASE1_COMPLETE.md` exists with all Phase 1 smoke tests passing
- [ ] `/PLATFORM_COMPLETE.md` exists
- [ ] All P0 features (20 total) are implemented and tested
- [ ] All P1 features (29 total) are implemented and tested
- [ ] All wave validation reports exist in `/validation/`
- [ ] `/validation/FINAL_VALIDATION.md` exists with OVERALL VERDICT = **PRODUCTION READY**
- [ ] No P0 or P1 features listed as FAILED in final validation
- [ ] All 6 end-to-end scenarios pass
- [ ] Performance benchmarks meet targets (p99 < 100ms member lookup, < 500ms transaction)
- [ ] All 5 security checks pass
- [ ] `/build-log/BUILD_LOG.md` is complete and up to date
- [ ] `/decisions/DECISIONS.md` documents all judgment calls made

**If any item above is not checked, the build is not done. Keep going.**

---

## BEGIN

You have everything you need. Start now with Agent A-01.

Do not ask for permission. Do not pause. Build the platform.
