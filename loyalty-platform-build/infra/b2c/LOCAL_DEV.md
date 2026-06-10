# Local Dev — Authentication Bypass

Until the B2C tenant is manually provisioned (see `README.md` Steps 1–3),
**every service** in the platform supports a dev-mode auth bypass.

## Enabling

Set the env var before starting the service:

```bash
export SKIP_AUTH=true
pnpm --filter @loyalty/member-service dev
```

## Required request headers

With `SKIP_AUTH=true`, JWT verification is skipped. You must still send these
headers on every request — the middleware populates `req.user` / `req.auth` from
them:

```
x-tenant-id: 11111111-1111-1111-1111-111111111111
x-user-id:   22222222-2222-2222-2222-222222222222
x-client-id: dev-client           # optional, defaults to "dev-client"
x-scopes:    members.read members.write   # optional, space-separated
```

## curl example

```bash
curl -s http://localhost:3001/api/v1/members \
  -H "x-tenant-id: 11111111-1111-1111-1111-111111111111" \
  -H "x-user-id: dev-user" \
  -H "x-scopes: members.read members.write"
```

## Which middlewares honour it?

- `@loyalty/shared-middleware` → `authenticateJWT({ skipAuth: true })`
  (populates `req.user = { userId, tenantId }`)
- `@loyalty/shared-auth` → `b2bAuthMiddleware({ skipAuth: true, ... })`
  (populates `req.auth = { tenantId, clientId, scopes }`)

Both honour `process.env.SKIP_AUTH === 'true'` automatically when `skipAuth`
is not passed explicitly.

## Production safety

`SKIP_AUTH` MUST NOT be set in staging or production. The T-18 deployment
workflow scans container app revisions for this env var and fails the pipeline
if it's found with a value of `true`.
