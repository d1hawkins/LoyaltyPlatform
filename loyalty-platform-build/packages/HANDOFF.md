# Loyalty Platform — Shared Packages Handoff (A-02)

Every Wave 1+ agent MUST read this file before writing service code.

## Import paths

All shared packages are published under the `@loyalty/*` scope as workspace packages (`workspace:*`).

```ts
import { createLogger, withContext, Logger } from '@loyalty/shared-logger';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TenantNotFoundError,
  RateLimitError,
  TenantError,
} from '@loyalty/shared-errors';
import {
  authenticateJWT,
  resolveTenant,
  correlationId,
  requestLogger,
  errorHandler,
  AuthenticatedUser,
} from '@loyalty/shared-middleware';
import { TenantDbClient } from '@loyalty/shared-db-client';
import {
  ServiceBusPublisher,
  ServiceBusSubscriber,
  EVENT_TYPES,
  EventEnvelope,
  MemberEnrolledEvent,
  PointsEarnedEvent,
  PointsRedeemedEvent,
  TierUpgradedEvent,
  TierDowngradedEvent,
  TransactionVoidedEvent,
  MemberDeletedEvent,
  MemberUpdatedEvent,
  WebhookDeliveryEvent,
} from '@loyalty/shared-events';
import {
  Member,
  MemberStatus,
  MemberPII,
  Tier,
  TierBenefits,
  Transaction,
  TransactionChannel,
  PointsLedgerEntry,
  LedgerReason,
  Offer,
  OfferType,
  Redemption,
  Tenant,
  TenantConfig,
  TenantStatus,
  WebhookConfig,
  WebhookEventType,
  PaginatedResult,
  ApiError,
  MemberId,
  TenantId,
  TransactionId,
  OfferId,
  TierId,
  LedgerEntryId,
  RedemptionId,
  WebhookId,
} from '@loyalty/shared-types';
```

Add these to a service `package.json` as `"@loyalty/shared-xxx": "workspace:*"`.

## Environment variables

### `@loyalty/shared-db-client`
- `KEY_VAULT_URI` — e.g. `https://loyalty-dev-kv-5rdrqh.vault.azure.net/`
- `CONTROL_PLANE_SQL_CONNSTR` — mssql connection string for the control plane DB
- `REDIS_URL` — ioredis-compatible Redis URL

Tenant DB secret naming convention: `tenant-${tenantId}-sql-connstr` in Key Vault.

### `@loyalty/shared-events`
- `SERVICE_BUS_CONNECTION_STRING` — Azure Service Bus connection string

### Service defaults (from `/infra/infra-outputs.json`)
- `keyVaultName`: `loyalty-dev-kv-5rdrqh`
- `keyVaultUri`: `https://loyalty-dev-kv-5rdrqh.vault.azure.net/`
- `appInsightsConnectionString`: already stored — services should set `APPLICATIONINSIGHTS_CONNECTION_STRING`
- `serviceBusNamespace`: `loyalty-dev-sb-5rdrqh`
- `controlPlaneDbName`: `control-plane` (on server `loyalty-dev-sql-5rdrqhw.database.windows.net`)

### Authentication bypass (dev only)
Set `SKIP_AUTH=true` and send headers:
```
x-tenant-id: <tenant-uuid>
x-user-id: <user-id>
```
`authenticateJWT({ skipAuth: true })` will populate `req.user` from these headers and skip JWT verification.

## Service Bus topics (9)

These topic names must exist in the Service Bus namespace. Wave 1 agents should subscribe using these exact strings.

1. `member.enrolled`
2. `member.updated`
3. `member.deleted`
4. `points.earned`
5. `points.redeemed`
6. `tier.upgraded`
7. `tier.downgraded`
8. `transaction.voided`
9. `webhook.delivery`

Event type constants are exported as `EVENT_TYPES` from `@loyalty/shared-events`.

## Event envelope

All events are published wrapped in:
```ts
interface EventEnvelope<T> {
  eventId: string;       // uuid v4
  eventType: string;     // e.g. 'member.enrolled'
  tenantId: string;
  timestamp: string;     // ISO 8601
  version: '1.0';
  payload: T;
}
```

Payload schemas:

```ts
interface MemberEnrolledPayload { memberId: string; channel: string; enrolledAt: string; tierId: string; }
interface MemberUpdatedPayload  { memberId: string; changedFields: string[]; }
interface MemberDeletedPayload  { memberId: string; deletedAt: string; }
interface PointsEarnedPayload   { memberId: string; transactionId: string; points: number; balanceAfter: number; }
interface PointsRedeemedPayload { memberId: string; transactionId?: string; offerId?: string; points: number; balanceAfter: number; }
interface TierUpgradedPayload   { memberId: string; fromTierId: string; toTierId: string; effectiveAt: string; }
interface TierDowngradedPayload { memberId: string; fromTierId: string; toTierId: string; effectiveAt: string; }
interface TransactionVoidedPayload { transactionId: string; memberId: string; reason: string; pointsReversed: number; }
interface WebhookDeliveryPayload { webhookId: string; eventType: string; targetUrl: string; attempt: number; success: boolean; responseStatus?: number; }
```

## Registering a new Service Bus subscription

```ts
import { ServiceBusSubscriber, EVENT_TYPES, MemberEnrolledEvent } from '@loyalty/shared-events';
import { createLogger } from '@loyalty/shared-logger';

const logger = createLogger('notification-service');
const subscriber = new ServiceBusSubscriber({
  connectionString: process.env.SERVICE_BUS_CONNECTION_STRING!,
  logger,
});

subscriber.subscribe<MemberEnrolledEvent['payload']>(
  EVENT_TYPES.MEMBER_ENROLLED,
  'notification-service-sub',
  async (envelope) => {
    logger.info({ eventId: envelope.eventId, tenantId: envelope.tenantId }, 'received');
    // handler logic
  },
  { maxDeliveryCount: 10, deadLetterOnProcessFailure: true },
);

// on shutdown
process.on('SIGTERM', async () => { await subscriber.close(); });
```

## Shared TypeScript types — full source

(Copy-paste reference for all entities in `@loyalty/shared-types`)

```ts
// Branded ID types
export type MemberId = string & { readonly __brand: 'MemberId' };
export type TenantId = string & { readonly __brand: 'TenantId' };
export type TransactionId = string & { readonly __brand: 'TransactionId' };
export type OfferId = string & { readonly __brand: 'OfferId' };
export type TierId = string & { readonly __brand: 'TierId' };
export type LedgerEntryId = string & { readonly __brand: 'LedgerEntryId' };
export type RedemptionId = string & { readonly __brand: 'RedemptionId' };
export type WebhookId = string & { readonly __brand: 'WebhookId' };

// Member
export type MemberStatus = 'active' | 'suspended' | 'closed';

export interface MemberPII {
  email?: string;
  phone: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
}

export interface Member {
  id: MemberId;
  tenantId: TenantId;
  status: MemberStatus;
  tierId: TierId;
  pointsBalance: number;
  phoneHash: string;
  emailEncrypted?: string;
  phoneEncrypted: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  communicationPrefs?: Record<string, unknown>;
  enrolledAt: string;
  channel: TransactionChannel;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
}

// Tier
export interface TierBenefits {
  earnMultiplier: number;
  bonusPointsOnEnroll?: number;
  freeShipping?: boolean;
  birthdayBonus?: number;
  customBenefits?: Record<string, unknown>;
}

export interface Tier {
  id: TierId;
  tenantId: TenantId;
  name: string;
  rank: number;
  thresholdPoints: number;
  thresholdSpendCents?: number;
  benefits: TierBenefits;
  createdAt: string;
  updatedAt: string;
}

// Transaction
export type TransactionChannel = 'pos' | 'ecommerce' | 'mobile' | 'admin';

export interface TransactionItem {
  sku: string;
  categoryCode?: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Transaction {
  id: TransactionId;
  tenantId: TenantId;
  memberId: MemberId;
  channel: TransactionChannel;
  amountCents: number;
  currency: string;
  locationId?: string;
  items?: TransactionItem[];
  idempotencyKey: string;
  voidedAt?: string;
  voidReason?: string;
  createdAt: string;
}

// Points ledger
export type LedgerReason =
  | 'earn' | 'redeem' | 'void' | 'expire' | 'adjust' | 'bonus' | 'transfer';

export interface PointsLedgerEntry {
  id: LedgerEntryId;
  tenantId: TenantId;
  memberId: MemberId;
  transactionId?: TransactionId;
  delta: number;
  balanceAfter: number;
  reason: LedgerReason;
  note?: string;
  createdAt: string;
}

// Offer
export type OfferType = 'percent' | 'fixed' | 'bogo' | 'threshold' | 'referral';

export interface Offer {
  id: OfferId;
  tenantId: TenantId;
  code: string;
  name: string;
  description?: string;
  type: OfferType;
  value: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  eligibilityRules?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Redemption {
  id: RedemptionId;
  tenantId: TenantId;
  offerId: OfferId;
  memberId: MemberId;
  transactionId?: TransactionId;
  valueAppliedCents: number;
  redeemedAt: string;
}

// Tenant
export type TenantStatus = 'active' | 'suspended' | 'deprovisioned';

export interface TenantConfig {
  baseEarnRate: number;
  pointsExpiryDays?: number;
  tierMode: 'points' | 'spend' | 'hybrid';
  currency: string;
  featureFlags?: Record<string, boolean>;
}

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  status: TenantStatus;
  dbSecretName: string;
  config: TenantConfig;
  createdAt: string;
  updatedAt: string;
}

// Webhook
export type WebhookEventType =
  | 'member.enrolled' | 'member.updated' | 'member.deleted'
  | 'points.earned' | 'points.redeemed'
  | 'tier.upgraded' | 'tier.downgraded'
  | 'transaction.voided' | 'webhook.delivery';

export interface WebhookConfig {
  id: WebhookId;
  tenantId: TenantId;
  eventType: WebhookEventType;
  targetUrl: string;
  secretHash: string;
  isActive: boolean;
  retryCount: number;
  createdAt: string;
}

// Pagination & errors
export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}

export interface ApiError {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  [key: string]: unknown;
}
```

## Build commands

From repo root:
```
pnpm install
pnpm build     # 0 errors across 14 workspace projects
pnpm test      # shared tests + service health tests
pnpm lint      # 0 errors
```

## Infra output keys services should consume

From `/infra/infra-outputs.json`:
- `keyVaultUri` → `KEY_VAULT_URI`
- `appInsightsConnectionString` → `APPLICATIONINSIGHTS_CONNECTION_STRING`
- `serviceBusNamespace` — resolved into SERVICE_BUS_CONNECTION_STRING via Key Vault secret `service-bus-connection-string`
- `redisHostname` — resolved into `REDIS_URL` via Key Vault secret `redis-connection-string`
- `sqlServerFqdn` + `controlPlaneDbName` — form the `CONTROL_PLANE_SQL_CONNSTR` (credentials via Managed Identity or Key Vault)

Subscription: `13e630db-8816-46b8-896e-511fab75a53a`
Resource group: `loyalty-platform-dev`
