# Loyalty Platform — Feature Catalog

> 83 features across 8 domains · Priority-ranked (P0–P3) · Phase-mapped (Phase 1–4)  
> Version 1.0 · April 2026 · CONFIDENTIAL

## Priority Legend
- **P0 – Critical**: Must-have for launch. Blocks go-live if missing.
- **P1 – High**: High value; target for same phase as P0.
- **P2 – Medium**: Important but deferrable to next phase.
- **P3 – Low**: Nice-to-have; included when capacity allows.

## Phase Legend
- **Phase 1** (Months 0–3): Core platform + Daiso USA launch
- **Phase 2** (Months 3–6): Offers, mobile app, e-commerce SDK
- **Phase 3** (Months 6–12): Advanced features, fraud, white-label
- **Phase 4** (Months 12+): Coalition, marketplace, partner ecosystem

---

**LOYALTY PLATFORM**
Feature Catalog
Comprehensive feature inventory across all platform domains · Priority-ranked · Phase-mapped
Version 1.0 · April 2026 · CONFIDENTIAL

**How to Read This Document**

Features are organized into eight functional domains. Each feature is assigned a priority level and a delivery phase. Use the legend below when filtering or planning sprint scope.

**Priority Levels**                                                            | **Delivery Phases**
|
-------------------- ------------------------------------------------------- |   ------------- ----------------------------------------------------------
**P0 -- Critical**   Must-have for launch. Blocks go-live if missing.        |   **Phase 1**   Months 0--3: Core platform + Daiso USA launch
|
-------------------- ------------------------------------------------------- |   ------------- ----------------------------------------------------------
|
---------------- -------------------------------------------------------     |   ------------- ----------------------------------------------------------
**P1 -- High**   High value; target for same phase as P0.                    |   **Phase 2**   Months 3--6: Offers, mobile app, e-commerce SDK
|
---------------- -------------------------------------------------------     |   ------------- ----------------------------------------------------------
|
------------------ -------------------------------------------------------   |   ------------- ----------------------------------------------------------
**P2 -- Medium**   Important but deferrable to next phase.                   |   **Phase 3**   Months 6--12: Advanced features, fraud, white-label
|
------------------ -------------------------------------------------------   |   ------------- ----------------------------------------------------------
|
--------------- -------------------------------------------------------      |   ------------- ----------------------------------------------------------
**P3 -- Low**   Nice-to-have; included when capacity allows.                 |   **Phase 4**   Months 12+: Coalition, marketplace, partner ecosystem
|
--------------- -------------------------------------------------------      |   ------------- ----------------------------------------------------------

**83**         | **27**      | **32**    | **24**       | **8**     | **4**
|             |           |              |           |
Total Features | P0 Critical | P1 High   | P2--P3 Later | Domains   | Phases

**👤 1. Member Management**
10 features · Core member lifecycle: enrollment, profile, identity, and compliance

  **\#**   **Feature**                       **Description**                                                                                                                                                                                                **Priority**         **Phase**
  -------- --------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **Member Enrollment**             Self-service and assisted enrollment across POS, web, and mobile. Captures email, phone, optional demographic fields. Generates unique member ID. Supports real-time duplicate detection by email and phone.   **P0 -- Critical**   **Phase 1**

  2        **Member Profile Management**     Members can view and update name, contact details, communication preferences, and linked accounts. Merchants can view and edit member records via admin portal with full audit trail.                          **P0 -- Critical**   **Phase 1**

  3        **Member Lookup at POS**          Real-time member identification by phone number or loyalty card scan. Returns member name, tier, points balance, and eligible offers in a single low-latency API call (\< 100ms target).                       **P0 -- Critical**   **Phase 1**

  4        **Member Search (Admin)**         Merchant admin can search members by name, email, phone, member ID, or tier. Results paginated with export to CSV. Supports bulk actions (points adjustment, tier override, status change).                    **P1 -- High**       **Phase 1**

  5        **Member Status Management**      Merchants can mark members as active, suspended, or closed. Suspended members cannot earn or redeem. Closed members trigger PII scrub pipeline. All status changes logged with reason code.                    **P1 -- High**       **Phase 1**

  6        **Linked Accounts**               Members can link multiple contact identifiers (email + phone + loyalty card barcode) to a single member record. All identifiers resolve to the same member at lookup.                                          **P2 -- Medium**     **Phase 2**

  7        **Member Merge**                  Admin-initiated merge of duplicate member records. Ledger entries from both records are consolidated under the surviving member ID. Merged record is tombstoned with reference to survivor.                    **P2 -- Medium**     **Phase 2**

  8        **Household / Family Accounts**   Primary member can invite secondary members to link accounts. Points earned by household members optionally pool to primary balance (configurable per tenant).                                                 **P3 -- Low**        **Phase 3**

  9        **GDPR / CCPA Data Deletion**     Member-initiated or admin-initiated deletion triggers soft delete immediately and async PII scrub within 30 days. Ledger entries are retained with PII replaced by anonymized tokens for audit integrity.      **P0 -- Critical**   **Phase 1**

  10       **Data Export (Member)**          Member can request a full data export (profile, transaction history, points history) in JSON or CSV format. Delivered via secure download link. Required for GDPR compliance.                                  **P1 -- High**       **Phase 2**

**⭐ 2. Points Engine**
11 features · Earn, ledger, multipliers, expiry, and balance management

  **\#**   **Feature**                         **Description**                                                                                                                                                                                                         **Priority**         **Phase**
  -------- ----------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **Base Points Earn**                Members earn points on every qualifying purchase. Base earn rate is configurable per tenant (e.g., 1 point per \$1 spent). Calculated at transaction submission; posted to ledger immediately.                          **P0 -- Critical**   **Phase 1**

  2        **Category Multipliers**            Merchants can configure bonus earn rates for specific product categories or SKUs (e.g., 3x points on vitamins). Multipliers stack additively with promotional multipliers up to a configurable cap.                     **P1 -- High**       **Phase 1**

  3        **Promotional Multipliers**         Time-bound earn multiplier promotions (e.g., double points weekends). Configured with start/end datetime, applicable member tiers, and channel restrictions. Multiple promotions can run concurrently.                  **P1 -- High**       **Phase 1**

  4        **Points Ledger**                   Immutable double-entry ledger records every points credit and debit. Balances are computed from ledger history; no mutable balance column. Supports full audit replay and retroactive correction.                       **P0 -- Critical**   **Phase 1**

  5        **Transaction Void / Reversal**     Voiding a transaction automatically reverses the associated points ledger entries. If reversal would push balance negative, system flags for manual review. Void window configurable per tenant.                        **P0 -- Critical**   **Phase 1**

  6        **Manual Points Adjustment**        Admin can credit or debit points to a member account with a mandatory reason code and notes field. All manual adjustments are logged with admin user identity and timestamped.                                          **P1 -- High**       **Phase 1**

  7        **Points Expiry**                   Configurable rolling expiry window per tenant (e.g., points expire 12 months after earn date). Expiry processed nightly by background worker. Members notified 30 and 7 days before expiry.                             **P1 -- High**       **Phase 2**

  8        **Points Balance Cache**            Current points balance served from Redis cache for sub-5ms reads at POS checkout. Cache invalidated on every ledger write. Fallback to live ledger sum on cache miss.                                                   **P0 -- Critical**   **Phase 1**

  9        **Bonus Points Events**             Merchants can define non-purchase earn triggers: birthday bonus, enrollment bonus, referral bonus, review submission, app download. Each trigger type has a configurable point value and one-time vs. recurring flag.   **P2 -- Medium**     **Phase 2**

  10       **Points Transfer**                 Member-to-member points transfer within the same tenant. Requires admin-enabled feature flag per tenant. Minimum transfer amount enforced. Transfers logged in both member ledgers.                                     **P3 -- Low**        **Phase 3**

  11       **Cross-Tenant Earn (Coalition)**   Members can earn points at participating retailer tenants and have them credited to a single coalition balance. Requires coalition configuration and inter-tenant settlement reconciliation.                            **P3 -- Low**        **Phase 4**

**🏆 3. Tier Management**
8 features · Tier definition, automatic promotion/demotion, benefits enforcement

  **\#**   **Feature**                     **Description**                                                                                                                                                                                                               **Priority**         **Phase**
  -------- ------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **Tier Definition**             Merchants configure up to 6 tiers per program. Each tier has a name, entry threshold (rolling 12-month points), multiplier bonus, and a JSON benefits definition (free shipping, priority support, exclusive offers, etc.).   **P0 -- Critical**   **Phase 1**

  2        **Automatic Tier Promotion**    Background worker evaluates member tier eligibility after every points.earned event. Promotes member and publishes tier.upgraded event when rolling 12-month points cross the next tier threshold.                            **P0 -- Critical**   **Phase 1**

  3        **Automatic Tier Demotion**     Annual tier review (configurable cadence) evaluates rolling 12-month points against retention thresholds. Members who fall below are demoted to the appropriate tier. 30-day advance warning notification sent.               **P1 -- High**       **Phase 1**

  4        **Tier Override (Admin)**       Admin can manually promote or demote a member tier with a mandatory reason code. Override is logged and distinguished from automatic tier changes in reporting.                                                               **P1 -- High**       **Phase 1**

  5        **Tier Benefits Enforcement**   At redemption and checkout, Offer Service reads the member's current tier and applies applicable benefits automatically (e.g., free shipping unlocked at Gold tier). Benefits defined in tier config JSON.                   **P1 -- High**       **Phase 1**

  6        **Tier Progress Display**       Consumer-facing API endpoint returns member's current tier, points to next tier, percentage progress, and benefit comparison between current and next tier. Used in mobile app and member portal.                            **P1 -- High**       **Phase 2**

  7        **Tier Anniversary Bonus**      Members who maintain a tier for a full year receive a configurable anniversary point bonus. Processed nightly by background worker on enrollment anniversary date.                                                            **P2 -- Medium**     **Phase 2**

  8        **Lifetime Tier (VIP)**         Configurable lifetime tier that once achieved, cannot be revoked by inactivity. Members qualify based on lifetime cumulative points, not rolling window. Shown distinctly in UI.                                              **P3 -- Low**        **Phase 3**

**🎁 4. Offers & Rewards**
11 features · Offer types, targeting, eligibility, redemption, and campaign mechanics

  **\#**   **Feature**                        **Description**                                                                                                                                                                                                    **Priority**         **Phase**
  -------- ---------------------------------- ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ -------------------- -------------
  1        **Percentage Discount Offer**      Merchant configures a percent-off redemption (e.g., 10% off next purchase) redeemable by burning a specified number of points or qualifying by tier. Expiry date and usage limit configurable.                     **P0 -- Critical**   **Phase 2**

  2        **Fixed Amount Discount Offer**    Fixed dollar-value reward redeemable at checkout (e.g., \$5 off). Supports minimum purchase threshold. Can be applied as points burn or tier benefit.                                                              **P0 -- Critical**   **Phase 2**

  3        **Free Product / BOGO Offer**      Merchant configures a free product reward tied to a specific SKU or category. Applied at POS or e-commerce checkout via redemption code injected at order level.                                                   **P1 -- High**       **Phase 2**

  4        **Threshold Reward**               Automatic reward issued when member reaches a spend or points threshold within a defined period (e.g., spend \$200 in a month, get a \$20 reward). Processed by background worker.                                 **P1 -- High**       **Phase 2**

  5        **Personalized Offer Targeting**   Merchants can target offers to specific member segments: tier, enrollment date range, last purchase date, category affinity, or custom tags. Targeting rules stored as condition JSON on the offer record.         **P2 -- Medium**     **Phase 2**

  6        **Offer Eligibility Check**        API endpoint returns a member's currently eligible offers at time of checkout. Used by POS and e-commerce to display available rewards before tender. Evaluated in real time against member profile and ledger.   **P1 -- High**       **Phase 2**

  7        **Offer Redemption**               Member selects an offer to redeem at checkout. System validates eligibility, deducts points or applies tier benefit, records redemption, and issues promo code or direct discount instruction to channel.          **P0 -- Critical**   **Phase 2**

  8        **Single-Use Offer Codes**         Generates unique single-use redemption codes for high-value offers. Codes validated at redemption to prevent reuse. Bulk code generation available for campaign distribution.                                      **P2 -- Medium**     **Phase 2**

  9        **Offer Stacking Rules**           Merchant configures whether multiple offers can be combined in a single transaction. Default is single offer per transaction; stacking enabled per offer type or globally per tenant.                              **P2 -- Medium**     **Phase 3**

  10       **Flash Offers**                   Time-limited offers with a countdown (e.g., valid for 4 hours). Published via push notification and displayed prominently in mobile app. Inventory-limited variants supported.                                     **P2 -- Medium**     **Phase 3**

  11       **Referral Offer**                 Member shares a unique referral link. Referring member earns bonus points when referee completes enrollment and first qualifying purchase. Referee receives enrollment bonus offer.                                **P2 -- Medium**     **Phase 3**

**🔗 5. Channel Integration**
10 features · POS, e-commerce, mobile app, notifications, and webhooks

  **\#**   **Feature**                     **Description**                                                                                                                                                                                                **Priority**         **Phase**
  -------- ------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **POS API Integration**         REST API endpoints optimized for POS terminal integration. Member lookup, transaction submission, and offer redemption supported in three discrete API calls. SDK and integration guide provided.              **P0 -- Critical**   **Phase 1**

  2        **POS Offline Mode Support**    POS terminals can queue transactions locally during connectivity loss. Queued transactions submitted in batch on reconnect. Platform accepts out-of-order transactions using original terminal timestamp.      **P1 -- High**       **Phase 1**

  3        **E-Commerce REST API**         Full platform capabilities exposed via REST API for server-side e-commerce integration. Covers enrollment at account creation, points earn at order placement, and redemption at checkout.                     **P0 -- Critical**   **Phase 1**

  4        **E-Commerce JavaScript SDK**   Client-side SDK for common e-commerce platforms (Shopify, WooCommerce, Salesforce Commerce Cloud). Handles member identification, balance display, and offer widget rendering.                                 **P1 -- High**       **Phase 2**

  5        **Consumer Mobile API**         Dedicated API endpoints for consumer mobile app: member profile, points balance, transaction history, tier progress, available offers, and push notification opt-in management.                                **P0 -- Critical**   **Phase 2**

  6        **Mobile Push Notifications**   Push notifications dispatched via Azure Notification Hubs on: points earned, tier change, offer available, points expiry warning, birthday bonus. Member controls per-type opt-in preferences.                 **P1 -- High**       **Phase 2**

  7        **Email Notifications**         Transactional emails for: enrollment confirmation, points earned summary (weekly digest), tier upgrade/downgrade, offer expiry reminder, GDPR deletion confirmation. Template-based, tenant-brandable.         **P1 -- High**       **Phase 1**

  8        **SMS Notifications**           SMS alerts for: enrollment confirmation with balance, tier promotion, offer redemption confirmation. Delivered via Azure Communication Services. Member can opt out per-channel.                               **P2 -- Medium**     **Phase 2**

  9        **Webhook Event Delivery**      Merchants register webhook URLs to receive real-time platform events. Delivery signed with HMAC-SHA256. Retry policy: exponential backoff across 5 attempts. Dead-letter dashboard for failed deliveries.      **P1 -- High**       **Phase 1**

  10       **White-Label Mobile Shell**    React Native mobile app shell that merchants can brand with logo, colors, and custom splash screen. Connects to tenant API with no code changes. Published to App Store / Play Store under merchant account.   **P2 -- Medium**     **Phase 3**

**⚙️ 6. Merchant Admin**
10 features · Dashboard, program config, member management, RBAC, and branding

  **\#**   **Feature**                         **Description**                                                                                                                                                                                                        **Priority**         **Phase**
  -------- ----------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **Merchant Admin Dashboard**        Web-based admin portal for merchant users. Role-based access control with Owner, Manager, and Analyst roles. Displays real-time KPI summary, recent enrollments, and active offer performance.                         **P0 -- Critical**   **Phase 1**

  2        **Loyalty Program Configuration**   Merchants configure their loyalty program: program name, earn rate, tier definitions, point expiry rules, and default notification templates. Changes take effect immediately; version history retained.               **P0 -- Critical**   **Phase 1**

  3        **Offer Management**                Admin UI for creating, editing, scheduling, and deactivating offers. Supports preview mode to validate offer logic before activation. Offer performance (impressions, redemptions, revenue impact) displayed inline.   **P1 -- High**       **Phase 2**

  4        **Member Management UI**            Admin UI for member search, profile view, points adjustment, tier override, status change, and GDPR deletion. All admin actions require confirmation and log to audit trail.                                           **P1 -- High**       **Phase 1**

  5        **Role-Based Access Control**       Owner: full access including billing and API key management. Manager: member and offer management. Analyst: read-only reporting access. Custom roles configurable in Phase 3.                                          **P1 -- High**       **Phase 1**

  6        **API Key Management**              Merchants generate, rotate, and revoke API keys from admin portal. Each key has a label, creation date, last-used timestamp, and optional expiry. Keys scoped to read-only or read-write.                              **P0 -- Critical**   **Phase 1**

  7        **Webhook Management UI**           Admin UI for registering, testing, and monitoring webhook endpoints. Test delivery sends a sample event payload. Delivery history and DLQ contents viewable per endpoint.                                              **P1 -- High**       **Phase 1**

  8        **Audit Log Viewer**                Admin UI displaying a paginated, filterable log of all admin actions: who did what, to which record, and when. Exportable to CSV. Retention: 2 years.                                                                  **P1 -- High**       **Phase 2**

  9        **Tenant Branding**                 Merchants upload logo, configure brand colors, and set notification sender name/email for all consumer-facing touchpoints (email templates, mobile app header, web widget).                                            **P2 -- Medium**     **Phase 2**

  10       **Multi-Location Support**          Merchants with multiple store locations associate each location with a location ID. Transactions tagged with location ID. Reporting filterable by location or rolled up to program level.                              **P2 -- Medium**     **Phase 2**

**📊 7. Analytics & Reporting**
11 features · KPIs, cohort analysis, offer performance, and data export

  **\#**   **Feature**                         **Description**                                                                                                                                                                                      **Priority**         **Phase**
  -------- ----------------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **Enrollment Analytics**            Dashboard showing total members enrolled, daily/weekly/monthly new enrollment trend, enrollment channel breakdown (POS / web / mobile), and top enrollment locations.                                **P1 -- High**       **Phase 1**

  2        **Points Economy Report**           Summary of total points issued vs. redeemed vs. expired in a period. Breakeven liability calculation (outstanding points * avg redemption value). Trend chart by week/month.                        **P0 -- Critical**   **Phase 1**

  3        **Transaction Analytics**           Total transactions, total spend, average transaction value, points earned per transaction, and channel breakdown. Filterable by date range, tier, channel, and location.                             **P1 -- High**       **Phase 1**

  4        **Tier Distribution Report**        Count and percentage of members at each tier. Tier transition rates (promotions and demotions) over time. Average time-to-tier-upgrade by starting tier.                                             **P1 -- High**       **Phase 2**

  5        **Offer Performance Report**        Per-offer metrics: impressions, redemptions, redemption rate, revenue generated, average discount applied, and cost per redemption. Comparable across offer types.                                   **P1 -- High**       **Phase 2**

  6        **Member Retention Cohort**         Cohort analysis showing retention rate of members enrolled in each month. Tracks % still active (transacted in last 90 days) at 30, 60, 90, 180, and 365-day marks.                                  **P2 -- Medium**     **Phase 2**

  7        **At-Risk Member Identification**   Identifies members who have not transacted in a configurable window (default 60 days) and have a positive points balance. Used to trigger win-back campaigns. Exportable for CRM upload.             **P2 -- Medium**     **Phase 3**

  8        **Revenue Attribution**             Estimates incremental revenue attributable to loyalty program by comparing transaction frequency and basket size before and after enrollment, segmented by tier.                                     **P2 -- Medium**     **Phase 3**

  9        **Custom Report Builder**           Drag-and-drop report builder allowing analysts to select dimensions (tier, channel, location, date) and metrics (transactions, points, redemptions, revenue). Save and schedule report delivery.     **P3 -- Low**        **Phase 3**

  10       **Data Export API**                 Bulk export endpoints for all major entities (members, transactions, ledger, redemptions) as CSV or JSON. Supports incremental export via since timestamp parameter. Used for BI tool integration.   **P2 -- Medium**     **Phase 2**

  11       **Real-Time KPI Dashboard**         Live metrics refreshed every 60 seconds: active members today, transactions today, points issued today, redemptions today. Alert thresholds configurable per metric.                                 **P2 -- Medium**     **Phase 2**

**🏗️ 8. Platform & Infrastructure**
12 features · Multi-tenancy, auth, rate limiting, compliance, and fraud detection

  **\#**   **Feature**                      **Description**                                                                                                                                                                                                       **Priority**         **Phase**
  -------- -------------------------------- --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------- -------------
  1        **Multi-Tenant Provisioning**    Automated tenant onboarding pipeline: control plane record creation, Azure SQL database provisioning, schema migration, API credential generation, and default program config initialization. Target: \< 5 minutes.   **P0 -- Critical**   **Phase 1**

  2        **Tenant Configuration API**     Admin API for programmatic tenant setup and configuration updates. Used by internal ops tooling. Protected by platform-level credentials distinct from merchant API keys.                                             **P0 -- Critical**   **Phase 1**

  3        **Feature Flags (Per-Tenant)**   Platform-level feature flags enable or disable capabilities per tenant (e.g., enable points transfer for Tenant A only). Flags evaluated at runtime; no redeployment required.                                        **P1 -- High**       **Phase 1**

  4        **Rate Limiting**                Per-tenant request rate limits enforced at API Management layer. Default: 1,000 req/min. Configurable per tenant tier. Rate limit headers returned on all responses. Exceeding limit returns HTTP 429.                **P0 -- Critical**   **Phase 1**

  5        **API Versioning**               All public API endpoints versioned under /v1/. Breaking changes require a new version. Deprecated versions supported for 12 months after new version GA. Sunset date communicated via response header.                **P1 -- High**       **Phase 1**

  6        **Authentication (B2B)**         OAuth 2.0 client credentials flow for server-to-server integration (POS, e-commerce). JWTs issued by Azure AD B2C; 1-hour expiry; refresh not required (stateless client credential grant).                           **P0 -- Critical**   **Phase 1**

  7        **Authentication (Consumer)**    OAuth 2.0 PKCE flow for consumer mobile app. Azure AD B2C issues member-scoped JWTs. Supports social login (Google, Apple) in Phase 2. MFA optional, configurable per tenant.                                         **P0 -- Critical**   **Phase 2**

  8        **Health & Status API**          Public status endpoint returning platform health, current incidents, and scheduled maintenance windows. Each service reports a health status. Feeds into merchant admin dashboard status indicator.                   **P1 -- High**       **Phase 1**

  9        **Sandbox Environment**          Each tenant has access to a sandbox instance with identical API surface, seeded test data, and simulated background workers. Sandbox transactions never affect production ledger.                                     **P1 -- High**       **Phase 1**

  10       **Idempotent API Operations**    All write endpoints accept an Idempotency-Key header. Duplicate requests with the same key within a 24-hour window return the original response without re-processing. Prevents double-points on retry.               **P0 -- Critical**   **Phase 1**

  11       **Compliance: GDPR / CCPA**      Data deletion, data export, consent logging, and data residency configuration. PII fields encrypted at rest. Processing records maintained per GDPR Article 30. DPA template available for merchant countersigning.   **P0 -- Critical**   **Phase 1**

  12       **ML-Based Fraud Detection**     Anomaly detection model flags suspicious earn patterns: velocity abuse, bulk enrollment + redemption, and coordinated refund-and-resubmit schemes. Flagged transactions quarantined for manual review.                **P2 -- Medium**     **Phase 3**