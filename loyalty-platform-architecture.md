# Loyalty Platform — System Design & Architecture

> Azure-native · Multi-tenant Isolated · Hybrid Points + Tiers · Omnichannel  
> Version 1.0 · April 2026 · CONFIDENTIAL

---

**LOYALTY PLATFORM**
System Design & Architecture
Azure-native · Multi-tenant Isolated · Hybrid Points + Tiers · Omnichannel
Version 1.0 · April 2026 · CONFIDENTIAL

**1. Executive Summary**

This document defines the system design and architecture for a multi-tenant, retail loyalty platform built on Microsoft Azure. The platform supports hybrid loyalty programs (points accumulation combined with tiered membership) delivered across three channels: point-of-sale (in-store), e-commerce APIs, and consumer mobile applications.

Each retail customer (tenant) operates in a logically and physically isolated environment --- shared application tier, dedicated database --- enabling strong data separation, independent schema evolution, and per-tenant compliance posture without the operational overhead of fully separate deployments.

  ------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Design Goals**   High availability (99.9%+) · Sub-100ms points check at POS · Real-time tier evaluation · Configurable loyalty rules per tenant · GDPR/CCPA compliant · API-first for easy POS/e-commerce integration

  ------------------ ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**2. Architecture Overview**

The platform follows a microservices pattern deployed to Azure App Services (containerized workers on Azure Container Apps), with Azure Service Bus providing the event backbone for asynchronous processing. Azure API Management (APIM) serves as the single ingress for all external traffic, handling tenant routing, authentication, and rate limiting.

**2.1 Architecture Diagram**

  ----------------------------------------------------------------------------- ----------------------------------- ----------------------------------- ------------------------------ -------------------------------
  **POS / In-Store**                                                            **E-Commerce API**                  **Mobile App**                      **Admin Portal**               **3rd Party / Webhook**

  ▼                                                                             ▼                                   ▼                                   ▼                              ▼

  **Azure API Management · OAuth 2.0 / JWT · Rate Limiting · Tenant Routing**                                                                                                          

  ▼                                                                             ▼                                   ▼                                   ▼                              ▼

  **Loyalty Engine**                                                            **Member Service**                  **Offer Service**                   **Notification Svc**           **Analytics Service**

  ▼                                                                             ▼                                   ▼                                   ▼                              ▼

  **Azure Service Bus · Event Grid · Dead-Letter Queues · Retry Policies**                                                                                                             

  ▼                                                                             ▼                                   ▼                                   ▼                              ▼

  **Azure SQL (per-tenant)**                                                    **Redis Cache (sessions/points)**   **Blob Storage (assets/exports)**   **App Insights (telemetry)**   **Azure Key Vault (secrets)**
  ----------------------------------------------------------------------------- ----------------------------------- ----------------------------------- ------------------------------ -------------------------------

  ------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Key Principle**   All writes go through the Loyalty Engine service. Direct database access from channels is never permitted. This ensures audit completeness and consistent rule enforcement across POS, web, and mobile.

  ------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**2.2 Core Services**

  ---------------------- ------------------------------------------------------------------------------ --------------------------------
  **Service**            **Responsibility**                                                             **Tech Stack**

  Loyalty Engine         Points calculation, multiplier logic, ledger writes, tier evaluation trigger   Node.js / Azure App Service

  Member Service         Enrollment, profile management, PII handling, GDPR ops                         Node.js / Azure App Service

  Offer Service          Offer catalog, eligibility evaluation, redemption processing                   Node.js / Azure App Service

  Notification Service   Email, SMS, push dispatch on loyalty events                                    Node.js / Azure Container Apps

  Analytics Service      KPI aggregation, dashboard data, export generation                             Python / Azure Container Apps

  Tier Eval Worker       Async tier upgrade/downgrade based on ledger events                            Node.js / Azure Container Apps

  Admin API              Merchant dashboard backend: program config, reporting, member lookup           Node.js / Azure App Service
  ---------------------- ------------------------------------------------------------------------------ --------------------------------

**3. Multi-Tenancy Model**

The platform uses a multi-tenant isolated database pattern: all tenants share the same application codebase and Azure infrastructure, but each tenant receives a dedicated Azure SQL database. Tenant identity is established at the APIM layer via JWT claims and flows through all services as a mandatory context parameter.

**3.1 Tenant Routing**

-   Each API call must include a bearer token containing the tenant_id claim

-   APIM validates the JWT and injects X-Tenant-ID into downstream service headers

-   Services resolve the correct database connection string from a control plane lookup (cached in Redis, backed by Azure Key Vault)

-   No cross-tenant queries are permitted at any service layer --- enforced by code convention and integration test suite

**3.2 Control Plane vs. Data Plane**

  ------------------ ------------------------------------------------------------------------------------------------------------
  **Plane**          **Responsibility**

  Control Plane DB   Tenant registry, connection string references, feature flags, billing metadata --- single Azure SQL DB

  Data Plane DBs     One Azure SQL database per tenant; contains all loyalty data: members, transactions, ledger, offers, tiers

  Redis Cache        Shared cache with tenant-namespaced keys; holds points balances, session tokens, offer eligibility bitmaps
  ------------------ ------------------------------------------------------------------------------------------------------------

  ----------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Onboarding a New Tenant**   Tenant provisioning runs an automated pipeline: (1) Create tenant record in control plane, (2) Provision Azure SQL DB from template, (3) Run schema migrations, (4) Generate API credentials, (5) Configure webhook defaults. Target onboarding time: \< 5 minutes.

  ----------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4. Loyalty Engine**

The Loyalty Engine is the core processing service. It receives transaction events from all channels, applies tenant-configured rules to calculate points earned, writes to the immutable points ledger, and publishes domain events for downstream consumers.

**4.1 Points Calculation Flow**

-   Channel submits a transaction via POST /v1/transactions with member_id, amount, SKU list, and channel type

-   Loyalty Engine loads the tenant rule configuration (base earn rate, category multipliers, active promotions) from cache

-   Points are calculated: base_points = floor(amount * base_rate); bonus applied per active promotion conditions

-   A ledger entry is written atomically with the transaction record (single DB transaction)

-   A points.earned event is published to Azure Service Bus

-   Response returns updated points balance and new tier status within the same synchronous call

**4.2 Tier Evaluation**

Tier evaluation is asynchronous and event-driven. The Tier Eval Worker subscribes to the points.earned topic and evaluates whether the member qualifies for a tier change based on rolling 12-month points accumulation.

  -------------------- ----------------------------------------------------------------------------------------
  **Tier Logic**       **Detail**

  Evaluation Trigger   Every points.earned event; worker loads member lifetime and rolling points from ledger

  Promotion Criteria   Rolling 12-month points >= tier threshold AND not already at tier

  Demotion Criteria    Annual review cycle (configurable); rolling 12-month points \< retention threshold

  Tier Benefits        Stored as JSON config per tier; applied at redemption time by Offer Service

  Retroactive Safety   Tier eval is idempotent; re-processing the same event never double-promotes
  -------------------- ----------------------------------------------------------------------------------------

**4.3 Points Ledger Design**

The points ledger is an immutable, append-only double-entry ledger. Balances are never stored directly --- they are computed from ledger history and cached in Redis. This design ensures full auditability and enables point reversal without destructive updates.

  ----------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Ledger Rule**   Every debit (redemption, void, expiry) must reference a prior credit entry. The system rejects orphaned debits. Balance = SUM(delta) WHERE member_id = ? ordered by created_at.

  ----------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**5. Data Model**

Each tenant database implements the following core schema. All tables include created_at, updated_at, and is_deleted columns for soft-delete and audit support. Tenant ID is not stored in tenant databases (it is implicit in the connection context).

  ------------------- ------------------------------------------------------------------------- ---------------------------------------------------
  **Entity**          **Key Fields**                                                            **Notes**

  Tenant              tenant_id, name, config_json, db_connection_key                           One row per retailer in control plane DB

  Member              member_id, tenant_id, email, phone, tier_id, points_balance, created_at   PII encrypted at rest; phone is lookup key at POS

  Transaction         txn_id, member_id, tenant_id, channel, amount, points_earned, timestamp   Append-only; source of truth for audit

  PointsLedger        ledger_id, member_id, delta, reason_code, ref_txn_id, balance_after       Immutable double-entry ledger

  Tier                tier_id, tenant_id, name, min_points, multiplier, benefits_json           Configurable per tenant

  Offer               offer_id, tenant_id, type, value, conditions_json, valid_from, valid_to   Supports %, fixed, BOGO, threshold

  Redemption          redemption_id, member_id, offer_id, channel, redeemed_at, points_used     Links member to offer consumption

  WebhookConfig       hook_id, tenant_id, event_type, target_url, secret, retry_policy          Outbound event delivery config
  ------------------- ------------------------------------------------------------------------- ---------------------------------------------------

**6. API Design**

The platform exposes a RESTful API versioned under /v1/. All requests must include a valid bearer token. The Content-Type is application/json. Pagination uses cursor-based navigation (after and limit parameters). Errors follow RFC 7807 Problem Details format.

  --------------------------------- ------------ --------------------------------------------
  **Endpoint**                      **Method**   **Description**

  POST /v1/members                  POST         Enroll a new loyalty member

  GET /v1/members/{id}              GET          Retrieve member profile, tier, and balance

  POST /v1/transactions             POST         Record a purchase and trigger points calc

  POST /v1/transactions/{id}/void   POST         Void a transaction and reverse ledger

  GET /v1/members/{id}/ledger       GET          Paginated points history

  POST /v1/redemptions              POST         Redeem an offer or burn points

  GET /v1/offers                    GET          List active offers for a tenant

  GET /v1/members/{id}/offers       GET          Personalized eligible offers for member

  GET /v1/tiers                     GET          Retrieve tier definitions for tenant

  POST /v1/webhooks                 POST         Register a webhook endpoint

  GET /v1/analytics/summary         GET          Enrollment, activity, redemption KPIs
  --------------------------------- ------------ --------------------------------------------

**6.1 Webhook / Event Delivery**

For retailers requiring real-time event push (e.g., POS systems that want tier-upgrade notifications), the platform supports outbound webhooks. Retailers register target URLs via the /v1/webhooks endpoint. Events are delivered with HMAC-SHA256 signatures for verification.

  --------------------- ---------------------------------- -----------------------------------------------
  **Event Type**        **Trigger**                        **Consumers**

  member.enrolled       POST /v1/members succeeds          Notification Svc (welcome), Analytics

  points.earned         Transaction recorded               Notification Svc, Tier Eval worker, Analytics

  points.redeemed       Redemption recorded                Notification Svc, Analytics, Offer Svc

  tier.upgraded         Tier eval worker promotes member   Notification Svc, Analytics, Admin webhook

  tier.downgraded       Tier eval worker demotes member    Notification Svc, Analytics, Admin webhook

  offer.expired         Offer validity window closes       Analytics, Admin webhook

  transaction.voided    POST /v1/transactions/{id}/void    Ledger reversal, Tier re-eval, Analytics

  member.deleted        GDPR delete request                PII scrub pipeline, all services
  --------------------- ---------------------------------- -----------------------------------------------

  ------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Retry Policy**   Failed webhook deliveries are retried with exponential backoff: 30s, 2m, 10m, 1h, 6h. After 5 failures the delivery is moved to a dead-letter store and the merchant is alerted via admin dashboard. All delivery attempts are logged.

  ------------------ ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**7. Channel Integration**

**7.1 POS / In-Store**

POS integration is designed for low-latency, high-reliability operation. POS terminals authenticate using long-lived API keys (rotatable via admin portal). The critical path at checkout is:

-   Member lookup: GET /v1/members?phone={phone} --- returns member, tier, and current balance

-   Transaction submit: POST /v1/transactions --- synchronous, returns updated balance immediately

-   Redemption: POST /v1/redemptions --- apply discount/reward at time of tender

  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Offline Resilience**   POS systems may operate in degraded mode during connectivity loss. Transactions are queued locally and submitted in batch on reconnection. The platform accepts out-of-order transactions with original timestamps; ledger ordering uses transaction timestamp, not ingestion time.

  ------------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**7.2 E-Commerce**

E-commerce platforms integrate via the same REST API using server-side OAuth 2.0 client credentials. Standard integration points include: account creation (member enrollment), checkout (transaction + optional redemption), and order history page (ledger display). A JavaScript SDK will be provided for common e-commerce platforms.

**7.3 Mobile App (Consumer-Facing)**

The mobile app authenticates members using Azure AD B2C with PKCE OAuth flow. The app has read-heavy access patterns: member profile, points balance, offer list, and transaction history. Points balances are served from Redis cache (\< 5ms) to support real-time display. Push notifications are dispatched via Azure Notification Hubs on tier changes and offer availability.

**8. Security & Compliance**

  --------------------- --------------------------------------------------------------------------------------------------
  **Control**           **Implementation**

  Authentication        OAuth 2.0 client credentials (B2B) + PKCE (consumer mobile); JWTs issued by Azure AD B2C

  Tenant Isolation      Tenant ID injected at API gateway via JWT claim; each tenant maps to isolated Azure SQL database

  PII Encryption        Email and phone encrypted at rest using Azure Key Vault-managed keys; AES-256

  Transport Security    TLS 1.3 enforced at API Management; HSTS headers on all endpoints

  Secrets Management    All connection strings and API keys stored in Azure Key Vault; no secrets in app config or repos

  Rate Limiting         Per-tenant rate limiting enforced at APIM (configurable; default 1,000 req/min)

  Audit Logging         All write operations emit structured audit events to App Insights with actor, tenant, timestamp

  GDPR / Data Privacy   Member deletion triggers soft-delete + async PII scrub pipeline; data export API included
  --------------------- --------------------------------------------------------------------------------------------------

**9. Infrastructure & Sizing**

  -------------------------- -----------------------------------------------------------------------------------------------
  **Component**              **Launch Sizing (up to 10 tenants / 500K members)**

  App Services (API)         Azure App Service Plan P2v3, 2 instances per service, auto-scale to 6

  Azure SQL (per tenant)     Standard S2 (50 DTU); elastic pool shared across tenants for cost efficiency

  Redis Cache                Azure Cache for Redis C2 Standard (6 GB); used for session, points balance, offer eligibility

  Azure Service Bus          Standard tier; topics per event type; 1-day retention; DLQ enabled

  Azure API Management       Developer tier at launch; migrate to Standard at 5+ tenants

  Blob Storage               LRS for assets; GRS for backups and exports; lifecycle policy to cool after 30 days

  App Insights               Workspace-based; 30-day retention; sampling at 25% for high-volume event types

  Key Vault                  Standard tier; one vault per environment (dev/staging/prod)

  Container Apps (workers)   Azure Container Apps for background workers (tier evaluation, notification dispatch)
  -------------------------- -----------------------------------------------------------------------------------------------

**9.1 Environments**

  ----------------- --------------------------------------------- -----------------------------------------------------------------------------
  **Environment**   **Purpose**                                   **Notes**

  Development       Engineer sandbox; shared infrastructure       Single App Service instance; shared Redis; no SLA

  Staging           Pre-production integration and load testing   Production-mirror configuration; refreshed with anonymized prod data weekly

  Production        Live tenant traffic                           Auto-scale enabled; geo-redundant SQL; 99.9% SLA target
  ----------------- --------------------------------------------- -----------------------------------------------------------------------------

**9.2 CI/CD Pipeline**

-   Source control: Azure DevOps Repos with branch protection on main

-   PR gate: automated unit tests, integration tests, and security scan (Dependabot + OWASP dependency check)

-   Build: Azure Pipelines builds Docker images, runs schema migration dry-run against staging DB

-   Deploy: Blue/green deployment via Azure App Service deployment slots; traffic swap after smoke tests pass

-   Database migrations: Flyway-managed, applied before app swap, rollback scripts required for all migrations

**10. Observability & Operations**

  --------------------- ----------------------------------------------------------------------------------------------------------------------------
  **Concern**           **Approach**

  Structured Logging    All services emit JSON logs to App Insights with tenant_id, member_id, correlation_id, duration_ms, and outcome

  Distributed Tracing   OpenTelemetry SDK in all services; traces surfaced in App Insights Transaction Search

  Alerting              Azure Monitor alerts on: error rate > 1%, p99 latency > 500ms, DLQ depth > 100, failed tenant provisioning

  Dashboards            Two App Insights workbooks: (1) Platform health (per-service); (2) Per-tenant loyalty KPIs for merchant dashboard

  SLO Tracking          Points transaction p99 \< 200ms, member lookup p99 \< 100ms, tier eval end-to-end \< 5s --- measured daily via KQL queries
  --------------------- ----------------------------------------------------------------------------------------------------------------------------

**11. Open Items & Decisions Needed**

  ------------------------ ---------------------------------------------------------------------------------------- ------------------------------------------------------------------------------------
  **Item**                 **Options**                                                                              **Recommendation**

  Point expiry model       Fixed calendar year vs. rolling 12 months from earn date                                 Rolling 12-month --- better member retention, configurable per tenant

  APIM tier at launch      Developer (\$0) vs. Standard (\$750/mo)                                                  Developer for first 2 tenants; migrate to Standard at scale

  Notification provider    Azure Comm Services vs. Twilio vs. SendGrid                                              Azure Comm Services (native, lower integration cost) unless tenant requires Twilio

  Mobile SDK ownership     Build in-house vs. white-label React Native shell vs. API-only (tenant builds own app)   API-only at launch; white-label shell in Phase 2

  Points fraud detection   Rule-based (velocity checks) vs. ML-based anomaly detection                              Rule-based at launch; ML in Phase 2 after sufficient transaction history
  ------------------------ ---------------------------------------------------------------------------------------- ------------------------------------------------------------------------------------

**12. Phased Delivery Roadmap**

  -------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Phase**            **Scope & Target Timeline**

  Phase 1 (0--3 mo)    Core platform: Member enrollment, transaction processing, points ledger, basic tier logic, REST API, POS integration, admin portal v1, Daiso USA onboarding

  Phase 2 (3--6 mo)    E-commerce SDK, mobile app consumer portal, offer engine (%, fixed, threshold), webhook delivery, advanced analytics dashboard

  Phase 3 (6--12 mo)   White-label mobile shell, ML-based fraud detection, multi-currency points, coalition loyalty (cross-tenant earn), enterprise SLA tier

  Phase 4 (12+ mo)     Marketplace (tenant-to-tenant offers), open API partner ecosystem, self-serve tenant provisioning portal, international compliance (GDPR, PDPA)
  -------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------

**Appendix: Key Technology Decisions**

  ---------------------------- -----------------------------------------------------------------------------------------------------------------------------------------------------
  **Decision**                 **Rationale**

  Azure over GCP/AWS           Alignment with enterprise retailer Azure estates; APIM + Service Bus + AD B2C native integration; existing GNC Azure expertise transferable

  Node.js for services         Fast I/O for high-concurrency API workloads; strong Azure SDK support; unified language across services reduces context switching

  Azure SQL over Cosmos DB     Relational integrity critical for double-entry ledger; SQL easier to audit; familiar to retailer DBAs; Cosmos reserved for future global scale tier

  Service Bus over Event Hub   Service Bus better suited for command/control events with DLQ and per-message retry; Event Hub considered for analytics ingest in Phase 3

  Redis for balance cache      Sub-millisecond balance reads required at POS checkout; Redis atomic INCR operations safe for concurrent point updates without DB locking

  App Service over AKS         Lower operational overhead at launch scale; AKS considered when container orchestration complexity is justified (Phase 3+)
  ---------------------------- -----------------------------------------------------------------------------------------------------------------------------------------------------