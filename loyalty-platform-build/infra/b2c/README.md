# Azure AD B2C / Entra External ID — Operator Runbook (T-08)

> **UPDATE 2026-04-09:** Azure AD B2C is deprecated for new tenants (May 2025).
> A **Microsoft Entra External ID (CIAM)** tenant was created programmatically via
> the ARM REST API (`Microsoft.AzureActiveDirectory/ciamDirectories`). The blocker
> is **RESOLVED**. See `/blockers/BLOCKERS.md` for full details.
>
> **CIAM tenant:** `loyaltyplatformdev.onmicrosoft.com`
> **Tenant ID:** `4d90e54d-48b0-404f-a680-595a64f152a3`
> **Login endpoint:** `loyaltyplatformdev.ciamlogin.com`
>
> ~~**SOFT BLOCKER:** The B2C tenant itself cannot be created by Bicep/ARM/Terraform.~~
> ~~A human with Global Administrator rights on the target directory must perform~~
> ~~Steps 1–3 below in the Azure Portal.~~

All code artifacts for `@loyalty/shared-auth` are code-complete and unit-tested
against a **mocked JWKS**, so downstream agents (A-03, A-04, A-05, etc.) are
unblocked by the `SKIP_AUTH=true` dev bypass — see `LOCAL_DEV.md`.

---

## 0. Prerequisites

- You are signed in as a Global Administrator on subscription
  `13e630db-8816-46b8-896e-511fab75a53a` (SNT - David H).
- The resource provider `Microsoft.AzureActiveDirectory` is registered:
  ```bash
  az provider register --namespace Microsoft.AzureActiveDirectory
  az provider show -n Microsoft.AzureActiveDirectory --query registrationState
  ```
- Azure CLI ≥ 2.60, Terraform ≥ 1.6, `jq`, `curl`.

---

## 1. Create the B2C tenant (portal)

1. Portal → **Create a resource** → search "Azure Active Directory B2C" → **Create** → **Create a new Azure AD B2C Tenant**.
2. Fields:
   - Organization name: `SNT Loyalty Platform`
   - Initial domain name: `loyaltyplatformdev` → tenant becomes `loyaltyplatformdev.onmicrosoft.com`
   - Country/Region: `United States`
3. Link to existing subscription `13e630db-8816-46b8-896e-511fab75a53a`, resource group `loyalty-platform-dev`.
4. Wait ~2 min for provisioning.
5. Switch directory to the new B2C tenant (top-right profile → Switch directory).
6. **Record** `Directory (tenant) ID` and `Primary domain` — you'll put these in Key Vault in Step 7.

## 2. Register Identity Experience Framework apps

Required for custom policies. Portal → **Azure AD B2C** → **Identity Experience Framework** → follow the "Get started with custom policies" banner, which creates:

- `IdentityExperienceFramework` (web app)
- `ProxyIdentityExperienceFramework` (native)

Record both **Application (client) IDs** — `render.sh` will substitute them into the XML policies.

## 3. App registrations

Create **two** app registrations in the B2C directory:

### 3a. `loyalty-b2b-api`
- Platform: *Web* (no redirect URI required)
- Supported accounts: *Accounts in any identity provider or organizational directory*
- After creation → **Expose an API** → Application ID URI: `api://loyalty-b2b`
- Add scopes:
  - `members.read`
  - `members.write`
  - `transactions.write`
  - `admin`
- **Certificates & secrets** → create a client secret (24-month expiry). Copy the value **once**.
- **Manifest** → set `"accessTokenAcceptedVersion": 2`.

### 3b. `loyalty-consumer-mobile`
- Platform: *Mobile and desktop applications*
- Redirect URIs: `loyalty://callback`, `https://localhost:3000/callback`
- Check **Allow public client flows** (PKCE).
- **API permissions** → add delegated permissions on `loyalty-b2b-api`:
  - `openid`, `profile`, `offline_access`
  - (plus later) a dedicated scope `api://loyalty-consumer/member.self` from a second exposed-API registration (`loyalty-consumer-api`), or expose that scope on `loyalty-b2b-api` — choose one and keep it consistent.

> Once the tenant exists these three registrations can be managed by the Terraform in
> `terraform/` — see Step 4.

## 4. Apply Terraform (optional but recommended)

```bash
cd infra/b2c/terraform
export ARM_TENANT_ID=<B2C tenant id from Step 1>
export ARM_SUBSCRIPTION_ID=13e630db-8816-46b8-896e-511fab75a53a
terraform init
terraform plan -out tfplan
terraform apply tfplan
terraform output -json > ../tf-outputs.json
```

The Terraform creates/updates the two app registrations, the `api://loyalty-b2b`
scopes, and emits their client IDs as outputs.

> **Do not** run Terraform until Steps 1–2 are complete. The `azuread` provider
> will fail if `ARM_TENANT_ID` does not point at an existing directory.

## 5. Deploy custom policies

```bash
cd infra/b2c/policies
B2C_TENANT_NAME=loyaltyplatformdev \
IEF_APP_ID=<from Step 2> \
IEF_PROXY_APP_ID=<from Step 2> \
./render.sh
```

This produces `./rendered/*.xml`. Upload them via **Azure AD B2C → Identity Experience Framework → Upload custom policy** in the order:

1. `TrustFrameworkBase.xml`
2. `TrustFrameworkExtensions.xml`
3. `SignUpOrSignin.xml`
4. `PasswordReset.xml`
5. `ProfileEdit.xml`

Also create a `B2C_1A_ClientCredentials` policy (used by the B2B flow) — see
`policies/ClientCredentials.xml` stub (TODO: adapt from the MS starter pack).

## 6. Smoke test

```bash
B2C_TENANT_NAME=loyaltyplatformdev \
B2C_B2B_CLIENT_ID=<from Step 3a> \
B2C_B2B_CLIENT_SECRET=<from Step 3a> \
./smoke-test.sh
```

Expected output: a JSON body with `access_token`, `token_type: "Bearer"`,
`expires_in: 3600`.

## 7. Write values to Key Vault

Key Vault: `loyalty-dev-kv-5rdrqh`. Set these secrets (the orchestrator / A-03
tenant-provisioning agent reads them):

| Secret name              | Source                                          |
| ------------------------ | ----------------------------------------------- |
| `b2c-tenant-id`          | Step 1 — Directory (tenant) ID                  |
| `b2c-tenant-name`        | `loyaltyplatformdev.onmicrosoft.com`            |
| `b2c-b2b-client-id`      | Step 3a — Application (client) ID               |
| `b2c-b2b-client-secret`  | Step 3a — secret value                          |
| `b2c-consumer-client-id` | Step 3b — Application (client) ID               |
| `b2c-jwks-uri`           | `https://loyaltyplatformdev.b2clogin.com/loyaltyplatformdev.onmicrosoft.com/discovery/v2.0/keys?p=B2C_1A_ClientCredentials` |
| `b2c-issuer-b2b`         | `https://loyaltyplatformdev.b2clogin.com/<tenant-id>/v2.0/` |
| `b2c-issuer-consumer`    | `https://loyaltyplatformdev.b2clogin.com/<tenant-id>/v2.0/` |

```bash
az keyvault secret set --vault-name loyalty-dev-kv-5rdrqh \
  --name b2c-b2b-client-secret --value "<secret>"
# repeat for each
```

## 8. Mark blocker resolved

Once Steps 1–7 are complete, edit `/blockers/BLOCKERS.md` and append a resolution
note. Do **not** delete the blocker entry — keep it for audit.

---

## Env-var contract for services

All services that import `@loyalty/shared-auth` should read:

| Env var         | From Key Vault                    |
| --------------- | --------------------------------- |
| `B2C_JWKS_URI`  | `b2c-jwks-uri`                    |
| `B2C_ISSUER`    | `b2c-issuer-b2b` or `-consumer`   |
| `B2C_AUDIENCE`  | `api://loyalty-b2b` (hardcoded)   |

Plus the dev bypass: `SKIP_AUTH=true` (see `LOCAL_DEV.md`).
