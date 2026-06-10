import type { MemberStatus } from '@loyalty/shared-types';

/**
 * Storage shape used by the service. The SQL column layout in T-03 is:
 *   members(id, tenant_id, status, tier_id, email_hash, phone_hash,
 *           email_encrypted, phone_encrypted, first_name, last_name,
 *           date_of_birth, enrolled_channel, communication_prefs_json,
 *           enrolled_at, is_deleted, deleted_at, created_at, updated_at)
 *   tiers(id, tenant_id, name, sort_order, ...)
 *   points_ledger(id, tenant_id, member_id, transaction_id, delta,
 *                 balance_after, reason, note, created_at)
 *   v_member_balance(tenant_id, member_id, balance)  — sum view
 */

export interface MemberRow {
  id: string;
  tenantId: string;
  status: MemberStatus;
  tierId: string;
  emailHash?: string;
  phoneHash: string;
  emailEncrypted?: string;
  phoneEncrypted: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  enrolledChannel: string;
  communicationPrefs?: Record<string, unknown>;
  enrolledAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TierRow {
  id: string;
  name: string;
  sortOrder: number;
}

export interface LedgerRow {
  id: string;
  memberId: string;
  transactionId?: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  note?: string;
  createdAt: string;
}

export interface CreateMemberInput {
  id: string;
  tenantId: string;
  tierId: string;
  emailHash?: string;
  phoneHash: string;
  emailEncrypted?: string;
  phoneEncrypted: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  enrolledChannel: string;
}

export interface MemberRepository {
  getDefaultTier(tenantId: string): Promise<TierRow | null>;
  getTier(tenantId: string, tierId: string): Promise<TierRow | null>;
  findByEmailHash(tenantId: string, emailHash: string): Promise<MemberRow | null>;
  findByPhoneHash(tenantId: string, phoneHash: string): Promise<MemberRow | null>;
  getById(tenantId: string, id: string): Promise<MemberRow | null>;
  create(input: CreateMemberInput): Promise<MemberRow>;
  update(
    tenantId: string,
    id: string,
    patch: Partial<
      Pick<
        MemberRow,
        | 'firstName'
        | 'lastName'
        | 'emailHash'
        | 'emailEncrypted'
        | 'phoneHash'
        | 'phoneEncrypted'
        | 'communicationPrefs'
      >
    >,
  ): Promise<MemberRow | null>;
  setStatus(tenantId: string, id: string, status: MemberStatus): Promise<MemberRow | null>;
  softDelete(tenantId: string, id: string): Promise<MemberRow | null>;
  getBalance(tenantId: string, memberId: string): Promise<number>;
  listLedger(
    tenantId: string,
    memberId: string,
    after: string | undefined,
    limit: number,
  ): Promise<LedgerRow[]>;
}
