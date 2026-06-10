import { v4 as uuidv4 } from 'uuid';
import { NotFoundError, ValidationError, AppError } from '@loyalty/shared-errors';
import { EVENT_TYPES } from '@loyalty/shared-events';
import type { MemberStatus } from '@loyalty/shared-types';
import type { BalanceCache } from './cache';
import type { EventPublisher } from './events';
import type { PiiKeyProvider } from './pii';
import { decryptPII, encryptPII, hashLookup, normalizePhone } from './pii';
import type { MemberRepository, MemberRow, TierRow } from './repository';
import { canTransition } from './status';
import type {
  EnrollMemberInput,
  LedgerEntryDTO,
  MemberDTO,
  MemberSummaryDTO,
  PaginatedLedger,
  UpdateMemberInput,
} from './schemas';
import { decodeCursor, encodeCursor } from './cursor';

export class InvalidStatusTransitionError extends AppError {
  constructor(from: MemberStatus, to: MemberStatus) {
    super(`Invalid member status transition: ${from} -> ${to}`, 'INVALID_STATUS_TRANSITION', 422, {
      from,
      to,
    });
  }
}

export class TenantMismatchError extends AppError {
  constructor() {
    super('Tenant mismatch for member', 'TENANT_MISMATCH', 403);
  }
}

export class MemberNotFoundError extends AppError {
  constructor(memberId: string) {
    super(`Member not found: ${memberId}`, 'MEMBER_NOT_FOUND', 404, { memberId });
  }
}

export class DuplicateMemberError extends AppError {
  constructor(existingMemberId: string) {
    super('Duplicate member', 'DUPLICATE_MEMBER', 409, { existingMemberId });
  }
}

export interface MemberServiceDeps {
  repo: MemberRepository;
  cache: BalanceCache;
  publisher: EventPublisher;
  pii: PiiKeyProvider;
  hashPepper: string;
}

export class MemberService {
  constructor(private readonly deps: MemberServiceDeps) {}

  // ---------- helpers ----------

  private hash(value: string, tenantId: string): string {
    return hashLookup(value, tenantId, this.deps.hashPepper);
  }

  private encrypt(plaintext: string): string {
    return encryptPII(plaintext, this.deps.pii);
  }

  private toDTO(row: MemberRow, tier: TierRow, balance: number): MemberDTO {
    return {
      id: row.id,
      tenantId: row.tenantId,
      status: row.status,
      tierId: row.tierId,
      tierName: tier.name,
      pointsBalance: balance,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.emailEncrypted ? decryptPII(row.emailEncrypted, this.deps.pii) : undefined,
      phone: decryptPII(row.phoneEncrypted, this.deps.pii),
      dateOfBirth: row.dateOfBirth,
      enrolledChannel: row.enrolledChannel,
      enrolledAt: row.enrolledAt,
      communicationPrefs: row.communicationPrefs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async resolveBalance(tenantId: string, memberId: string): Promise<number> {
    const cached = await this.deps.cache.get(tenantId, memberId);
    if (cached !== null) return cached;
    const balance = await this.deps.repo.getBalance(tenantId, memberId);
    await this.deps.cache.set(tenantId, memberId, balance);
    return balance;
  }

  private async tierOrThrow(tenantId: string, tierId: string): Promise<TierRow> {
    const tier = await this.deps.repo.getTier(tenantId, tierId);
    if (!tier) throw new NotFoundError(`Tier not found: ${tierId}`);
    return tier;
  }

  private assertTenant(tenantId: string, row: MemberRow): void {
    if (row.tenantId !== tenantId) throw new TenantMismatchError();
  }

  // ---------- operations ----------

  public async enroll(tenantId: string, input: EnrollMemberInput): Promise<MemberDTO> {
    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) throw new ValidationError('Invalid phone');
    const phoneHash = this.hash(normalizedPhone, tenantId);
    const emailHash = input.email ? this.hash(input.email, tenantId) : undefined;

    const dupPhone = await this.deps.repo.findByPhoneHash(tenantId, phoneHash);
    if (dupPhone) throw new DuplicateMemberError(dupPhone.id);
    if (emailHash) {
      const dupEmail = await this.deps.repo.findByEmailHash(tenantId, emailHash);
      if (dupEmail) throw new DuplicateMemberError(dupEmail.id);
    }

    const defaultTier = await this.deps.repo.getDefaultTier(tenantId);
    if (!defaultTier) throw new NotFoundError('No default tier configured for tenant');

    const id = uuidv4();
    const row = await this.deps.repo.create({
      id,
      tenantId,
      tierId: defaultTier.id,
      emailHash,
      phoneHash,
      emailEncrypted: input.email ? this.encrypt(input.email) : undefined,
      phoneEncrypted: this.encrypt(normalizedPhone),
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      enrolledChannel: input.enrolledChannel,
    });

    await this.deps.publisher.publish(
      EVENT_TYPES.MEMBER_ENROLLED,
      EVENT_TYPES.MEMBER_ENROLLED,
      {
        memberId: row.id,
        channel: row.enrolledChannel,
        enrolledAt: row.enrolledAt,
        tierId: row.tierId,
      },
      tenantId,
    );

    return this.toDTO(row, defaultTier, 0);
  }

  public async getById(tenantId: string, id: string): Promise<MemberDTO> {
    const row = await this.deps.repo.getById(tenantId, id);
    if (!row) throw new MemberNotFoundError(id);
    this.assertTenant(tenantId, row);
    const tier = await this.tierOrThrow(tenantId, row.tierId);
    const balance = await this.resolveBalance(tenantId, row.id);
    return this.toDTO(row, tier, balance);
  }

  public async lookupByPhone(tenantId: string, phone: string): Promise<MemberSummaryDTO> {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new ValidationError('Invalid phone');
    const row = await this.deps.repo.findByPhoneHash(tenantId, this.hash(normalized, tenantId));
    if (!row) throw new MemberNotFoundError('by-phone');
    return this.toSummary(tenantId, row);
  }

  public async lookupByEmail(tenantId: string, email: string): Promise<MemberSummaryDTO> {
    const row = await this.deps.repo.findByEmailHash(tenantId, this.hash(email, tenantId));
    if (!row) throw new MemberNotFoundError('by-email');
    return this.toSummary(tenantId, row);
  }

  private async toSummary(tenantId: string, row: MemberRow): Promise<MemberSummaryDTO> {
    const tier = await this.tierOrThrow(tenantId, row.tierId);
    const balance = await this.resolveBalance(tenantId, row.id);
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      tierId: tier.id,
      tierName: tier.name,
      pointsBalance: balance,
      eligibleOffers: [], // Phase 2: populated by offer-service
    };
  }

  public async update(tenantId: string, id: string, patch: UpdateMemberInput): Promise<MemberDTO> {
    const existing = await this.deps.repo.getById(tenantId, id);
    if (!existing) throw new MemberNotFoundError(id);
    this.assertTenant(tenantId, existing);

    const changed: string[] = [];
    const repoPatch: Parameters<MemberRepository['update']>[2] = {};
    if (patch.firstName !== undefined && patch.firstName !== existing.firstName) {
      repoPatch.firstName = patch.firstName;
      changed.push('firstName');
    }
    if (patch.lastName !== undefined && patch.lastName !== existing.lastName) {
      repoPatch.lastName = patch.lastName;
      changed.push('lastName');
    }
    if (patch.email !== undefined) {
      repoPatch.emailHash = this.hash(patch.email, tenantId);
      repoPatch.emailEncrypted = this.encrypt(patch.email);
      changed.push('email');
      // duplicate check
      const dup = await this.deps.repo.findByEmailHash(tenantId, repoPatch.emailHash);
      if (dup && dup.id !== id) throw new DuplicateMemberError(dup.id);
    }
    if (patch.phone !== undefined) {
      const normalized = normalizePhone(patch.phone);
      if (!normalized) throw new ValidationError('Invalid phone');
      repoPatch.phoneHash = this.hash(normalized, tenantId);
      repoPatch.phoneEncrypted = this.encrypt(normalized);
      changed.push('phone');
      const dup = await this.deps.repo.findByPhoneHash(tenantId, repoPatch.phoneHash);
      if (dup && dup.id !== id) throw new DuplicateMemberError(dup.id);
    }
    if (patch.communicationPrefs !== undefined) {
      repoPatch.communicationPrefs = patch.communicationPrefs;
      changed.push('communicationPrefs');
    }

    const updated = await this.deps.repo.update(tenantId, id, repoPatch);
    if (!updated) throw new MemberNotFoundError(id);

    if (changed.length > 0) {
      await this.deps.publisher.publish(
        EVENT_TYPES.MEMBER_UPDATED,
        EVENT_TYPES.MEMBER_UPDATED,
        { memberId: id, changedFields: changed },
        tenantId,
      );
    }

    const tier = await this.tierOrThrow(tenantId, updated.tierId);
    const balance = await this.resolveBalance(tenantId, updated.id);
    return this.toDTO(updated, tier, balance);
  }

  public async setStatus(
    tenantId: string,
    id: string,
    status: MemberStatus,
    reason: string,
  ): Promise<MemberDTO> {
    const existing = await this.deps.repo.getById(tenantId, id);
    if (!existing) throw new MemberNotFoundError(id);
    this.assertTenant(tenantId, existing);
    if (!canTransition(existing.status, status)) {
      throw new InvalidStatusTransitionError(existing.status, status);
    }
    const updated = await this.deps.repo.setStatus(tenantId, id, status);
    if (!updated) throw new MemberNotFoundError(id);

    await this.deps.publisher.publish(
      EVENT_TYPES.MEMBER_UPDATED,
      EVENT_TYPES.MEMBER_UPDATED,
      { memberId: id, changedFields: ['status'], reason },
      tenantId,
    );

    // Closed → trigger GDPR scrub path (same as DELETE).
    if (status === 'closed') {
      await this.deleteMember(tenantId, id);
    }

    const tier = await this.tierOrThrow(tenantId, updated.tierId);
    const balance = await this.resolveBalance(tenantId, updated.id);
    return this.toDTO(updated, tier, balance);
  }

  public async deleteMember(tenantId: string, id: string): Promise<void> {
    const existing = await this.deps.repo.getById(tenantId, id);
    if (!existing) throw new MemberNotFoundError(id);
    this.assertTenant(tenantId, existing);
    const deleted = await this.deps.repo.softDelete(tenantId, id);
    if (!deleted) throw new MemberNotFoundError(id);
    await this.deps.cache.del(tenantId, id);
    await this.deps.publisher.publish(
      EVENT_TYPES.MEMBER_DELETED,
      EVENT_TYPES.MEMBER_DELETED,
      { memberId: id, deletedAt: deleted.deletedAt ?? new Date().toISOString() },
      tenantId,
    );
  }

  public async exportMember(tenantId: string, id: string): Promise<Record<string, unknown>> {
    // For GDPR export we allow reading soft-deleted rows as well — but repo
    // masks deleted rows, so we fetch directly by id via findById first.
    const row = await this.deps.repo.getById(tenantId, id);
    if (!row) throw new MemberNotFoundError(id);
    this.assertTenant(tenantId, row);
    const tier = await this.tierOrThrow(tenantId, row.tierId);
    const balance = await this.resolveBalance(tenantId, id);
    const ledger = await this.deps.repo.listLedger(tenantId, id, undefined, 200);
    const dto = this.toDTO(row, tier, balance);
    return {
      profile: dto,
      ledgerSummary: {
        count: ledger.length,
        balance,
      },
      transactions: {
        note: 'Full transaction export deferred to T-11 admin API',
      },
    };
  }

  public async listLedger(
    tenantId: string,
    id: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<PaginatedLedger> {
    const existing = await this.deps.repo.getById(tenantId, id);
    if (!existing) throw new MemberNotFoundError(id);
    this.assertTenant(tenantId, existing);
    const after = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.deps.repo.listLedger(tenantId, id, after, limit);
    const items: LedgerEntryDTO[] = rows.map((r) => ({
      id: r.id,
      memberId: r.memberId,
      transactionId: r.transactionId,
      delta: r.delta,
      balanceAfter: r.balanceAfter,
      reason: r.reason,
      note: r.note,
      createdAt: r.createdAt,
    }));
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: items.length === limit && last ? encodeCursor(last.id) : undefined,
    };
  }
}
