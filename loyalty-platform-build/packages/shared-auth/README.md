# @loyalty/shared-auth

Authentication utilities for the Loyalty Platform. Wraps Azure AD B2C token
verification (B2B client-credentials and consumer PKCE flows) plus API key
generation/validation.

## Install

```
"@loyalty/shared-auth": "workspace:*"
```

## API

```ts
import {
  verifyB2BToken,
  verifyConsumerToken,
  generateApiKey,
  validateApiKey,
  createJwksClient,
  b2bAuthMiddleware,
} from '@loyalty/shared-auth';
```

### `verifyB2BToken(token, { jwksUri, issuer, audience })`
Verifies an RS256 JWT against a remote JWKS. Returns
`{ tenantId, clientId, scopes, raw }`. Throws `UnauthorizedError` on any failure.

### `verifyConsumerToken(token, { jwksUri, issuer, audience })`
Verifies a consumer PKCE token and returns `{ memberId, tenantId, email?, raw }`.

### `generateApiKey() -> { plaintext, hash }`
Generates a `lp_sk_<64 hex>` key; `hash` is bcrypt (12 rounds), safe to persist.

### `validateApiKey(plaintext, hash) -> Promise<boolean>`
Constant-time bcrypt compare. Returns `false` for empty/invalid inputs.

### `b2bAuthMiddleware(opts)`
Express middleware. Populates `req.auth = { tenantId, clientId, scopes }`.
Honours `SKIP_AUTH=true` for local dev (reads `x-tenant-id`, `x-client-id`,
`x-scopes` headers instead of verifying a token).

## Dev bypass

Set `SKIP_AUTH=true` and send:
```
x-tenant-id: <uuid>
x-client-id: <id>
x-scopes: members.read members.write
```

## Env vars consumed by services

| Var             | Example                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `B2C_JWKS_URI`  | `https://loyaltyplatformdev.b2clogin.com/loyaltyplatformdev.onmicrosoft.com/discovery/v2.0/keys?p=B2C_1A_ClientCredentials` |
| `B2C_ISSUER`    | `https://loyaltyplatformdev.b2clogin.com/<tenantId>/v2.0/`                                        |
| `B2C_AUDIENCE`  | `api://loyalty-b2b`                                                                               |
