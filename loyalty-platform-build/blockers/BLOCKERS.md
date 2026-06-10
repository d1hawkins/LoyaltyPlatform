# Blockers Log

## [2026-04-08] B2C tenant creation — RESOLVED (2026-04-09)

**Opened by:** A-01
**Severity:** ~~SOFT~~ RESOLVED
**Owner to unblock:** Human operator (SNT - David H)
**Blocked agent:** A-06 (T-08 — Identity & Auth)

~~Azure AD B2C tenants cannot be provisioned by Bicep/ARM.~~

**Resolution (2026-04-09):** Azure AD B2C is no longer available for new tenants
(deprecated May 1 2025). A **Microsoft Entra External ID (CIAM)** tenant was created
programmatically via the ARM REST API (`Microsoft.AzureActiveDirectory/ciamDirectories`).
App registrations and client secrets were created via the Microsoft Graph API.

**Key finding:** The runbook's claim that "portal required" was incorrect — the CIAM
`ciamDirectories` resource type supports full ARM PUT provisioning. The B2C
`b2cDirectories` type also supports ARM PUT but returns a deprecation error.

**What was provisioned:**
- CIAM Tenant: `loyaltyplatformdev.onmicrosoft.com`
- Tenant ID: `4d90e54d-48b0-404f-a680-595a64f152a3`
- Login endpoint: `loyaltyplatformdev.ciamlogin.com` (note: NOT `b2clogin.com`)
- App registration `loyalty-b2b-api`: client ID `d3eabf52-8216-4cc8-9b54-e130c4d24a5a`
  - Scopes: `members.read`, `members.write`, `transactions.write`, `admin`
  - Identifier URI: `api://loyalty-b2b`
  - Client secret stored in Key Vault (`b2c-b2b-client-secret`, expires 2028-04-09)
- App registration `loyalty-consumer-mobile`: client ID `57a2abcb-7787-4339-b09d-8e4599bf029f`
  - Public client (PKCE), redirect URIs: `loyalty://callback`, `https://localhost:3000/callback`

**Key Vault secrets set** (vault: `loyalty-dev-kv-5rdrqh`):
- `b2c-tenant-id` = `4d90e54d-48b0-404f-a680-595a64f152a3`
- `b2c-tenant-name` = `loyaltyplatformdev.onmicrosoft.com`
- `b2c-b2b-client-id` = `d3eabf52-8216-4cc8-9b54-e130c4d24a5a`
- `b2c-b2b-client-secret` = (stored, expires 2028-04-09)
- `b2c-consumer-client-id` = `57a2abcb-7787-4339-b09d-8e4599bf029f`
- `b2c-jwks-uri` = `https://loyaltyplatformdev.ciamlogin.com/.../discovery/v2.0/keys`
- `b2c-issuer-b2b` = `https://4d90e54d-...ciamlogin.com/.../v2.0`
- `b2c-issuer-consumer` = (same as b2b)

**APIM named values updated:**
- `B2C_JWKS_URI` -> OpenID Connect metadata endpoint
- `B2C_ISSUER` -> CIAM issuer
- `B2C_VALIDATE_JWT_ENABLED` -> `true`

**Important migration note:** The CIAM issuer format differs from B2C:
- B2C: `https://<tenant>.b2clogin.com/<tenantId>/v2.0/`
- CIAM: `https://<tenantId>.ciamlogin.com/<tenantId>/v2.0`
The `@loyalty/shared-auth` middleware and any hardcoded B2C URLs must use the CIAM format.

## [2026-04-08] Azure SQL quota restricted in eastus/eastus2 — INFO

**Opened by:** A-01
**Severity:** INFO (workaround applied: SQL deployed to westus2)
**Owner to unblock:** Human operator (optional — file Azure support ticket)

`Microsoft.Sql/servers` deployment in both `eastus` and `eastus2` returned
`ProvisioningDisabled` ("Provisioning is restricted in this region") on subscription
`13e630db-8816-46b8-896e-511fab75a53a`. The dev SQL server and `control-plane`
database were instead deployed to **westus2** via the new `sqlLocation` parameter.
All other resources remain in eastus. Before promoting to staging/prod, file a
"Service and subscription limits (quotas)" support request to unlock SQL in eastus,
or choose a consistent region for staging/prod up front.

## [2026-04-09] Docker daemon not running — RESOLVED (2026-04-09)

**Opened by:** A-12
**Severity:** ~~SOFT~~ RESOLVED
**Owner to unblock:** ~~Human operator (start Docker Desktop)~~ Resolved
**Blocked agent:** A-12 (T-12 — CI/CD & Phase 1 Integration)

~~Docker daemon is not running on the build machine.~~

**Resolution (2026-04-09):** Docker Desktop started. Used `az acr build` (cloud-side
builds) to avoid local Docker login issues. All 8 images built and pushed to
`loyaltydevacr4a8a43.azurecr.io`. All 8 Container Apps deployed and running.
6 HTTP services pass health checks; 2 workers report Running status.
