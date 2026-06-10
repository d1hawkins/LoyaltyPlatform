# Notification Service — HANDOFF (A-10)

Task T-10 — Notification Service (Email & Transactional).

## Base URL

- Local dev: `http://localhost:3002`
- Health: `GET /health`, `GET /ready` (unauthenticated)

All business endpoints are under `/v1/notifications`.

## Auth

Middleware order applied to `/v1/notifications`:

```
correlationId → requestLogger → authenticateJWT({ skipAuth }) → router → errorHandler
```

Modes:

| Mode | Headers |
|---|---|
| Production | `Authorization: Bearer {jwt}` — tenantId/sub claims required |
| Dev (`SKIP_AUTH=true`) | `x-tenant-id: <uuid>` + `x-user-id: <id>` |

## Endpoints

### `POST /v1/notifications/send`

Body (zod `sendSchema`):

```ts
{
  memberId:            string (uuid),
  templateKey:         string (1..100),
  channel:             'email' | 'sms' | 'push',  // only 'email' is implemented in T-10
  locale?:             string,                     // e.g. 'en-US'; falls back to member.locale then 'en-US'
  variables?:          Record<string, unknown>,    // merged into template vars
  triggeredByEventId?: string (uuid),
}
```

Response `202`:

```ts
{
  notificationId:      string,
  status:              'sent' | 'suppressed' | 'failed',
  providerMessageId?:  string,
  error?:              string,
}
```

Errors:
- `400` invalid body / unsupported channel / member has no email
- `404` unknown template or unknown member

Flow: load member contact (member-service HTTP) → check preferences → render template → dispatch via provider → write `notification_log` row (status updated from `pending` → `sent`/`failed`).

### `GET /v1/notifications/log?memberId=&status=&limit=&offset=`

Returns the `notification_log` rows (most recent first), **with recipient masked**: the raw encrypted recipient blob and plaintext are never returned by the API — only `recipientHash`. Defaults: `limit=50`, `offset=0`, max `limit=500`.

### `GET /v1/notifications/templates`

Returns `{ templates: string[] }` — names of the template directories under `/services/notification-service/templates/`.

### `POST /v1/notifications/preferences/:memberId`

Body: `{ templateKey, channel, optedIn }`. Upserts the preference. Returns `204`.

Transactional templates (`welcome`, `tier_upgraded`, `tier_downgraded`, `gdpr_deletion_confirmed`) are **always** sent regardless of preference.

## Event subscriptions

Subscription name (Service Bus): **`notification-service`**.

Topics consumed:

| Topic | Template | Action |
|---|---|---|
| `member.enrolled` | `welcome` | Dispatch email immediately |
| `points.earned` | `points_earned_digest` | **Deferred**: write pending log row only. Nightly flush not yet implemented. |
| `tier.upgraded` | `tier_upgraded` | Dispatch (vars: `previousTier`, `newTier`) |
| `tier.downgraded` | `tier_downgraded` | Dispatch (vars: `previousTier`, `newTier`) |
| `member.deleted` | `gdpr_deletion_confirmed` | Best-effort dispatch; failures are swallowed (member may already be purged) |

The event router is exposed as `createEventRouter({ service, logger })` from `src/event-handlers.ts` and drives `service.send()` / `service.logEventAsPending()`. Tests exercise it directly; the Service Bus bootstrap is **deferred** (live mode throws at startup, matching the A-08 / tier-eval-worker pattern).

### Expected future templates (coordination with T-17)

`points_expiry_reminder_30d`, `points_expiry_reminder_7d` — T-17 will trigger these via a scheduled worker that calls `POST /v1/notifications/send` (or republishes a new topic). Template keys are reserved — drop `templates/<key>/en-US.*.hbs` to implement.

## Templates

Stored under `/services/notification-service/templates/<templateKey>/<locale>.<kind>.hbs` where `<kind>` ∈ `subject | body.html | body.text`. Handlebars with default HTML escaping.

Current templates:

- `welcome`
- `tier_upgraded`
- `tier_downgraded`
- `gdpr_deletion_confirmed`
- `points_earned_digest`

Locale fallback: if `<locale>.*.hbs` is missing, falls back to `en-US.*.hbs`.

### Variable reference

Every template receives these variables injected automatically by the service:

| Name | Type | Source |
|---|---|---|
| `memberName` | string | `{firstName} {lastName}` (falls back to `"Member"`) |
| `memberId` | string | member id |
| `tenantName` | string | `TENANT_NAME` env |
| `programName` | string | `PROGRAM_NAME` env |
| `supportEmail` | string | `SUPPORT_EMAIL` env |
| `unsubscribeUrl` | string | `${UNSUBSCRIBE_BASE_URL}?m=<memberId>` |

Tier events additionally supply:

| Name | Source |
|---|---|
| `previousTier` | `fromTierId` |
| `newTier` | `toTierId` |

Any extra `variables` passed to `POST /v1/notifications/send` are shallow-merged on top.

### Adding a new template

1. `mkdir services/notification-service/templates/<key>`
2. Create `en-US.subject.hbs`, `en-US.body.html.hbs`, `en-US.body.text.hbs`.
3. If it should be transactional (non-opt-outable), add the key to `TRANSACTIONAL_TEMPLATES` in `src/preferences.ts`. If it should default to **off**, add it to `DEFAULT_OFF_TEMPLATES`.
4. (Optional) Wire an event to it in `src/event-handlers.ts`.
5. Run `pnpm --filter notification-service test`.

## Environment variables

| Name | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `3002` |
| `NODE_ENV` | runtime | `development` |
| `SKIP_AUTH` | `true` → dev mode bypass JWT | unset |
| `SERVICE_BUS_CONNECTION_STRING` | Azure Service Bus — if set, service boots in live-mode (currently throws until wired) | unset |
| `MEMBER_SERVICE_URL` | base URL for member-service HTTP client | `http://localhost:3001` |
| `EMAIL_PROVIDER` | `noop` \| `azure-comm` | `noop` |
| `AZURE_COMM_CONNECTION_STRING` | Azure Communication Services conn string — required when `EMAIL_PROVIDER=azure-comm` | — |
| `FROM_EMAIL` | sender address | `no-reply@loyalty.local` |
| `SUPPORT_EMAIL` | reply-to + template var | `support@loyalty.local` |
| `PROGRAM_NAME` | template var | `Loyalty Program` |
| `TENANT_NAME` | template var | `Loyalty` |
| `UNSUBSCRIBE_BASE_URL` | unsubscribe link base | `https://loyalty.local/unsubscribe` |
| `NOTIFICATION_PII_KEY_HEX` | 32-byte AES-256-GCM key (hex) used to encrypt the recipient before storing in `notification_log.recipient`. **In production delivered from Key Vault secret `notification-pii-key` via Managed Identity.** | `00..00` (dev only) |
| `NOTIFICATION_RECIPIENT_PEPPER` | HMAC pepper for the deterministic `recipient_hash` column | `dev-pepper-change-me` |

## Data model — V9 migration

`services/tenant-migrations/V9__notification_log.sql` creates two tables:

- `dbo.notification_log` — one row per notification attempt (pending/sent/failed/suppressed). `recipient` is the encrypted blob; `recipient_hash` is hex HMAC-SHA256 for deterministic lookup without plaintext exposure. Indexed on `(member_id, created_at)` and `(status, created_at)`.
- `dbo.notification_preferences` — per-member per-template per-channel opt-in. PK `(member_id, template_key, channel)`.

Migration is idempotent (wrapped in `IF OBJECT_ID(...) IS NULL`).

## PII decision — `@loyalty/shared-pii`

I **extracted** a new shared package `packages/shared-pii` exposing:

```ts
encrypt(plaintext: string, keyHex: string): string   // AES-256-GCM base64 blob (v1|iv|tag|ct)
decrypt(blob: string, keyHex: string): string
hashRecipient(plaintext: string, pepper: string): string  // HMAC-SHA256 hex, lowercased+trimmed
sha256Hex(input: string): string
```

Rationale: the rubric explicitly called out extracting this helper as the simplest approach, and having a dedicated package avoids duplication across member-service and notification-service. **I intentionally did NOT migrate member-service** to use it in this task — member-service retains its local `pii.ts` with the `PiiKeyProvider` abstraction (which has versioning semantics this package does not). The ciphertext blob format is byte-compatible (`v1|iv|tag|ct`) so a future migration is safe. Documented as decision in this HANDOFF.

## Provider abstraction

`EmailProvider` interface in `src/providers.ts`:

```ts
interface EmailProvider {
  name(): string;
  send(args: {
    to: string; subject: string; html: string; text: string;
    from: string; replyTo?: string;
  }): Promise<{ providerMessageId: string }>;
}
```

Implementations:
- `NoopEmailProvider` — captures sends into an in-memory array, returns fake id. Default in dev and tests.
- `AzureCommEmailProvider` — lazy-loads `@azure/communication-email` (NOT declared in package.json; install at the deployment layer or uncomment when wiring live mode). Requires `AZURE_COMM_CONNECTION_STRING`.

`createEmailProvider(config, logger)` picks based on `EMAIL_PROVIDER`.

## Coordination notes

- **T-17 (points expiry)**: expected templates `points_expiry_reminder_30d` / `points_expiry_reminder_7d`. T-17 should call `POST /v1/notifications/send` with the templateKey and `variables: { pointsBalance, expiryDate }`. Reserve those keys.
- **T-11 (admin API)**: suppression / unsuppress controls — admin API should call `POST /v1/notifications/preferences/:memberId` to toggle opt-in for a (templateKey, channel). For bulk suppression the admin API should extend this service with a `POST /v1/notifications/preferences/bulk` endpoint (not yet implemented).
- **Member service (A-04)**: the HTTP client reads `GET /v1/members/:id` expecting `email`, `phone`, `firstName`, `lastName`, `locale`, `status` fields in the response. Do **not** break those field names without coordinating.
- **Nightly digest (deferred)**: `points.earned` is logged as `pending` rows. The flush worker (cron) is not yet built — it should query `notification_log WHERE template_key='points_earned_digest' AND status='pending'`, group by `member_id`, render a summary, call `provider.send`, then mark rows `sent`. This is a follow-up task — not A-10 scope.
- **Live-mode bootstrap**: `startService()` throws when `SERVICE_BUS_CONNECTION_STRING` is set, mirroring A-08 / tier-eval-worker. Unset it to run in in-memory mode.

## Tests

`pnpm --filter notification-service test`:

- `tests/health.test.ts` — basic health/ready
- `tests/templates.test.ts` — render, locale fallback, HTML escaping, listTemplates
- `tests/preferences.test.ts` — transactional classification, defaults, opt-in/out
- `tests/providers.test.ts` — noop, factory, masking
- `tests/integration.test.ts` — HTTP endpoints via supertest + event router pipeline (member.enrolled, tier.upgraded, points.earned deferred, member.deleted failure swallow)

**Current status: 5 suites, 26 tests, all green.**
