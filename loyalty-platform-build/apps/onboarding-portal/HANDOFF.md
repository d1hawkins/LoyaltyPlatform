# Onboarding Portal — HANDOFF

## Overview
Self-serve tenant onboarding wizard for prospective retail merchants. Vite + React 18 + TypeScript + Tailwind CSS.

## Run locally
```bash
cd apps/onboarding-portal
npm install
npm run dev    # http://localhost:5174
```

## Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:4000` | Backend onboarding API |
| `VITE_ADMIN_PORTAL_URL` | `http://localhost:5173` | Link to admin portal post-setup |
| `VITE_DOCS_URL` | `/docs` | Integration docs link |

## Wizard steps
1. **Business Information** — company name, type, website, contact, country, locations
2. **Program Setup** — program name, earn rate (1–10 pts/$1), tier toggle + config, expiry toggle + months
3. **Channel Configuration** — POS/e-commerce/mobile checkboxes, terminal count, platform selection
4. **Review & Confirm** — summary + ToS checkbox
5. **Provisioning Progress** — real-time step display → success screen with API key

## Backend integration
The portal calls `POST /api/onboard` with the wizard payload. In dev, a mock server at `/apps/onboarding-portal/api/mock-server.ts` simulates provisioning with a 5-second delay.

**Real integration path:** Wire `POST /api/onboard` to an Azure Function or admin-api endpoint that:
1. Calls `provision-tenant.ts` logic (slug derived from company name)
2. Applies custom program config (earn rate, tiers, expiry)
3. Returns `{tenantId, slug, apiKey, adminPortalUrl}`

## Deployment
- Azure Static Web Apps via `staticwebapp.config.json`
- GitHub Actions: `/.github/workflows/deploy-onboarding-portal.yml`

## Build
```bash
npm run build   # produces dist/ (~250KB gzipped)
```
