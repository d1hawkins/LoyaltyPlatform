# Loyalty Platform — Feature Catalog

> 131 features across 8 domains · Priority-ranked (P0-P3) · Phase-mapped (Phase 1-4)
> Version 2.0 · April 2026 · CONFIDENTIAL
> Updated to reflect actual platform state as of 2026-04-24

## Priority Legend
- **P0 - Critical**: Must-have for launch. Blocks go-live if missing.
- **P1 - High**: High value; target for same phase as P0.
- **P2 - Medium**: Important but deferrable to next phase.
- **P3 - Low**: Nice-to-have; included when capacity allows.

## Phase Legend
- **Phase 1** (Months 0-3): Core platform + Daiso USA launch
- **Phase 2** (Months 3-6): Offers, mobile app, e-commerce SDK
- **Phase 3** (Months 6-12): Advanced features, fraud, white-label
- **Phase 4** (Months 12+): Coalition, marketplace, partner ecosystem

## Status Legend
- **Implemented** - Code exists, deployed, and verified working
- **Partial** - Partially implemented or functional with known limitations
- **Planned** - Not yet built
- **Deferred** - Explicitly deferred to future phase

---

## Feature Summary

| Domain | Original | New | Total | Implemented | Partial | Planned | Deferred |
|--------|----------|-----|-------|-------------|---------|---------|----------|
| 1. Member Management | 10 | 5 | 15 | 13 | 0 | 0 | 2 |
| 2. Points Engine | 11 | 4 | 15 | 13 | 0 | 0 | 2 |
| 3. Tier Management | 8 | 0 | 8 | 7 | 0 | 0 | 1 |
| 4. Offers & Rewards | 11 | 5 | 16 | 14 | 0 | 0 | 2 |
| 5. Channel Integration | 10 | 4 | 14 | 12 | 0 | 0 | 2 |
| 6. Merchant Admin | 10 | 9 | 19 | 18 | 0 | 0 | 1 |
| 7. Analytics & Reporting | 11 | 11 | 22 | 21 | 0 | 0 | 1 |
| 8. Platform & Infrastructure | 12 | 7 | 19 | 17 | 0 | 0 | 2 |
| **Total** | **83** | **48** (new) | **131** (original) | **115** | **0** | **0** | **13** (deferred) |

---

## 1. Member Management
15 features · Core member lifecycle: enrollment, profile, identity, portal, and compliance

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Member Enrollment** | Self-service and assisted enrollment across POS, web, and mobile. Captures email, phone, optional demographic fields. Generates unique member ID. Supports real-time duplicate detection by email and phone. | P0 - Critical | Phase 1 | **Implemented** |
| 2 | **Member Profile Management** | Members can view and update name, contact details, communication preferences, and linked accounts. Merchants can view and edit member records via admin portal with full audit trail. | P0 - Critical | Phase 1 | **Implemented** |
| 3 | **Member Lookup at POS** | Real-time member identification by phone number or loyalty card scan. Returns member name, tier, points balance, and eligible offers in a single low-latency API call (< 100ms target). | P0 - Critical | Phase 1 | **Implemented** |
| 4 | **Member Search (Admin)** | Merchant admin can search members by name, email, phone, member ID, or tier. Results paginated with export to CSV. Supports bulk actions (points adjustment, tier override, status change). | P1 - High | Phase 1 | **Implemented** |
| 5 | **Member Status Management** | Merchants can mark members as active, suspended, or closed. Suspended members cannot earn or redeem. Closed members trigger PII scrub pipeline. All status changes logged with reason code. | P1 - High | Phase 1 | **Implemented** |
| 6 | **Linked Accounts** | Members can link multiple contact identifiers (email + phone + loyalty card barcode) to a single member record. All identifiers resolve to the same member at lookup. | P2 - Medium | Phase 2 | **Implemented** |
| 7 | **Member Merge** | Admin-initiated merge of duplicate member records. Ledger entries from both records are consolidated under the surviving member ID. Merged record is tombstoned with reference to survivor. | P2 - Medium | Phase 2 | **Implemented** |
| 8 | **Household / Family Accounts** | Primary member can invite secondary members to link accounts. Points earned by household members optionally pool to primary balance (configurable per tenant). | P3 - Low | Phase 3 | **Deferred** |
| 9 | **GDPR / CCPA Data Deletion** | Member-initiated or admin-initiated deletion triggers soft delete immediately and async PII scrub within 30 days. Ledger entries are retained with PII replaced by anonymized tokens for audit integrity. | P0 - Critical | Phase 1 | **Implemented** |
| 10 | **Data Export (Member)** | Member can request a full data export (profile, transaction history, points history) in JSON or CSV format. Delivered via secure download link. Required for GDPR compliance. | P1 - High | Phase 2 | **Implemented** |
| 11 | **Customer Member Portal** | Web-based member portal with phone-number login. Dashboard displays points balance, tier status, transaction history, available offers, and profile management. | P1 - High | Phase 2 | **Implemented** |
| 12 | **Visit Statistics Display** | Member portal shows total visits, visits this month, and current day streak. Computed from transaction history in real time. | P2 - Medium | Phase 2 | **Implemented** |
| 13 | **Collapsible Transaction Details** | Transaction history entries expand to show item list, store name, associate name, order reference, and channel. Enhances member self-service. | P2 - Medium | Phase 2 | **Implemented** |
| 14 | **Remember-Me / Auto-Login** | Member portal supports localStorage-based auto-login so returning members bypass phone entry. Configurable session duration. | P2 - Medium | Phase 2 | **Implemented** |
| 15 | **Self-Service GDPR Delete via Portal** | Members can initiate their own data deletion request directly from the member portal without contacting support. Triggers the standard GDPR deletion pipeline. | P1 - High | Phase 2 | **Implemented** |

---

## 2. Points Engine
15 features · Earn, ledger, multipliers, expiry, visits, and balance management

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Base Points Earn** | Members earn points on every qualifying purchase. Base earn rate is configurable per tenant (e.g., 1 point per $1 spent). Calculated at transaction submission; posted to ledger immediately. | P0 - Critical | Phase 1 | **Implemented** |
| 2 | **Category Multipliers** | Merchants can configure bonus earn rates for specific product categories or SKUs (e.g., 3x points on vitamins). Multipliers stack additively with promotional multipliers up to a configurable cap. | P1 - High | Phase 1 | **Implemented** |
| 3 | **Promotional Multipliers** | Time-bound earn multiplier promotions (e.g., double points weekends). Configured with start/end datetime, applicable member tiers, and channel restrictions. Multiple promotions can run concurrently. | P1 - High | Phase 1 | **Implemented** |
| 4 | **Points Ledger** | Immutable double-entry ledger records every points credit and debit. Balances are computed from ledger history; no mutable balance column. Supports full audit replay and retroactive correction. | P0 - Critical | Phase 1 | **Implemented** |
| 5 | **Transaction Void / Reversal** | Voiding a transaction automatically reverses the associated points ledger entries. If reversal would push balance negative, system flags for manual review. Void window configurable per tenant. | P0 - Critical | Phase 1 | **Implemented** |
| 6 | **Manual Points Adjustment** | Admin can credit or debit points to a member account with a mandatory reason code and notes field. All manual adjustments are logged with admin user identity and timestamped. | P1 - High | Phase 1 | **Implemented** |
| 7 | **Points Expiry** | Configurable rolling expiry window per tenant (e.g., points expire 12 months after earn date). Expiry processed nightly by background worker. Members notified 30 and 7 days before expiry. V13 migration adds expiry columns. | P1 - High | Phase 2 | **Implemented** |
| 8 | **Points Balance Cache** | Current points balance served from Redis cache for sub-5ms reads at POS checkout. Cache invalidated on every ledger write. Fallback to live ledger sum on cache miss. | P0 - Critical | Phase 1 | **Implemented** |
| 9 | **Bonus Points Events** | Merchants can define non-purchase earn triggers: birthday bonus, enrollment bonus, referral bonus, review submission, app download. Each trigger type has a configurable point value and one-time vs. recurring flag. | P2 - Medium | Phase 2 | **Implemented** |
| 10 | **Points Transfer** | Member-to-member points transfer within the same tenant. Requires admin-enabled feature flag per tenant. Minimum transfer amount enforced. Transfers logged in both member ledgers. | P3 - Low | Phase 3 | **Deferred** |
| 11 | **Cross-Tenant Earn (Coalition)** | Members can earn points at participating retailer tenants and have them credited to a single coalition balance. Requires coalition configuration and inter-tenant settlement reconciliation. | P3 - Low | Phase 4 | **Deferred** |
| 12 | **Per-Visit Earn Mode** | Flat points awarded per qualifying transaction (visit) instead of per-dollar. Program-level configuration toggle between per-dollar and per-visit earn modes. | P1 - High | Phase 2 | **Implemented** |
| 13 | **Visit Qualification Rules** | Configurable rules that determine whether a transaction counts as a qualifying visit: minimum spend threshold, minimum item count, maximum visits per day. | P1 - High | Phase 2 | **Implemented** |
| 14 | **Per-Transaction vs Per-Day Visit Counting** | Configurable visit counting mode: each qualifying transaction counts as a visit, or only one visit per calendar day regardless of transaction count. | P2 - Medium | Phase 2 | **Implemented** |
| 15 | **Earn Mode Toggle** | Program-level configuration switch between per-dollar earn and per-visit earn. Stored in program_config; changes take effect immediately for new transactions. | P1 - High | Phase 2 | **Implemented** |

---

## 3. Tier Management
8 features · Tier definition, automatic promotion/demotion, benefits enforcement

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Tier Definition** | Merchants configure up to 6 tiers per program. Each tier has a name, entry threshold (rolling 12-month points), multiplier bonus, and a JSON benefits definition. | P0 - Critical | Phase 1 | **Implemented** |
| 2 | **Automatic Tier Promotion** | Background worker evaluates member tier eligibility after every points.earned event. Promotes member and publishes tier.upgraded event when rolling 12-month points cross the next tier threshold. | P0 - Critical | Phase 1 | **Implemented** |
| 3 | **Automatic Tier Demotion** | Annual tier review (configurable cadence) evaluates rolling 12-month points against retention thresholds. Members who fall below are demoted. 30-day advance warning notification sent. | P1 - High | Phase 1 | **Implemented** |
| 4 | **Tier Override (Admin)** | Admin can manually promote or demote a member tier with a mandatory reason code. Override is logged and distinguished from automatic tier changes in reporting. | P1 - High | Phase 1 | **Implemented** |
| 5 | **Tier Benefits Enforcement** | At redemption and checkout, Offer Service reads the member's current tier and applies applicable benefits automatically. Benefits defined in tier config JSON. | P1 - High | Phase 1 | **Implemented** |
| 6 | **Tier Progress Display** | Consumer-facing API endpoint returns member's current tier, points to next tier, percentage progress, and benefit comparison between current and next tier. | P1 - High | Phase 2 | **Implemented** |
| 7 | **Tier Anniversary Bonus** | Members who maintain a tier for a full year receive a configurable anniversary point bonus. Processed nightly by background worker on enrollment anniversary date. | P2 - Medium | Phase 2 | **Implemented** |
| 8 | **Lifetime Tier (VIP)** | Configurable lifetime tier that once achieved, cannot be revoked by inactivity. Members qualify based on lifetime cumulative points. | P3 - Low | Phase 3 | **Deferred** |

---

## 4. Offers & Rewards
16 features · Offer types, targeting, eligibility, redemption, visits, and campaign mechanics

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Percentage Discount Offer** | Merchant configures a percent-off redemption (e.g., 10% off next purchase) redeemable by burning points or qualifying by tier. Expiry date and usage limit configurable. | P0 - Critical | Phase 2 | **Implemented** |
| 2 | **Fixed Amount Discount Offer** | Fixed dollar-value reward redeemable at checkout (e.g., $5 off). Supports minimum purchase threshold. Can be applied as points burn or tier benefit. | P0 - Critical | Phase 2 | **Implemented** |
| 3 | **Free Product / BOGO Offer** | Merchant configures a free product reward tied to a specific SKU or category. Applied at POS or e-commerce checkout via redemption code. | P1 - High | Phase 2 | **Implemented** |
| 4 | **Threshold Reward** | Automatic reward issued when member reaches a spend or points threshold within a defined period. Processed by background worker. | P1 - High | Phase 2 | **Implemented** |
| 5 | **Personalized Offer Targeting** | Merchants can target offers to specific member segments: tier, enrollment date range, last purchase date, category affinity, or custom tags. Targeting rules stored as condition JSON. | P2 - Medium | Phase 2 | **Implemented** |
| 6 | **Offer Eligibility Check** | API endpoint returns a member's currently eligible offers at time of checkout. Used by POS and e-commerce to display available rewards before tender. | P1 - High | Phase 2 | **Implemented** |
| 7 | **Offer Redemption** | Member selects an offer to redeem at checkout. System validates eligibility, deducts points or applies tier benefit, records redemption, and issues discount instruction to channel. | P0 - Critical | Phase 2 | **Implemented** |
| 8 | **Single-Use Offer Codes (Code-Bound)** | Generates unique single-use redemption codes for high-value offers. Visit milestone codes are member-bound: each code is tied to the member who earned it and cannot be redeemed by another member. Codes validated at redemption to prevent reuse. Bulk code generation available. | P2 - Medium | Phase 2 | **Implemented** |
| 9 | **Offer Stacking Rules** | Merchant configures whether multiple offers can be combined in a single transaction. Default is single offer per transaction; stacking enabled per offer type or globally. | P2 - Medium | Phase 3 | **Implemented** |
| 10 | **Flash Offers** | Time-limited offers with a countdown (e.g., valid for 4 hours). Published via push notification and displayed prominently. Inventory-limited variants supported. | P2 - Medium | Phase 3 | **Deferred** |
| 11 | **Referral Offer** | Member shares a unique referral link. Referring member earns bonus points when referee completes enrollment and first qualifying purchase. | P2 - Medium | Phase 3 | **Deferred** |
| 12 | **Visit-Based Offers** | Digital punch card mechanic: N qualifying visits within a time window earns a reward. Progress tracked and displayed to member. V19 migration adds visit columns to offers table. | P1 - High | Phase 2 | **Implemented** |
| 13 | **Visit Qualification on Offers** | Per-offer visit qualification rules: minimum spend, minimum items, eligible channels, and eligible stores. More granular than program-level visit rules. | P1 - High | Phase 2 | **Implemented** |
| 14 | **Free Item Offer Type** | Dedicated offer type for free item rewards with optional SKU restriction and optional maximum value cap. Distinct from BOGO in that no purchase trigger is required. | P1 - High | Phase 2 | **Implemented** |
| 15 | **Visit Progress Tracking** | Member-facing display of visit progress toward visit-based offers (e.g., "5 of 10 visits completed"). Shown in member portal and POS response. | P2 - Medium | Phase 2 | **Implemented** |
| 16 | **Offer Redemption at POS with Discount Preview** | POS receives discount amount preview before finalizing redemption, allowing cashier to confirm before applying. Supports percentage, fixed, and free-item discount types. | P1 - High | Phase 2 | **Implemented** |

---

## 5. Channel Integration
14 features · POS, e-commerce, self-checkout, enrollment, notifications, and webhooks

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **POS API Integration** | REST API endpoints optimized for POS terminal integration. Member lookup, transaction submission, and offer redemption supported. SDK and integration guide provided. | P0 - Critical | Phase 1 | **Implemented** |
| 2 | **POS Offline Mode Support** | POS terminals can queue transactions locally during connectivity loss. Queued transactions submitted in batch on reconnect. Platform accepts out-of-order transactions. | P1 - High | Phase 1 | **Implemented** |
| 3 | **E-Commerce REST API** | Full platform capabilities exposed via REST API for server-side e-commerce integration. Covers enrollment, points earn, and redemption. | P0 - Critical | Phase 1 | **Implemented** |
| 4 | **E-Commerce JavaScript SDK** | Client-side SDK for common e-commerce platforms (Shopify, WooCommerce). Handles member identification, balance display, and offer widget rendering. Published as @loyalty/loyalty-js-sdk. | P1 - High | Phase 2 | **Implemented** |
| 5 | **Consumer Mobile API** | Dedicated API endpoints for consumer mobile app: member profile, points balance, transaction history, tier progress, available offers, and push notification opt-in management. | P0 - Critical | Phase 2 | **Implemented** |
| 6 | **Mobile Push Notifications** | Push notifications dispatched via Azure Notification Hubs on key events. Member controls per-type opt-in preferences. V15 migration adds device_registrations table. | P1 - High | Phase 2 | **Implemented** |
| 7 | **Email Notifications** | Transactional emails for enrollment confirmation, points earned summary, tier changes, offer reminders, and GDPR deletion confirmation. Template-based, tenant-brandable. 5 email templates. | P1 - High | Phase 1 | **Implemented** |
| 8 | **SMS Notifications** | SMS alerts for enrollment confirmation, tier promotion, and offer redemption. Delivered via Azure Communication Services. Member can opt out per-channel. | P2 - Medium | Phase 2 | **Implemented** |
| 9 | **Webhook Event Delivery** | Merchants register webhook URLs to receive real-time platform events. HMAC-SHA256 signed. Exponential backoff retry (5 attempts). Dead-letter dashboard for failed deliveries. | P1 - High | Phase 1 | **Implemented** |
| 10 | **White-Label Mobile Shell** | React Native mobile app shell that merchants can brand with logo, colors, and custom splash screen. Published under merchant account. | P2 - Medium | Phase 3 | **Deferred** |
| 11 | **Self-Checkout Kiosk** | Portrait-oriented kiosk interface with phone keypad entry. 5-step flow: identify, earn, redeem, confirm, receipt. Designed for unattended self-checkout terminals. | P1 - High | Phase 2 | **Implemented** |
| 12 | **Customer Enrollment Page** | Standalone brandable enrollment page accessible via URL. Supports URL parameters for merchant branding. Used for in-store QR code enrollment campaigns. | P1 - High | Phase 2 | **Implemented** |
| 13 | **Transaction Enrichment** | Transactions accept enrichment fields: storeId, storeName, registerId, associateId, associateName, sourceChannel, sourceSystem, orderRef, and freeform metadata JSON. V18 migration. | P1 - High | Phase 2 | **Implemented** |
| 14 | **POS Store/Associate/Register Configuration** | Admin panel for configuring store locations, register IDs, and associate names used in transaction enrichment. Enables per-store and per-associate reporting. | P2 - Medium | Phase 2 | **Implemented** |

---

## 6. Merchant Admin
19 features · Dashboard, program config, member management, RBAC, offers, and branding

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Merchant Admin Dashboard** | Web-based admin portal (React SPA, Vite build). Role-based access control. Displays real-time KPI summary, recent enrollments, and active offer performance. 21 page components. | P0 - Critical | Phase 1 | **Implemented** |
| 2 | **Loyalty Program Configuration** | Merchants configure program name, earn rate, tier definitions, point expiry rules, and notification templates. Changes take effect immediately; version history retained. | P0 - Critical | Phase 1 | **Implemented** |
| 3 | **Offer Management** | Admin UI for creating, editing, scheduling, and deactivating offers. Supports preview mode. Offer performance displayed inline. | P1 - High | Phase 2 | **Implemented** |
| 4 | **Member Management UI** | Admin UI for member search, profile view, points adjustment, tier override, status change, and GDPR deletion. All admin actions require confirmation and log to audit trail. | P1 - High | Phase 1 | **Implemented** |
| 5 | **Role-Based Access Control** | Owner: full access including billing and API key management. Manager: member and offer management. Analyst: read-only reporting access. | P1 - High | Phase 1 | **Implemented** |
| 6 | **API Key Management** | Merchants generate, rotate, and revoke API keys from admin portal. Each key has label, creation date, last-used timestamp, and optional expiry. Read-only or read-write scoping. | P0 - Critical | Phase 1 | **Implemented** |
| 7 | **Webhook Management UI** | Admin UI for registering, testing, and monitoring webhook endpoints. Test delivery sends sample event payload. Delivery history and DLQ contents viewable. | P1 - High | Phase 1 | **Implemented** |
| 8 | **Audit Log Viewer** | Admin UI displaying paginated, filterable log of all admin actions. Exportable to CSV. Retention: 2 years. | P1 - High | Phase 2 | **Implemented** |
| 9 | **Tenant Branding** | Merchants upload logo, configure brand colors, and set notification sender name/email for all consumer-facing touchpoints. | P2 - Medium | Phase 2 | **Implemented** |
| 10 | **Multi-Location Support** | Merchants with multiple store locations associate each with a location ID. Transactions tagged with location. Reporting filterable by location. | P2 - Medium | Phase 2 | **Implemented** |
| 11 | **Earn Mode Configuration UI** | Admin toggle between per-dollar and per-visit earn modes. Shows current mode with explanation. Changes saved to program_config immediately. | P1 - High | Phase 2 | **Implemented** |
| 12 | **Promotional Multipliers UI** | Admin interface for creating time-bound bonus multipliers with start/end dates, tier restrictions, and channel filters. Calendar view of active promotions. | P1 - High | Phase 2 | **Implemented** |
| 13 | **Category & SKU Multipliers UI** | Admin interface for configuring permanent category and SKU-level earn multipliers. Supports bulk import and individual entry. | P1 - High | Phase 2 | **Implemented** |
| 14 | **Free Item Offer Creation** | Dedicated offer creation flow for free-item rewards with optional SKU field and optional max value cap. Type-specific form fields in create offer modal. | P1 - High | Phase 2 | **Implemented** |
| 15 | **Visit-Based Offer Creation** | Admin flow for creating visit-based (punch card) offers with configurable visit count, time window, and per-offer qualification rules. | P1 - High | Phase 2 | **Implemented** |
| 16 | **Transaction Enrichment Columns & Filters** | Transaction list in admin portal displays enrichment fields (store, associate, register, channel) with column filtering and sorting. | P2 - Medium | Phase 2 | **Implemented** |
| 17 | **Member PII Decryption in Admin View** | Admin users with appropriate role can decrypt and view member PII (phone, email) in member detail view. Decryption events logged to audit trail. | P1 - High | Phase 2 | **Implemented** |
| 18 | **Documentation & API Reference Links** | Admin portal sidebar includes links to developer documentation site and Swagger UI. Contextual help links on key pages. | P2 - Medium | Phase 2 | **Implemented** |
| 19 | **Create Offer Modal with Type-Specific Fields** | Unified offer creation modal that adapts form fields based on selected offer type (percentage, fixed, free item, visit-based). Validation rules per type. | P1 - High | Phase 2 | **Deferred** |

---

## 7. Analytics & Reporting
22 features · KPIs, finance reports, marketing analytics, operations, and data export

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Enrollment Analytics** | Dashboard showing total members enrolled, daily/weekly/monthly trend, enrollment channel breakdown, and top enrollment locations. | P1 - High | Phase 1 | **Implemented** |
| 2 | **Points Economy Report** | Summary of total points issued vs. redeemed vs. expired. Breakeven liability calculation. Trend chart by week/month. | P0 - Critical | Phase 1 | **Implemented** |
| 3 | **Transaction Analytics** | Total transactions, total spend, average transaction value, points earned per transaction, and channel breakdown. Filterable by date range, tier, channel, location. | P1 - High | Phase 1 | **Implemented** |
| 4 | **Tier Distribution Report** | Count and percentage of members at each tier. Tier transition rates over time. Average time-to-upgrade by starting tier. | P1 - High | Phase 2 | **Implemented** |
| 5 | **Offer Performance Report** | Per-offer metrics: impressions, redemptions, redemption rate, revenue generated, average discount, and cost per redemption. | P1 - High | Phase 2 | **Implemented** |
| 6 | **Member Retention Cohort** | Cohort analysis showing retention rate of members enrolled in each month. Tracks % still active at 30, 60, 90, 180, and 365-day marks. | P2 - Medium | Phase 2 | **Implemented** |
| 7 | **At-Risk Member Identification** | Identifies members who have not transacted in a configurable window (default 60 days) with positive points balance. Exportable for CRM upload. | P2 - Medium | Phase 3 | **Implemented** |
| 8 | **Revenue Attribution** | Estimates incremental revenue attributable to loyalty program by comparing transaction frequency and basket size before and after enrollment. | P2 - Medium | Phase 3 | **Implemented** |
| 9 | **Custom Report Builder** | Drag-and-drop report builder allowing analysts to select dimensions and metrics. Save and schedule report delivery. | P3 - Low | Phase 3 | **Deferred** |
| 10 | **Data Export API** | Bulk export endpoints for all major entities as CSV or JSON. Supports incremental export via since timestamp. Used for BI tool integration. | P2 - Medium | Phase 2 | **Implemented** |
| 11 | **Real-Time KPI Dashboard** | Live metrics refreshed every 60 seconds: active members today, transactions today, points issued today, redemptions today. Alert thresholds configurable. | P2 - Medium | Phase 2 | **Implemented** |
| 12 | **Finance: Points Liability Report (ASC 606)** | Calculates outstanding points liability per ASC 606 accounting standards. Shows total outstanding points, estimated redemption value, and period-over-period changes. | P1 - High | Phase 3 | **Implemented** |
| 13 | **Finance: Breakage Estimates** | Estimates percentage of issued points that will never be redeemed (breakage). Uses historical redemption patterns and member activity decay curves. | P1 - High | Phase 3 | **Implemented** |
| 14 | **Finance: Redemption Reserve (Monthly)** | Monthly reserve calculation for expected redemptions based on historical patterns and current outstanding balance. Supports quarterly and annual rollups. | P2 - Medium | Phase 3 | **Implemented** |
| 15 | **Finance: Revenue Attribution** | Detailed revenue attribution report showing loyalty-driven revenue vs. baseline by member segment, tier, and time period. | P2 - Medium | Phase 3 | **Implemented** |
| 16 | **Marketing: Engagement Funnel** | Visualizes member journey from enrollment through first transaction, repeat visit, offer redemption, and tier promotion. Drop-off rates at each stage. | P2 - Medium | Phase 3 | **Implemented** |
| 17 | **Marketing: At-Risk Member Detection** | Automated identification of members trending toward churn based on declining transaction frequency. Feeds into automated win-back campaigns. | P2 - Medium | Phase 3 | **Implemented** |
| 18 | **Marketing: Tier Distribution** | Visual breakdown of member population across tiers with trend lines. Shows tier velocity (promotions vs. demotions per period). | P2 - Medium | Phase 3 | **Implemented** |
| 19 | **Marketing: Offer Performance** | Marketing-focused offer analytics: conversion rates by segment, A/B test results, offer fatigue indicators, and optimal offer frequency. | P2 - Medium | Phase 3 | **Implemented** |
| 20 | **Operations: Visit Analytics** | Visit-specific analytics: qualified visits, conversion rate, daily/weekly trends, average visits per member, and visit qualification failure reasons. | P1 - High | Phase 2 | **Implemented** |
| 21 | **Operations: Program Health Dashboard** | Consolidated program health view: earn/burn ratio, active member percentage, average points per member, and program cost metrics. | P1 - High | Phase 2 | **Implemented** |
| 22 | **Dashboard: Earn Mode Badge & Visit KPIs** | Admin dashboard displays current earn mode (per-dollar or per-visit) as a badge. Visit KPIs shown when in visit mode: total visits, qualified rate, enrollment trend chart. | P2 - Medium | Phase 2 | **Implemented** |

---

## 8. Platform & Infrastructure
19 features · Multi-tenancy, auth, compliance, fraud, documentation, and marketing integrations

| # | Feature | Description | Priority | Phase | Status |
|---|---------|-------------|----------|-------|--------|
| 1 | **Multi-Tenant Provisioning** | Automated tenant onboarding: control plane record creation, Azure SQL database provisioning, schema migration, API credential generation, and default program config. Target: < 5 minutes. | P0 - Critical | Phase 1 | **Implemented** |
| 2 | **Tenant Configuration API** | Admin API for programmatic tenant setup and configuration updates. Protected by platform-level credentials. | P0 - Critical | Phase 1 | **Implemented** |
| 3 | **Feature Flags (Per-Tenant)** | Platform-level feature flags enable or disable capabilities per tenant. Flags evaluated at runtime; no redeployment required. | P1 - High | Phase 1 | **Implemented** |
| 4 | **Rate Limiting** | Per-tenant request rate limits enforced at API Management layer. Default: 1,000 req/min. Configurable per tenant tier. HTTP 429 on exceed. | P0 - Critical | Phase 1 | **Implemented** |
| 5 | **API Versioning** | All public API endpoints versioned under /v1/. Deprecated versions supported for 12 months. Sunset date communicated via response header. | P1 - High | Phase 1 | **Implemented** |
| 6 | **Authentication (B2B)** | OAuth 2.0 client credentials flow for server-to-server integration. JWTs issued by Azure AD B2C; 1-hour expiry. Shared-auth package with 98.97% coverage. | P0 - Critical | Phase 1 | **Implemented** |
| 7 | **Authentication (Consumer)** | OAuth 2.0 PKCE flow for consumer mobile app. Azure AD B2C issues member-scoped JWTs. Social login support. | P0 - Critical | Phase 2 | **Implemented** |
| 8 | **Health & Status API** | Public status endpoint returning platform health per service. Feeds into admin dashboard status indicator. All 8 services report health. | P1 - High | Phase 1 | **Implemented** |
| 9 | **Sandbox Environment** | Each tenant has access to a sandbox instance with identical API surface and seeded test data. Sandbox transactions never affect production ledger. | P1 - High | Phase 1 | **Implemented** |
| 10 | **Idempotent API Operations** | All write endpoints accept Idempotency-Key header. Duplicate requests within 24-hour window return original response. Prevents double-points on retry. | P0 - Critical | Phase 1 | **Implemented** |
| 11 | **Compliance: GDPR / CCPA** | Data deletion, data export, consent logging, data residency configuration. PII fields encrypted at rest via AES-256-GCM (shared-pii package). Processing records per GDPR Article 30. | P0 - Critical | Phase 1 | **Implemented** |
| 12 | **ML-Based Fraud Detection** | Anomaly detection flags suspicious earn patterns: velocity abuse, bulk enrollment + redemption, rapid balance drain, location velocity, duplicate external refs. V14 + V16 migrations. 84 tests, < 20ms benchmark. | P2 - Medium | Phase 3 | **Implemented** |
| 13 | **Marketing Integration: ActiveCampaign** | Contact sync and automation triggers sent to ActiveCampaign on enrollment, tier change, and offer redemption events. Configurable per tenant. | P2 - Medium | Phase 3 | **Implemented** |
| 14 | **Marketing Integration: Klaviyo** | Profile sync and event tracking to Klaviyo. Member profiles synced on enrollment and update. Events fired on transaction, tier change, and offer redemption. | P2 - Medium | Phase 3 | **Implemented** |
| 15 | **SaaS Landing Page** | Public-facing landing page for the loyalty platform. Describes features, pricing tiers, and includes call-to-action for merchant signup. Deployed to Azure Static Web. | P2 - Medium | Phase 4 | **Implemented** |
| 16 | **Developer Documentation Site** | 14-page documentation site covering getting started, authentication, API reference, SDK usage, webhooks, integrations, error codes, and architecture. Plus 5 role-based user guides. | P1 - High | Phase 2 | **Implemented** |
| 17 | **Swagger UI** | Interactive API documentation with 6 OpenAPI specs (member-service, loyalty-engine, offer-service, notification-service, admin-api, analytics-service). Deployed as container. | P1 - High | Phase 2 | **Implemented** |
| 18 | **Demo Guide** | Scripted walkthrough for demonstrating the platform end-to-end. Covers enrollment, earn, redeem, tier promotion, and admin workflows. | P2 - Medium | Phase 2 | **Implemented** |
| 19 | **Role-Based User Guides** | Four targeted user guides: Member Guide, Loyalty Admin Guide, Marketing Admin Guide, and Finance Guide. Each covers the workflows relevant to that role. | P2 - Medium | Phase 2 | **Deferred** |

---

## Appendix: Feature Count Summary

| Metric | Count |
|--------|-------|
| Original features (v1.0) | 83 |
| New features added (v2.0) | 48 |
| **Total features (v2.0)** | **131** |
| Implemented | 115 |
| Partial | 0 |
| Planned | 0 |
| Deferred | 13 |
| P0 - Critical | 27 |
| P1 - High | 52 |
| P2 - Medium | 42 |
| P3 - Low | 7 |
| Domains | 8 |
| Phases | 4 |
