# Azure Cost Reduction Checklist — Test Phase

Resource Group: `loyalty-platform-dev`
Subscription: `13e630db-8816-46b8-896e-511fab75a53a`

> Verified: The admin portal (loyaltyadminportal.z20.web.core.windows.net) calls
> App Service URLs directly (*.azurewebsites.net), NOT Container Apps.
> APIM backends point to Container App URLs but are not receiving real traffic.
> CI/CD deploys services to App Services only; workers to Container Apps only.

---

## Phase 1: Remove Duplicate Container App API Services (highest impact)

The 6 API services exist as both App Services and Container Apps. The App Services
are actively used (admin portal calls them, CI/CD deploys to them). The Container
App copies were created by the Bicep infra template but are idle — no traffic is
routed to them.

### Pre-checks

- [ ] Verify APIM is not receiving external traffic (check APIM metrics in portal)
- [ ] If APIM IS receiving traffic, update APIM backend named values to point to App Service URLs before deleting Container Apps:
  - `MEMBER_SERVICE_BACKEND_URL` → `https://loyalty-dev-member-service.azurewebsites.net`
  - `LOYALTY_ENGINE_BACKEND_URL` → `https://loyalty-dev-loyalty-engine.azurewebsites.net`

### Delete idle Container App API services

These are duplicates of the active App Services and are not serving traffic:

- [ ] Delete `admin-api` (Container App)
- [ ] Delete `analytics-service` (Container App)
- [ ] Delete `loyalty-engine` (Container App)
- [ ] Delete `member-service` (Container App)
- [ ] Delete `notification-service` (Container App)
- [ ] Delete `offer-service` (Container App)

### Keep these Container Apps (actively used)

- `tier-eval-worker` — background worker, no App Service equivalent
- `webhook-worker` — background worker, no App Service equivalent
- `swagger-ui` — API docs (optional, low cost)

### Verify

- [ ] Admin portal still loads and displays data correctly
- [ ] Worker Container Apps (tier-eval-worker, webhook-worker) still running

---

## Phase 2: Downgrade App Service Plan

The App Service Plan is on **P1v3 (PremiumV3)** — ~$138/mo per instance, overkill for testing.

- [ ] Check current instance count: Portal > `loyalty-dev-asp` > Scale out
- [ ] Downgrade SKU from P1v3 to **B1 (Basic)** — ~$13/mo
  - Portal > `loyalty-dev-asp` > Scale up > Dev/Test > B1
  - Note: Basic tier does not support deployment slots or auto-scale (not needed for test)
- [ ] Verify all 6 App Services still respond on /health after downgrade

---

## Phase 3: APIM — Already Optimized

APIM (`loyalty-dev-apim-5rdrqh`) is already on **Consumption tier** (confirmed in Bicep).
No action needed — pay-per-call, minimal cost when idle.

- [x] APIM is on Consumption tier — no changes required

---

## Phase 4: Downgrade Redis Cache

- [ ] Check current tier: Portal > `loyalty-dev-redis-5rdrqh` > Pricing tier
- [ ] Note: Downgrading Redis requires creating a new instance (cannot downgrade in-place)
  - [ ] Create new Redis instance on **Basic C0 tier** (~$16/mo)
  - [ ] Update connection string in Key Vault (`loyalty-dev-kv-5rdrqh`) secret `redis-connection-string`
  - [ ] Restart App Services and Container Apps to pick up new connection
  - [ ] Verify points balance caching works (test a transaction in admin portal)
  - [ ] Delete old Redis instance
- [ ] Alternative: If current tier is already C0/C1, skip this step

---

## Phase 5: Downgrade SQL Databases

- [ ] Check current tier of `control-plane` database
- [ ] Check current tier of `tenant-daiso-test` database
- [ ] Downgrade `control-plane` to **Basic tier** (5 DTU, ~$5/mo)
  - Portal > Database > Configure > Basic
- [ ] Downgrade `tenant-daiso-test` to **Basic tier** (5 DTU, ~$5/mo)
- [ ] Verify admin portal dashboard still loads data (it queries analytics + transactions)

---

## Phase 6: Consolidate Storage Accounts

You have 8 storage accounts. For test phase, many are unnecessary.

### Keep (actively used)

- `loyaltyadminportal` — Admin portal static site (confirmed in use)
- `loyaltydevst5rdrqh` — Dev infrastructure storage (referenced in Bicep outputs)

### Verify before removing

- [ ] `loyaltydocs` — Documentation site (linked from admin portal sidebar)
  - Admin portal links to `loyaltydocs.z13.web.core.windows.net` — keep if you use the docs
- [ ] `loyaltyonboardportal` — Onboarding portal for new tenants

### Candidates to delete (demo/presentation, not needed for testing)

For each: confirm not referenced, backup content if needed, then delete.

- [ ] `loyaltyposdemo` — POS demo app
- [ ] `loyaltypresentation` — Presentation/demo site
- [ ] `loyaltyselfcheckout` — Self-checkout demo
- [ ] `loyaltyenroll` — Enrollment portal (if enrollment can be tested via API)
- [ ] `loyaltylanding` — Landing page (marketing, not needed for test)

---

## Phase 7: Verify Remaining Services (low cost, keep as-is)

- [ ] `loyalty-dev-sb-5rdrqh` (Service Bus) — confirm it is on Basic or Standard tier, not Premium (~$668/mo)
- [ ] `loyaltydevacr4a8a43` (Container Registry) — confirm Basic tier (~$5/mo)
- [ ] `loyalty-dev-acs` (Communication Service) — no fixed cost, pay-per-use
- [ ] `loyalty-dev-kv-5rdrqh` (Key Vault) — pennies, no action
- [ ] `loyalty-dev-appi` / `loyalty-dev-law` (App Insights / Log Analytics) — consider setting daily ingestion cap to avoid surprise costs

---

## Estimated Savings Summary

| Change | Before (est.) | After (est.) | Monthly Savings |
|--------|--------------|-------------|-----------------|
| Remove 6 duplicate Container App APIs | ~$100-200/mo | $0 | ~$100-200 |
| Downgrade App Service Plan P1v3 → B1 | ~$138/mo | ~$13/mo | ~$125 |
| Redis downgrade (if C2 → C0) | ~$160/mo | ~$16/mo | ~$145 |
| SQL downgrade x2 (if S2 → Basic) | ~$150/mo | ~$10/mo | ~$140 |
| Remove ~5 storage accounts | ~$25/mo | ~$5/mo | ~$20 |
| **Total** | | | **~$530-630/mo** |

> Actual savings depend on current tier selections. Check each resource in the portal.

---

## Rollback Notes

- Container Apps: Re-run `container-apps/main.bicep` to recreate
- App Service Plan: Scale up instantly from portal (no redeployment needed)
- Redis: New instance required; update Key Vault secret + restart services
- SQL: Scale up instantly from portal
- Storage: Content is permanently deleted — back up before removing
- APIM: Already on Consumption, no changes made

---

## Also Consider: Future Consolidation

Once test phase is stable, consider migrating from App Services to Container Apps
entirely (with `minReplicas: 0` for scale-to-zero). This would eliminate the App
Service Plan cost completely and only charge for actual usage. Requires updating
CI/CD pipeline and admin portal API URLs.
