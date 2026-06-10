# /infra/apim — Loyalty Platform APIM Configuration (T-07 / A-07)

Additive APIM configuration for the existing Consumption-tier instance
`loyalty-dev-apim-5rdrqh` in resource group `loyalty-platform-dev`.

This module does **not** create the APIM service itself (A-01 / `/infra/main.bicep`
owns that). It layers on APIs, policies, a product, and named values.

## Contents

```
apim-config.bicep                          # additive Bicep module
deploy.sh                                  # wrapper: bicep build + validate + deploy
openapi/
  member-service.yaml                      # OpenAPI 3.0 — derived from A-04 HANDOFF
  loyalty-engine.yaml                      # OpenAPI 3.0 — derived from A-05 HANDOFF
policies/
  global.xml                               # service-scope: CORS, correlation-id,
                                           # dev X-Skip-Auth bypass, validate-jwt
                                           # (gated), claim→header injection
  rate-limit-1000-per-min.xml              # product-scope: 1000 req/min
  member-service-inbound.xml               # API-scope inbound
  loyalty-engine-inbound.xml               # API-scope inbound + Idempotency-Key guard
postman/
  loyalty-platform.postman_collection.json
  loyalty-platform-dev.postman_environment.json
```

## Deploy

```bash
./infra/apim/deploy.sh                                     # uses loyalty-platform-dev
# or
az bicep build  --file infra/apim/apim-config.bicep
az deployment group validate -g loyalty-platform-dev -f infra/apim/apim-config.bicep
az deployment group create   -g loyalty-platform-dev -f infra/apim/apim-config.bicep
```

Consumption-tier APIM applies changes in <2 min.

## What gets created

| Resource | Name | Notes |
|---|---|---|
| API | `member-api`    | Path `/member`, subscription required |
| API | `loyalty-engine-api` | Path `/engine`, subscription required |
| Product | `loyalty-b2b` | State `published`, rate-limit 1000/min, both APIs linked |
| Named value | `B2C_JWKS_URI` | Placeholder — must resolve at policy-apply time |
| Named value | `B2C_ISSUER`   | Placeholder |
| Named value | `B2C_VALIDATE_JWT_ENABLED` | **`false`** until B2C unblocks |
| Named value | `MEMBER_SERVICE_BACKEND_URL` | Container Apps FQDN placeholder |
| Named value | `LOYALTY_ENGINE_BACKEND_URL` | Container Apps FQDN placeholder |
| Policy | service-scope | global.xml |
| Policy | `member-api` scope | member-service-inbound.xml |
| Policy | `loyalty-engine-api` scope | loyalty-engine-inbound.xml |
| Policy | `loyalty-b2b` product scope | rate-limit-1000-per-min.xml |

## Consumption-tier constraints (recorded decisions)

- **rate-limit-by-key unavailable** → using plain `<rate-limit>` at product scope. A higher tier would partition by `context.Subscription.Id` or the `tid` claim.
- **No response caching policy** → not used anywhere.
- **Named values from Key Vault** are technically supported on Consumption but we intentionally use literal values so this deploy is decoupled from Key Vault secret existence. The operator swaps to KV-backed named values after B2C unblocks.

## See also

- `HANDOFF.md` — exact runbook for downstream agents (A-12 CI/CD) and for the B2C cutover
- `/infra/b2c/HANDOFF.md` — B2C soft blocker and the values that replace the placeholders
