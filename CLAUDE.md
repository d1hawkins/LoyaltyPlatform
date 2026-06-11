# Loyalty Platform

## Project Structure
- Root: architecture docs and feature catalog (markdown files)
- `loyalty-platform-build/`: Full application codebase (monorepo)
- `loyalty-platform-build/infra/`: Bicep IaC — `main.bicep` is the root deployment
- `loyalty-platform-build/apps/`: Static frontend apps (admin portal, POS demo, enrollment, etc.)
- `loyalty-platform-build/services/`: Backend microservices (Node.js)

## Repository
- Remote: github.com/d1hawkins/LoyaltyPlatform
- Primary branch: main

## Azure Environment
- Subscription: `SNT - David H` (13e630db-8816-46b8-896e-511fab75a53a)
- Resource Group: `loyalty-platform-dev`
- When using `az` CLI, must `az account set --subscription 13e630db-8816-46b8-896e-511fab75a53a` first — it is not the default subscription

### Traffic Flow
- Admin portal (`loyaltyadminportal.z20.web.core.windows.net`) calls App Services directly (`*.azurewebsites.net`), NOT Container Apps
- APIM (`loyalty-dev-apim-5rdrqh`, Consumption tier) backends now point to App Service URLs
- CI/CD (`deploy-services.yml`) deploys 6 API services to App Services, 2 workers to Container Apps

### Compute
- App Service Plan `loyalty-dev-asp`: **B1 Basic** tier (downgraded from P1v3 on 2026-06-10)
- AlwaysOn is **disabled** on all App Services (not supported on Basic tier)
- Cold starts take ~60-90s on B1 after restart
- 6 API services on App Services: admin-api, analytics-service, loyalty-engine, member-service, notification-service, offer-service
- 3 Container Apps: tier-eval-worker, webhook-worker, swagger-ui

### Data
- SQL: Basic tier (5 DTU) — `control-plane` + `tenant-daiso-test` databases on `loyalty-dev-sql-5rdrqhw` (West US 2, not East US — SQL provisioning restricted)
- Redis: Basic C0 (`loyalty-dev-redis-5rdrqh`)
- Service Bus: Standard tier

### Storage Accounts (9 — all part of active demo, do not delete)
- `loyaltyadminportal` — admin portal (East US 2)
- `loyaltydevst5rdrqh` — infra storage
- `loyaltydocs`, `loyaltyonboardportal`, `loyaltyposdemo`, `loyaltypresentation`, `loyaltyselfcheckout`, `loyaltyenroll`, `loyaltylanding` — demo/frontend apps
- Content deployed from `loyalty-platform-build/apps/` directories
- If accidentally deleted, recreate + enable static website + `az storage blob upload-batch` from repo

## Gotchas
- `loyalty-platform-build/` was originally a separate git repo — its `.git` was removed to embed directly. Do not re-initialize a git repo inside it.
- Skip `.DS_Store` files when staging commits.
- Azure subscription context resets between CLI sessions — always set it explicitly.
- B1 App Service Plan does not support: AlwaysOn, deployment slots, auto-scale.
