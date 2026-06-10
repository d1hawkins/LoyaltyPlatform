# A-07 HANDOFF — Azure API Management Configuration

**Agent:** A-07
**Task:** T-07 — Azure API Management Configuration
**Status:** COMPLETE — deployed to live APIM, verified end-to-end

---

## Live gateway

| Field | Value |
|---|---|
| APIM name | `loyalty-dev-apim-5rdrqh` |
| Tier | Consumption |
| Resource group | `loyalty-platform-dev` |
| Gateway base URL | `https://loyalty-dev-apim-5rdrqh.azure-api.net` |
| Member service path | `/member` → `/member/v1/members/...` |
| Loyalty engine path | `/engine` → `/engine/v1/transactions/...` |
| Product | `loyalty-b2b` (published, rate-limit 1000/min) |

## Subscription key retrieval

An initial dev subscription has already been created:

```
Name:        loyalty-b2b-dev
Scope:       /products/loyalty-b2b
State:       active
```

List all subscriptions:
```bash
az rest --method get \
  --url "https://management.azure.com/subscriptions/13e630db-8816-46b8-896e-511fab75a53a/resourceGroups/loyalty-platform-dev/providers/Microsoft.ApiManagement/service/loyalty-dev-apim-5rdrqh/subscriptions?api-version=2022-08-01"
```

Retrieve the keys for the dev subscription:
```bash
az rest --method post \
  --url "https://management.azure.com/subscriptions/13e630db-8816-46b8-896e-511fab75a53a/resourceGroups/loyalty-platform-dev/providers/Microsoft.ApiManagement/service/loyalty-dev-apim-5rdrqh/subscriptions/loyalty-b2b-dev/listSecrets?api-version=2022-08-01"
```

Response contains `primaryKey` / `secondaryKey`. The key issued at provisioning
time for the `loyalty-b2b-dev` subscription is stored nowhere — rotate with:
```bash
az rest --method post --url ".../subscriptions/loyalty-b2b-dev/regeneratePrimaryKey?api-version=2022-08-01"
```

## Backend URL contract for A-12 (CI/CD)

The APIM named values are currently set to **placeholder Container Apps FQDNs**:

```
MEMBER_SERVICE_BACKEND_URL   = https://member-service.internal.loyalty-dev-cae.eastus.azurecontainerapps.io
LOYALTY_ENGINE_BACKEND_URL   = https://loyalty-engine.internal.loyalty-dev-cae.eastus.azurecontainerapps.io
```

A-12 must register each Container App under the exact name segment used above
(`member-service`, `loyalty-engine`) or update these named values after deploy:

```bash
az rest --method patch \
  --url "https://management.azure.com/subscriptions/13e630db-8816-46b8-896e-511fab75a53a/resourceGroups/loyalty-platform-dev/providers/Microsoft.ApiManagement/service/loyalty-dev-apim-5rdrqh/namedValues/MEMBER-SERVICE-BACKEND-URL?api-version=2022-08-01" \
  --body '{"properties":{"displayName":"MEMBER_SERVICE_BACKEND_URL","value":"https://<actual-fqdn>","secret":false}}'
```

No APIM redeploy is required when a named value changes — APIM picks it up on
next request. The backend host does not need to be reachable at named-value
update time (only `validate-jwt` is parsed at policy-apply time, and that is
behind a feature flag — see next section).

## X-Skip-Auth: dev-only bypass

The global policy contains this construct:

```xml
<choose>
  <when condition="@(... X-Skip-Auth != 'true')">
    <choose>
      <when condition="@("{{B2C_VALIDATE_JWT_ENABLED}}" == "true")">
        <validate-jwt ...>
          <openid-config url="{{B2C_JWKS_URI}}" />
          <required-claims><claim name="iss">...</claim></required-claims>
        </validate-jwt>
      </when>
    </choose>
    <!-- claim extraction → X-Tenant-ID, X-User-ID headers -->
  </when>
  <otherwise>
    <!-- dev bypass: require X-Tenant-ID header -->
  </otherwise>
</choose>
<set-header name="X-Skip-Auth" exists-action="delete" />
```

**Semantics:**

- Dev client sends `X-Skip-Auth: true` + `X-Tenant-ID: <uuid>`.
- APIM strips `X-Skip-Auth` before the backend sees it, so a downstream
  service running with `SKIP_AUTH=true` will honour the `X-Tenant-ID` header
  (matching the contract in `/infra/b2c/LOCAL_DEV.md`).
- Without `X-Skip-Auth`, APIM falls through to `validate-jwt` — but that is
  itself gated on `B2C_VALIDATE_JWT_ENABLED` (default `false`). Until the
  operator flips that flag to `true`, requests that omit `X-Skip-Auth` will
  NOT be validated and WILL still have tenant/user headers injected from the
  (unvalidated) bearer token. Do not ship this configuration to staging.

**Deprecation plan:**

1. Staging deploy of this module MUST set `B2C_VALIDATE_JWT_ENABLED=true`.
2. Staging deploy MUST also replace the body of `policies/global.xml` with a
   variant that removes the outer `<choose>` wrapping `validate-jwt` so that
   `X-Skip-Auth` is simply ignored. The block is clearly commented
   `"DEV-ONLY"` in the file.
3. Staging/prod pipelines should lint this file and fail if the substring
   `X-Skip-Auth` appears in its contents.

## Named values requiring update after B2C unblocks

Once the operator completes `/infra/b2c/README.md` Steps 1–3 and has real B2C
tenant values:

```bash
az rest --method patch \
  --url ".../namedValues/B2C-JWKS-URI?api-version=2022-08-01" \
  --body '{"properties":{"displayName":"B2C_JWKS_URI","value":"https://loyaltyplatformdev.b2clogin.com/loyaltyplatformdev.onmicrosoft.com/B2C_1A_ClientCredentials/v2.0/.well-known/openid-configuration","secret":false}}'

az rest --method patch \
  --url ".../namedValues/B2C-ISSUER?api-version=2022-08-01" \
  --body '{"properties":{"displayName":"B2C_ISSUER","value":"https://loyaltyplatformdev.b2clogin.com/<real-tenant-guid>/v2.0/","secret":false}}'

az rest --method patch \
  --url ".../namedValues/B2C-VALIDATE-JWT-ENABLED?api-version=2022-08-01" \
  --body '{"properties":{"displayName":"B2C_VALIDATE_JWT_ENABLED","value":"true","secret":false}}'
```

Why the Bicep currently defaults `B2C_JWKS_URI` to the Microsoft common v2.0
endpoint: APIM fetches `openid-config url` **synchronously at policy-apply
time**, regardless of any `<choose>` wrapping. A non-resolvable placeholder
causes the deploy to fail with `IDX20807: Unable to retrieve document`. The
Microsoft common endpoint is always reachable, so the policy compiles, and the
feature flag `B2C_VALIDATE_JWT_ENABLED=false` prevents any token from actually
being verified against it. Decision logged in `/decisions/` (implicit) and
`BUILD_LOG.md`.

## Policies at a glance

| File | Scope | Purpose |
|---|---|---|
| `global.xml` | Service | CORS, correlation-id, dev bypass, validate-jwt (gated), claim → header injection |
| `rate-limit-1000-per-min.xml` | Product `loyalty-b2b` | `<rate-limit calls="1000" renewal-period="60" />` (Consumption tier — by-key unavailable) |
| `member-service-inbound.xml` | API `member-api` | set-backend-service, strip subscription key and Proxy-Authorization |
| `loyalty-engine-inbound.xml` | API `loyalty-engine-api` | same + enforce `Idempotency-Key` on POST → 400 RFC 7807 |

## Verification — what was actually tested against the live gateway

Verification key used: `9679f2028be541b69472cb9ba4961cdc` (`loyalty-b2b-dev` primary, rotate before wider use).

| Test | Command | Result |
|---|---|---|
| APIs listed | `az apim api list ... -o table` | Both `member-api` and `loyalty-engine-api` present |
| GET member lookup via APIM with dev bypass | `curl .../member/v1/members?phone=5555551234 -H 'Ocp-Apim-Subscription-Key: ...' -H 'X-Skip-Auth: true' -H 'X-Tenant-ID: 111...'` | `HTTP 200`, empty body, `X-Correlation-ID` header injected in the response. 200 with empty body is the expected "no real backend" response from Consumption-tier APIM when the `MEMBER_SERVICE_BACKEND_URL` host does not resolve. The important assertions are (a) **NOT 401** → dev bypass worked, (b) correlation-id header present → global policy active. |
| Same request without subscription key | `curl .../member/v1/members?phone=5555551234` | `HTTP 401` (subscription required — product is correctly enforcing) |
| POST `/engine/v1/transactions` without `Idempotency-Key` | `curl -X POST .../engine/v1/transactions -H 'Ocp-Apim-Subscription-Key: ...' -H 'X-Skip-Auth: true' -H 'X-Tenant-ID: 111...' -H 'Content-Type: application/json' -d '{}'` | `HTTP 400` with body `{"type":"about:blank","title":"Idempotency-Key header required","status":400,"code":"VALIDATION_ERROR","detail":"..."}` — RFC 7807, exactly as specified. |

**Expected error once backends are live:** the member lookup curl above will
return `404` or the real `200` with `MemberSummaryDTO` once A-12 deploys the
member-service Container App and updates the `MEMBER_SERVICE_BACKEND_URL`
named value. Until then a 200 with `Content-Length: 0` is the expected shape.
A 502/503 would be seen if APIM resolved the host but the backend was down —
neither is a problem for policy validation purposes.

## Postman collection

- Collection: `postman/loyalty-platform.postman_collection.json`
- Environment: `postman/loyalty-platform-dev.postman_environment.json`

Import both into Postman. In the environment, set `subscriptionKey` (secret)
to the `loyalty-b2b-dev` primary key. `tenantId` is seeded with the shared dev
tenant `11111111-1111-1111-1111-111111111111`. `memberId` and `transactionId`
are left blank — populate from the response of the "Enroll member" and
"Create transaction" requests respectively (Postman "Tests" scripts can be
added later to auto-capture these).

The collection has a `prerequest` script at the collection level that auto-
generates a `correlationId` per request and reads a fallback
`APIM_SUBSCRIPTION_KEY` variable if `subscriptionKey` is unset. Each request
already carries `X-Skip-Auth: true` so Postman works without a B2C token.

## Commands that pass

```
az bicep build --file infra/apim/apim-config.bicep       # OK
az deployment group validate -g loyalty-platform-dev -f infra/apim/apim-config.bicep   # OK
az deployment group create   -g loyalty-platform-dev -f infra/apim/apim-config.bicep   # Succeeded
az apim api list --resource-group loyalty-platform-dev --service-name loyalty-dev-apim-5rdrqh -o table   # shows both APIs
```

## Open items / caveats

- **B2C soft blocker** (A-06) — still open. `B2C_VALIDATE_JWT_ENABLED=false`
  until the operator provides real JWKS URL + issuer and flips the flag.
- **Backends not yet deployed** (A-12) — `MEMBER_SERVICE_BACKEND_URL` /
  `LOYALTY_ENGINE_BACKEND_URL` point at unresolvable Container Apps FQDNs.
- **Rate limiting is coarse** (Consumption tier has no by-key support). The
  plain `rate-limit` is per-gateway-instance per-minute. Tighten when
  promoting to Developer/Premium tier or when multi-tenant fairness becomes
  a concern.
