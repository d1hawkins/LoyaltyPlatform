# Admin Portal — HANDOFF (A-19 / T-19)

Admin Dashboard Frontend — React SPA for merchant administration of the Loyalty Platform.

## Quick Start

```bash
cd apps/admin-portal
npm install
npm run dev        # http://localhost:5173
```

In dev mode the portal runs with `SKIP_AUTH` enabled — no real authentication required.
The Vite dev server proxies `/v1/admin/*` to `http://localhost:3005` (admin-api) and
`/v1/analytics/*` to `http://localhost:3006` (analytics-service).

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `VITE_API_URL` | Admin API base path | `/v1/admin` |
| `VITE_ANALYTICS_URL` | Analytics service base path | `/v1/analytics` |
| `VITE_TENANT_ID` | Tenant ID for dev mode | `11111111-1111-1111-1111-111111111111` |
| `VITE_AUTH_MODE` | `skip` (dev) or `b2c` (production) | `skip` |
| `VITE_USER_ID` | Dev user ID | `dev-admin` |
| `VITE_USER_ROLE` | Dev user role (`owner`, `manager`, `analyst`) | `owner` |

## Tech Stack

- Vite 6 + React 18 + TypeScript
- Tailwind CSS 3 (slate/gray base with blue accent)
- React Router 6 (client-side routing)
- TanStack React Query 5 (server state management)
- Recharts (line, bar, pie charts)

## Page Inventory

| Route | Component | Description |
|---|---|---|
| `/` | `Dashboard` | KPI summary cards (active members, transactions, points issued, redemptions today), derived metrics (avg transaction value, redemption rate, enrollment growth), enrollment trend chart, recent activity feed |
| `/members` | `MemberList` | Search + filter by status/tier, paginated table with cursor pagination, CSV export |
| `/members/:id` | `MemberDetail` | Profile header, points balance, tier, status badge. Actions: adjust points, override tier, change status, GDPR delete. Points ledger with pagination |
| `/transactions` | `TransactionList` | Paginated transaction table with channel, amount, points, status |
| `/tiers` | `TierConfig` | CRUD for tier definitions — create (owner), edit (manager), deactivate (owner). Sorted by sort order |
| `/offers` | `OfferList` | Phase 2 stub with banner. Probes offer-service availability. UI framework built |
| `/program` | `ProgramConfig` | Edit program name, earn rate, points expiry, void window, currency, timezone. Manager+ role |
| `/webhooks` | `WebhookList` | Register, test, delete webhooks. View delivery history per webhook. Event type selection |
| `/apikeys` | `ApiKeyList` | Generate (plaintext shown once with copy-to-clipboard + save warning), revoke. Owner role only |
| `/analytics` | `AnalyticsOverview` | Enrollment trend (bar), transaction volume (line), points economy (bar + liability), tier distribution (pie + table) |
| `/audit` | `AuditLog` | Filterable by entity, action, date range. Paginated table. CSV export |
| `/settings` | `Branding` | Logo URL with preview, primary/secondary colors with pickers, sender name/email |

## API Client Configuration

The `AdminApiClient` class in `src/api/client.ts` wraps all fetch calls with:
- `X-Tenant-ID`, `X-User-ID`, `X-User-Role` headers (dev mode)
- `Authorization: Bearer <token>` (B2C mode)
- RFC 7807 Problem Details error parsing
- Cursor pagination support

### Backend endpoints consumed

**Admin API** (port 3005, `/v1/admin`):
- Program: GET/PUT `/program`, GET `/program/version-history`
- Tiers: GET/POST `/tiers`, PUT/DELETE `/tiers/:id`
- Members: GET `/members/search`, GET `/members/:id`, GET `/members/export.csv`, POST adjust/tier-override/status/gdpr-delete
- API Keys: GET/POST/DELETE `/apikeys`
- Webhooks: GET/POST/PUT/DELETE `/webhooks`, POST test, GET deliveries
- Audit: GET `/audit`, GET `/audit/export.csv`
- Feature Flags: GET/PUT `/feature-flags`
- Branding: GET/PUT `/branding`

**Analytics Service** (port 3006, `/v1/analytics`):
- GET `/summary`, `/kpi/realtime`, `/enrollment`, `/transactions`, `/points-economy`, `/tier-distribution`, `/retention-cohort`

## Auth Swap Guide (SKIP_AUTH to MSAL.js)

The `AuthProvider` in `src/auth/AuthProvider.tsx` contains inline comments documenting the swap path:

1. Install `@azure/msal-browser` and `@azure/msal-react`
2. Configure MSAL with:
   - `clientId`: B2C_B2B_CLIENT_ID from Key Vault
   - `authority`: `https://{B2C_TENANT_NAME}.b2clogin.com/{B2C_TENANT_NAME}.onmicrosoft.com/B2C_1A_SignUpOrSignin`
   - `knownAuthorities`: `['{B2C_TENANT_NAME}.b2clogin.com']`
3. Wrap `<App />` with `<MsalProvider>`
4. Replace hardcoded user with JWT claims (`tenantId`, `sub`, `roles`, `name`, `email`)
5. Pass bearer token to `AdminApiClient` constructor
6. Set `VITE_AUTH_MODE=b2c` in production env
7. Remove `VITE_USER_ID`, `VITE_USER_ROLE`, `VITE_TENANT_ID` from production config

## Role-Based Access

The portal hides UI elements based on the user's role:

| Area | analyst | manager | owner |
|---|---|---|---|
| Dashboard, Members (read), Transactions, Tiers (list), Analytics, Audit | Yes | Yes | Yes |
| Program config, Webhooks, Offers, Branding, Status/points/tier actions | No | Yes | Yes |
| API Keys, Tier create/delete, GDPR confirm, Feature flags | No | No | Yes |

The backend is authoritative and will 403 anything the client does not hide.

## Deployment: Azure Static Web Apps

### Setup Steps

1. Create SWA resource:
   ```bash
   az staticwebapp create \
     --name loyalty-admin-portal \
     --resource-group loyalty-platform-dev \
     --sku Standard \
     --location eastus2
   ```

2. Get deployment token:
   ```bash
   az staticwebapp secrets list --name loyalty-admin-portal --resource-group loyalty-platform-dev
   ```

3. Add token as GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN_ADMIN_PORTAL`

4. Uncomment the Azure deployment step in `.github/workflows/deploy-admin-portal.yml`

5. Configure custom domain (optional) and environment variables in Azure Portal

### SPA routing
`staticwebapp.config.json` configures fallback to `index.html` for all routes (SPA routing).

## Build

```bash
npm run build    # produces dist/ — 0 TypeScript errors
npm run lint     # ESLint checks (when configured)
```

Build output: ~700KB JS (195KB gzipped) including React, React Router, TanStack Query, and Recharts.

## Graceful Degradation

- Analytics API errors: charts show "No data available" placeholder
- Offer service unreachable: shows Phase 2 banner with service status
- API errors: parsed as RFC 7807 Problem Details and surfaced to the user
- ErrorBoundary wraps the entire app for uncaught errors
