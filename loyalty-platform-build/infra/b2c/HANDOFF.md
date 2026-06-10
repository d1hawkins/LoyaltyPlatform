# A-06 HANDOFF — Authentication / Azure AD B2C

**Agent:** A-06
**Task:** T-08 — Authentication — Azure AD B2C Configuration
**Status:** ✅ Code-complete — ⚠️ B2C tenant provisioning still pending manual action (SOFT blocker)

---

## SOFT blocker — still open

Azure AD B2C tenants cannot be created via Bicep/ARM/Terraform. A human Global
Administrator must run Steps 1–3 of `/infra/b2c/README.md`. Estimated time:
~15 minutes. All placeholder values below are clearly marked and should be
overwritten once the tenant exists.

**Ordered steps to unblock:**

1. Portal: create tenant `loyaltyplatformdev.onmicrosoft.com` (README §1).
2. Portal: register `IdentityExperienceFramework` + proxy apps (README §2).
3. Portal (or Terraform): register `loyalty-b2b-api` + `loyalty-consumer-mobile` (README §3–4).
4. `policies/render.sh` + upload custom policies (README §5).
5. `smoke-test.sh` (README §6).
6. Write secrets to Key Vault `loyalty-dev-kv-5rdrqh` (README §7).
7. Append resolution note to `/blockers/BLOCKERS.md` (do not delete).

---

## Placeholder values (to be replaced post-provisioning)

| Name                       | Placeholder                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `B2C_TENANT_NAME`          | `loyaltyplatformdev.onmicrosoft.com`                                                                                      |
| `B2C_TENANT_ID`            | `00000000-0000-0000-0000-000000000000` *(placeholder — replace)*                                                          |
| `B2C_B2B_CLIENT_ID`        | `00000000-0000-0000-0000-000000000001` *(placeholder)*                                                                    |
| `B2C_B2B_CLIENT_SECRET`    | *stored only in Key Vault, not here*                                                                                      |
| `B2C_CONSUMER_CLIENT_ID`   | `00000000-0000-0000-0000-000000000002` *(placeholder)*                                                                    |
| `B2C_JWKS_URI_B2B`         | `https://loyaltyplatformdev.b2clogin.com/loyaltyplatformdev.onmicrosoft.com/discovery/v2.0/keys?p=B2C_1A_ClientCredentials` |
| `B2C_JWKS_URI_CONSUMER`    | `https://loyaltyplatformdev.b2clogin.com/loyaltyplatformdev.onmicrosoft.com/discovery/v2.0/keys?p=B2C_1A_SignUpOrSignin`   |
| `B2C_ISSUER_B2B`           | `https://loyaltyplatformdev.b2clogin.com/<B2C_TENANT_ID>/v2.0/`                                                           |
| `B2C_ISSUER_CONSUMER`      | `https://loyaltyplatformdev.b2clogin.com/<B2C_TENANT_ID>/v2.0/`                                                           |
| `B2C_AUDIENCE_B2B`         | `api://loyalty-b2b`                                                                                                       |
| `B2C_AUDIENCE_CONSUMER`    | `api://loyalty-consumer`                                                                                                  |

## Custom policy names

- `B2C_1A_SignUpOrSignin`
- `B2C_1A_PasswordReset`
- `B2C_1A_ProfileEdit`
- `B2C_1A_ClientCredentials` *(B2B flow — required for the smoke test)*

## Exposed API scopes (B2B)

- `api://loyalty-b2b/members.read`
- `api://loyalty-b2b/members.write`
- `api://loyalty-b2b/transactions.write`
- `api://loyalty-b2b/admin`

## Consumer mobile app

- Public client, PKCE enabled
- Redirect URIs: `loyalty://callback`, `https://localhost:3000/callback`
- Scopes: `openid`, `profile`, `offline_access`, `api://loyalty-consumer/member.self`

---

## Key Vault secret contract (post-provisioning)

Orchestrator / A-03 writes these into `loyalty-dev-kv-5rdrqh`:

```
b2c-tenant-id
b2c-tenant-name
b2c-b2b-client-id
b2c-b2b-client-secret
b2c-consumer-client-id
b2c-jwks-uri
b2c-issuer-b2b
b2c-issuer-consumer
```

## Downstream service env vars

Services that import `@loyalty/shared-auth` set:

| Env var         | Notes                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `B2C_JWKS_URI`  | from Key Vault `b2c-jwks-uri`                                                                     |
| `B2C_ISSUER`    | from `b2c-issuer-b2b` (internal APIs) or `b2c-issuer-consumer` (mobile API)                       |
| `B2C_AUDIENCE`  | hardcoded: `api://loyalty-b2b` or `api://loyalty-consumer`                                        |
| `SKIP_AUTH`     | `true` in local dev **only** — forbidden in staging/prod (enforced in T-18 deploy pipeline check) |

## Shared auth package

- `/packages/shared-auth/` — `@loyalty/shared-auth` workspace package
- Exports: `verifyB2BToken`, `verifyConsumerToken`, `generateApiKey`,
  `validateApiKey`, `createJwksClient`, `b2bAuthMiddleware`
- Unit tests: **33 tests passing**, **98.97% line / 99.09% stmt / 97.56% branch** coverage
- JWKS/issuer fully mocked — no live B2C tenant required to build or test

## Test-token acquisition (once live)

```bash
export B2C_TENANT_NAME=loyaltyplatformdev
export B2C_B2B_CLIENT_ID=<from KV>
export B2C_B2B_CLIENT_SECRET=<from KV>
./infra/b2c/acquire-b2b-token.sh
```

## Dev bypass (use until live)

```bash
export SKIP_AUTH=true
curl http://localhost:3001/api/v1/members \
  -H "x-tenant-id: 11111111-1111-1111-1111-111111111111" \
  -H "x-user-id: dev-user"
```

See `/infra/b2c/LOCAL_DEV.md` for the full contract.

---

## References

- `/infra/b2c/README.md` — operator runbook
- `/infra/b2c/LOCAL_DEV.md` — `SKIP_AUTH` dev-bypass
- `/infra/b2c/terraform/` — app-registration Terraform (run after manual Step 1)
- `/infra/b2c/policies/` — custom policy XML + `render.sh`
- `/packages/shared-auth/` — implementation + tests
- `/blockers/BLOCKERS.md` — SOFT blocker entry (still open)
