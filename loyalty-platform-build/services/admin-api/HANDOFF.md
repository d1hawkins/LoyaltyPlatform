# Admin API — Handoff (A-11)

Implements **T-11**: program config, member management, tiers, webhooks, API keys,
feature flags, branding, and audit log, behind role-based access control.

## Service

- Express, port `PORT || 3005`
- Package: `@loyalty/admin-api`
- Entry: `src/index.ts` → `createApp({ deps, devAuth })`
- Health: `GET /health`, `GET /ready`
- All admin endpoints mounted under `/v1/admin`

## Migration

- Tenant migration **V10** (`/services/tenant-migrations/V10__audit_log.sql`)
  creates `dbo.audit_log` with actor, action, entity/entity_id, before/after JSON,
  reason, IP, user agent, correlation id. Two indexes (actor+time, entity+time).

## RBAC

Three roles, source of truth in JWT claim `roles` (array). Dev override:
`x-user-role` header when `SKIP_AUTH=true` or `NODE_ENV=test`.

- `owner` — full access including billing, API keys, program destructive ops,
  feature flags, and GDPR confirm.
- `manager` — member management, tiers (non-create/delete), webhooks, offers,
  program update, points adjustments, branding.
- `analyst` — read-only: members, tiers, audit log, branding, feature flag list.

Helper: `requireRole(...allowedRoles)` in `src/rbac.ts`.

## Endpoints (30)

Grouped by domain. All paths prefixed with `/v1/admin`.

### Program config
| Method | Path | Min role |
|---|---|---|
| GET | `/program` | manager |
| PUT | `/program` | manager |
| GET | `/program/version-history` | manager |

### Tiers
| Method | Path | Min role |
|---|---|---|
| GET | `/tiers` | analyst |
| POST | `/tiers` | owner |
| PUT | `/tiers/:id` | manager |
| DELETE | `/tiers/:id` (soft deactivate) | owner |

### Members
| Method | Path | Min role |
|---|---|---|
| GET | `/members/search` | analyst |
| GET | `/members/:id` | analyst |
| GET | `/members/export.csv` | analyst |
| POST | `/members/:id/points-adjust` | manager |
| POST | `/members/:id/tier-override` | manager |
| POST | `/members/:id/status` | manager |
| POST | `/members/:id/gdpr-delete` | manager (request) / owner (confirm=true) |
| POST | `/members/bulk` | manager |

### API keys (control plane)
| Method | Path | Min role |
|---|---|---|
| GET | `/apikeys` | owner |
| POST | `/apikeys` | owner — returns plaintext **once**; bcrypt hash stored |
| DELETE | `/apikeys/:id` | owner |

### Webhooks
| Method | Path | Min role |
|---|---|---|
| GET | `/webhooks` | manager |
| POST | `/webhooks` | manager |
| PUT | `/webhooks/:id` | manager |
| DELETE | `/webhooks/:id` | manager |
| POST | `/webhooks/:id/test` | manager |
| GET | `/webhooks/:id/deliveries` | manager |

### Audit log
| Method | Path | Min role |
|---|---|---|
| GET | `/audit` | analyst |
| GET | `/audit/export.csv` | analyst |

### Feature flags
| Method | Path | Min role |
|---|---|---|
| GET | `/feature-flags` | manager |
| PUT | `/feature-flags/:key` | owner |

### Branding
| Method | Path | Min role |
|---|---|---|
| GET | `/branding` | analyst |
| PUT | `/branding` | manager |

## Role matrix

| Endpoint group | analyst | manager | owner |
|---|---|---|---|
| Program GET | yes (via branding) | yes | yes |
| Program PUT | no | yes | yes |
| Tiers list | yes | yes | yes |
| Tiers create | no | no | yes |
| Tiers update | no | yes | yes |
| Tiers delete | no | no | yes |
| Members search/get/export | yes | yes | yes |
| Members points/status/tier override/bulk | no | yes | yes |
| GDPR delete (request) | no | yes | yes |
| GDPR delete (confirm=true) | no | no | yes |
| API keys | no | no | yes |
| Webhooks CRUD/test | no | yes | yes |
| Audit read/export | yes | yes | yes |
| Feature flags list | no | yes | yes |
| Feature flags update | no | no | yes |
| Branding GET | yes | yes | yes |
| Branding PUT | no | yes | yes |

## Audit action codes

Every mutating endpoint is wrapped by `auditedMutation` which writes a row into
`dbo.audit_log` with `{ actor_user_id, actor_role, action, entity, entity_id,
before_json, after_json, reason, ip_address, user_agent, correlation_id }`.

| Action | Entity |
|---|---|
| `program.update` | `program_config` |
| `branding.update` | `program_config` |
| `tier.create` | `tier` |
| `tier.update` | `tier` |
| `tier.delete` | `tier` |
| `points.adjust` | `member` |
| `tier.override` | `member` |
| `member.status` | `member` |
| `member.gdpr_delete` | `member` |
| `member.bulk` | `member` |
| `apikey.create` | `api_key` (plaintext key NEVER written to audit) |
| `apikey.revoke` | `api_key` |
| `webhook.create` | `webhook` |
| `webhook.update` | `webhook` |
| `webhook.delete` | `webhook` |
| `feature_flag.update` | `feature_flag` |

## Environment variables

| Var | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3005` |
| `KEY_VAULT_URI` | Azure Key Vault URI | — |
| `CONTROL_PLANE_SQL_CONNSTR` | control plane mssql | — |
| `REDIS_URL` | redis | — |
| `SERVICE_BUS_CONNECTION_STRING` | Service Bus | — |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | App Insights | — |
| `MEMBER_SERVICE_URL` | member-service base URL | `http://member-service:3001` |
| `LOYALTY_ENGINE_URL` | loyalty-engine base URL | `http://loyalty-engine:3002` |
| `WEBHOOK_WORKER_URL` | webhook-worker base URL | `http://webhook-worker:3004` |
| `SKIP_AUTH` | dev-only, accept `x-tenant-id`, `x-user-id`, `x-user-role` | `false` |
| `NODE_ENV` | `test` auto-enables devAuth | `development` |

## Coordination with other services

- **member-service** — `MEMBER_SERVICE_URL` — member search, lookups, GDPR delete
- **loyalty-engine** — `LOYALTY_ENGINE_URL` — `/v1/members/:id/adjustments`, tier overrides
- **webhook-worker** — `WEBHOOK_WORKER_URL` — `/v1/webhooks/:id/test`, deliveries admin
- **control plane DB** — `tenant_api_keys`, `feature_flags` — accessed via
  `TenantDbClient.getControlPlanePool()` from `@loyalty/shared-db-client`
- **tenant DB** — `audit_log`, `program_config`, `tiers`, `webhooks` — via
  `TenantDbClient.getTenantPool(tenantId)`

The in-memory implementations in `src/repositories.ts` are wired for tests; the
SQL+HTTP adapters should slot into the same interfaces (`ProgramConfigRepository`,
`TierRepository`, `WebhookRepository`, `ApiKeyRepository`, `FeatureFlagRepository`,
`AuditRepository`, `MemberClient`, `LoyaltyEngineClient`, `WebhookWorkerClient`).

## Tests (48 total)

- `tests/health.test.ts` — 2
- `tests/rbac.test.ts` — 7 (extractRoles, highestRole, requireRole happy/forbidden/unauthenticated)
- `tests/audit.test.ts` — 3 (records before/after/reason, error propagation, 401)
- `tests/csv-bulk.test.ts` — 6 (csvEscape, rowToCsv, streamCsv, partitionBulk chunking / >max / empty)
- `tests/routes.integration.test.ts` — 30 (supertest against in-memory deps; covers every endpoint with happy path + forbidden + validation error where applicable; plaintext API key is never written to audit)

Run: `pnpm --filter @loyalty/admin-api test` — all green.

## Frontend integration notes (for A-19 admin portal)

- Base URL: `/v1/admin` behind the same host as the admin SPA (reverse proxy).
- All responses are JSON except `*.export.csv` endpoints which are
  `text/csv; charset=utf-8` with `Content-Disposition: attachment`.
- Error responses follow RFC 7807 Problem Details (`application/problem+json`)
  via `@loyalty/shared-middleware/errorHandler`.
- Roles are driven from the JWT `roles` claim. The SPA should only surface
  actions the signed-in user is permitted — see role matrix above. The
  server is authoritative and will 403 anything the client forgets to hide.
- Cursor pagination: `/members/search` and `/audit` return
  `{ items, nextCursor? }`. Pass `?cursor=<value>` to fetch the next page.
- Bulk member actions: max 1000 ids per call, server partitions into 100-sized
  chunks. Response includes `{ action, total, chunkCount, acceptedAt }` — the
  action itself is asynchronous on the backend workers.
- API key create: plaintext token is returned exactly once in
  `POST /apikeys` response as `plaintextKey`. Never logged, never audited.
- GDPR delete: `POST /members/:id/gdpr-delete` without `confirm` records the
  request (manager+). With `confirm: true`, owner role required.
- Branding PUT merges into `program_config.config_json.branding`; front-end
  should re-fetch `GET /branding` after save.
- Audit log filtering: `?entity=&action=&actor=&from=&to=&limit=&cursor=`.
- Program version history: `GET /program/version-history` is a convenience
  filter over the audit log.
