# Azure Cost Reduction — Test Phase

Resource Group: `loyalty-platform-dev`
Subscription: `13e630db-8816-46b8-896e-511fab75a53a` (SNT - David H)

> Completed 2026-06-10. Verified via browser network inspection that the admin
> portal calls App Service URLs directly. Container App API copies had 0 replicas
> and were confirmed idle.

---

## Changes Made

### 1. Deleted 6 duplicate Container App API services

The 6 API services existed as both App Services and Container Apps. The App Services
are actively used (admin portal calls `*.azurewebsites.net`, CI/CD deploys to them).
The Container App copies were created by Bicep but had 0 replicas — no traffic.

- [x] Updated APIM backend named values to point to App Service URLs:
  - `MEMBER_SERVICE_BACKEND_URL` → `https://loyalty-dev-member-service.azurewebsites.net`
  - `LOYALTY_ENGINE_BACKEND_URL` → `https://loyalty-dev-loyalty-engine.azurewebsites.net`
- [x] Deleted `admin-api` (Container App)
- [x] Deleted `analytics-service` (Container App)
- [x] Deleted `loyalty-engine` (Container App)
- [x] Deleted `member-service` (Container App)
- [x] Deleted `notification-service` (Container App)
- [x] Deleted `offer-service` (Container App)
- [x] Verified admin portal still loads and displays data correctly

Kept Container Apps:
- `tier-eval-worker` — background worker (running)
- `webhook-worker` — background worker (running)
- `swagger-ui` — API docs (running)

### 2. Downgraded App Service Plan P1v3 → B1

- [x] Downgraded `loyalty-dev-asp` from P1v3 (PremiumV3, ~$138/mo) to B1 (Basic, ~$13/mo)
- [x] Disabled AlwaysOn on all 6 App Services (not supported on Basic tier)
- [x] Verified all 6 services respond on /health after downgrade
  - Note: containers take longer to cold-start on B1 — allow ~60-90s after restart

### 3. No changes needed (already optimized)

- [x] **APIM** — already on Consumption tier (pay-per-call)
- [x] **Redis** — already on Basic C0 (~$16/mo)
- [x] **SQL** — both databases (`control-plane`, `tenant-daiso-test`) already on Basic tier (5 DTU, ~$5/mo each)
- [x] **Service Bus** — Standard tier (~$10/mo)
- [x] **Container Registry** — Basic tier (~$5/mo)
- [x] **Storage accounts** — all 9 kept (all are part of the active demo suite)

---

## Current Resource Inventory

### Compute
| Resource | Type | Tier | Status |
|----------|------|------|--------|
| loyalty-dev-asp | App Service Plan | B1 Basic | Active — hosts 6 API services |
| loyalty-dev-admin-api | App Service | — | Active |
| loyalty-dev-analytics-service | App Service | — | Active |
| loyalty-dev-loyalty-engine | App Service | — | Active |
| loyalty-dev-member-service | App Service | — | Active |
| loyalty-dev-notification-service | App Service | — | Active |
| loyalty-dev-offer-service | App Service | — | Active |
| tier-eval-worker | Container App | — | Active (1 replica) |
| webhook-worker | Container App | — | Active (1 replica) |
| swagger-ui | Container App | — | Active (1 replica) |

### Data & Messaging
| Resource | Type | Tier |
|----------|------|------|
| loyalty-dev-sql-5rdrqhw | SQL Server | — |
| control-plane | SQL Database | Basic (5 DTU) |
| tenant-daiso-test | SQL Database | Basic (5 DTU) |
| loyalty-dev-redis-5rdrqh | Redis Cache | Basic C0 |
| loyalty-dev-sb-5rdrqh | Service Bus | Standard |

### Storage (9 accounts — all in use for demo)
| Account | Purpose |
|---------|---------|
| loyaltyadminportal | Admin portal static site |
| loyaltydevst5rdrqh | Dev infrastructure storage |
| loyaltydocs | Documentation site |
| loyaltyonboardportal | Onboarding portal |
| loyaltyposdemo | POS demo app |
| loyaltypresentation | Presentation/demo site |
| loyaltyselfcheckout | Self-checkout demo |
| loyaltyenroll | Enrollment portal |
| loyaltylanding | Landing page |

### Other
| Resource | Type | Tier |
|----------|------|------|
| loyalty-dev-apim-5rdrqh | API Management | Consumption |
| loyaltydevacr4a8a43 | Container Registry | Basic |
| loyalty-dev-kv-5rdrqh | Key Vault | Standard |
| loyalty-dev-appi | Application Insights | — |
| loyalty-dev-law | Log Analytics | — |
| loyalty-dev-acs | Communication Service | Pay-per-use |
| loyalty-dev-cae | Container Apps Environment | — |
| loyaltyplatformdev.onmicrosoft.com | Azure AD B2C | Free tier |

---

## Actual Savings

| Change | Before | After | Monthly Savings |
|--------|--------|-------|-----------------|
| Deleted 6 idle Container App APIs | ~$0 (already 0 replicas) | $0 | ~$0 (were not incurring cost) |
| Downgraded App Service Plan P1v3 → B1 | ~$138/mo | ~$13/mo | **~$125/mo** |
| **Total** | | | **~$125/mo** |

> Most resources were already on cost-efficient tiers. The main saving was the
> App Service Plan downgrade. The Container App deletions were cleanup (no cost
> impact since they had 0 replicas).

---

## Future Considerations

- **Migrate to Container Apps entirely** — set `minReplicas: 0` for scale-to-zero,
  eliminating App Service Plan cost (~$13/mo). Requires updating CI/CD pipeline
  (`deploy-services.yml`) and admin portal API URLs.
- **App Service Plan B1 limitations** — no deployment slots, no auto-scale, no
  AlwaysOn. Cold starts take ~60-90s. Upgrade to S1 (~$69/mo) if this becomes
  an issue.

---

## Rollback Notes

- Container Apps: Re-run `infra/container-apps/main.bicep` to recreate
- App Service Plan: `az appservice plan update --name loyalty-dev-asp --resource-group loyalty-platform-dev --sku P1v3`
- AlwaysOn: Re-enable after upgrading plan: `az webapp config set --name <app> --always-on true`
- APIM backends: Revert named values to Container App URLs if Container Apps are recreated
