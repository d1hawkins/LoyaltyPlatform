/**
 * Offer service business logic. Orchestrates offer CRUD, eligibility
 * evaluation, redemption flow, code management, and event publication.
 */

import { randomUUID } from 'crypto';
import type { Logger } from '@loyalty/shared-logger';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AppError,
} from '@loyalty/shared-errors';
import type {
  EventPublisher,
  LoyaltyEngineClient,
  MemberClient,
  OfferDb,
  OfferRow,
  RedemptionRow,
} from './deps';
import { evaluateEligibility } from './eligibility';
import { generateCodes } from './code-generator';
import type { CreateOfferInput, UpdateOfferInput, CreateRedemptionInput, GenerateCodesInput } from './schemas';

export interface OfferServiceDeps {
  db: OfferDb;
  publisher: EventPublisher;
  engineClient: LoyaltyEngineClient;
  memberClient: MemberClient;
  logger: Logger;
}

export class OfferService {
  constructor(private readonly deps: OfferServiceDeps) {}

  // ───────── Offer CRUD ─────────

  async createOffer(tenantId: string, input: CreateOfferInput): Promise<OfferRow> {
    const now = new Date().toISOString();
    const offer: OfferRow = {
      offerId: randomUUID(),
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      value: input.value,
      minPurchase: input.minPurchase ?? null,
      pointsCost: input.pointsCost ?? null,
      conditionsJson: input.conditionsJson ?? null,
      targetingJson: input.targetingJson ?? null,
      validFrom: input.validFrom,
      validTo: input.validTo,
      maxRedemptions: input.maxRedemptions ?? null,
      currentRedemptions: 0,
      perMemberLimit: input.perMemberLimit,
      isStackable: input.isStackable,
      isActive: input.isActive,
      minVisits: input.minVisits ?? null,
      visitWindowDays: input.visitWindowDays ?? null,
      visitResetOnRedeem: input.visitResetOnRedeem ?? false,
      visitMinSpendCents: input.visitMinSpendCents ?? null,
      visitMinItems: input.visitMinItems ?? null,
      visitMinUniqueSku: input.visitMinUniqueSku ?? null,
      visitChannels: input.visitChannels ?? null,
      visitStoreIds: input.visitStoreIds ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.db.createOffer(tenantId, offer);
    this.deps.logger.info({ tenantId, offerId: offer.offerId }, 'offer.created');
    return offer;
  }

  async updateOffer(tenantId: string, offerId: string, input: UpdateOfferInput): Promise<OfferRow> {
    const existing = await this.deps.db.getOffer(tenantId, offerId);
    if (!existing) throw new NotFoundError(`offer ${offerId} not found`);

    const updates: Partial<OfferRow> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description ?? null;
    if (input.type !== undefined) updates.type = input.type;
    if (input.value !== undefined) updates.value = input.value;
    if (input.minPurchase !== undefined) updates.minPurchase = input.minPurchase ?? null;
    if (input.pointsCost !== undefined) updates.pointsCost = input.pointsCost ?? null;
    if (input.conditionsJson !== undefined) updates.conditionsJson = input.conditionsJson ?? null;
    if (input.targetingJson !== undefined) updates.targetingJson = input.targetingJson ?? null;
    if (input.validFrom !== undefined) updates.validFrom = input.validFrom;
    if (input.validTo !== undefined) updates.validTo = input.validTo;
    if (input.maxRedemptions !== undefined) updates.maxRedemptions = input.maxRedemptions ?? null;
    if (input.perMemberLimit !== undefined) updates.perMemberLimit = input.perMemberLimit;
    if (input.isStackable !== undefined) updates.isStackable = input.isStackable;
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.minVisits !== undefined) updates.minVisits = input.minVisits ?? null;
    if (input.visitWindowDays !== undefined) updates.visitWindowDays = input.visitWindowDays ?? null;
    if (input.visitResetOnRedeem !== undefined) updates.visitResetOnRedeem = input.visitResetOnRedeem ?? false;
    if (input.visitMinSpendCents !== undefined) updates.visitMinSpendCents = input.visitMinSpendCents ?? null;
    if (input.visitMinItems !== undefined) updates.visitMinItems = input.visitMinItems ?? null;
    if (input.visitMinUniqueSku !== undefined) updates.visitMinUniqueSku = input.visitMinUniqueSku ?? null;
    if (input.visitChannels !== undefined) updates.visitChannels = input.visitChannels ?? null;
    if (input.visitStoreIds !== undefined) updates.visitStoreIds = input.visitStoreIds ?? null;

    await this.deps.db.updateOffer(tenantId, offerId, updates);
    this.deps.logger.info({ tenantId, offerId }, 'offer.updated');
    return { ...existing, ...updates, updatedAt: new Date().toISOString() };
  }

  async getOffer(tenantId: string, offerId: string): Promise<OfferRow> {
    const offer = await this.deps.db.getOffer(tenantId, offerId);
    if (!offer) throw new NotFoundError(`offer ${offerId} not found`);
    return offer;
  }

  async listOffers(tenantId: string, filters?: { type?: string; active?: boolean }): Promise<OfferRow[]> {
    return this.deps.db.listOffers(tenantId, filters);
  }

  async getQualifiedVisitCountForMilestone(tenantId: string, memberId: string, config: {
    windowDays?: number | null; minSpendCents?: number | null; minItems?: number | null;
    channels?: string[] | null; storeIds?: string[] | null; visitCountMode?: string;
  }): Promise<number> {
    return this.deps.db.getQualifiedVisitCount(tenantId, memberId, config as Parameters<typeof this.deps.db.getQualifiedVisitCount>[2]);
  }

  async deactivateOffer(tenantId: string, offerId: string): Promise<void> {
    const existing = await this.deps.db.getOffer(tenantId, offerId);
    if (!existing) throw new NotFoundError(`offer ${offerId} not found`);
    await this.deps.db.deactivateOffer(tenantId, offerId);
    this.deps.logger.info({ tenantId, offerId }, 'offer.deactivated');
  }

  // ───────── Personalized eligible offers ─────────

  async getEligibleOffers(tenantId: string, memberId: string): Promise<Array<OfferRow & {
    eligibility: { eligible: boolean; reasons: string[] };
    visitProgress?: { current: number; required: number; qualified: boolean };
    code?: string | null;
  }>> {
    const member = await this.deps.memberClient.getMember(tenantId, memberId);
    if (!member) throw new NotFoundError(`member ${memberId} not found`);

    const now = new Date().toISOString();
    const offers = await this.deps.db.listOffers(tenantId, { active: true });

    const results: Array<OfferRow & {
      eligibility: { eligible: boolean; reasons: string[] };
      visitProgress?: { current: number; required: number; qualified: boolean };
      code?: string | null;
    }> = [];

    for (const offer of offers) {
      const memberRedemptionCount = await this.deps.db.countMemberRedemptions(tenantId, memberId, offer.offerId);

      // Compute visit data if this offer requires visits
      let visitData: { qualifiedVisitCount: number } | undefined;
      let visitProgress: { current: number; required: number; qualified: boolean } | undefined;

      if (offer.minVisits && offer.minVisits > 0) {
        const qualifiedVisitCount = await this.deps.db.getQualifiedVisitCount(tenantId, memberId, {
          windowDays: offer.visitWindowDays,
          minSpendCents: offer.visitMinSpendCents,
          minItems: offer.visitMinItems,
          channels: offer.visitChannels,
          storeIds: offer.visitStoreIds,
          visitCountMode: offer.visitCountMode || 'per-transaction',
        });
        visitData = { qualifiedVisitCount };
        visitProgress = {
          current: qualifiedVisitCount,
          required: offer.minVisits,
          qualified: qualifiedVisitCount >= offer.minVisits,
        };
      }

      const eligibility = evaluateEligibility(member, offer, memberRedemptionCount, now, visitData);

      // Look up assigned code for this member (if any)
      const assignedCode = await this.deps.db.getMemberCodeForOffer(tenantId, memberId, offer.offerId);

      // Include all offers (eligible or not) so visit progress can be shown
      results.push({ ...offer, eligibility, visitProgress, code: assignedCode?.code ?? null });
    }

    // Sort: eligible first, then offers with points_cost (redeemable), then by valid_to (soonest expiring first)
    results.sort((a, b) => {
      const aEligible = a.eligibility.eligible ? 0 : 1;
      const bEligible = b.eligibility.eligible ? 0 : 1;
      if (aEligible !== bEligible) return aEligible - bEligible;
      const aHasCost = a.pointsCost !== null ? 0 : 1;
      const bHasCost = b.pointsCost !== null ? 0 : 1;
      if (aHasCost !== bHasCost) return aHasCost - bHasCost;
      return new Date(a.validTo).getTime() - new Date(b.validTo).getTime();
    });

    return results;
  }

  // ───────── Redemption ─────────

  async redeemOffer(tenantId: string, input: CreateRedemptionInput): Promise<{
    redemptionId: string;
    discountValue: number;
    pointsUsed: number;
    newBalance: number;
  }> {
    // 1. Load offer
    const offer = await this.deps.db.getOffer(tenantId, input.offerId);
    if (!offer) throw new NotFoundError(`offer ${input.offerId} not found`);

    // 2. Load member
    const member = await this.deps.memberClient.getMember(tenantId, input.memberId);
    if (!member) throw new NotFoundError(`member ${input.memberId} not found`);

    // 3. Check eligibility (including visit count if visit-based offer)
    const memberRedemptionCount = await this.deps.db.countMemberRedemptions(
      tenantId, input.memberId, input.offerId,
    );
    let visitData: { qualifiedVisitCount: number } | undefined;
    if (offer.minVisits && offer.minVisits > 0) {
      const qualifiedVisitCount = await this.deps.db.getQualifiedVisitCount(tenantId, input.memberId, {
        windowDays: offer.visitWindowDays,
        minSpendCents: offer.visitMinSpendCents,
        minItems: offer.visitMinItems,
        channels: offer.visitChannels,
        storeIds: offer.visitStoreIds,
        visitCountMode: offer.visitCountMode || 'per-transaction',
      });
      visitData = { qualifiedVisitCount };
    }
    const eligibility = evaluateEligibility(member, offer, memberRedemptionCount, new Date(), visitData);
    if (!eligibility.eligible) {
      throw new AppError(
        `Offer not eligible: ${eligibility.reasons.join(', ')}`,
        'OFFER_NOT_ELIGIBLE',
        422,
      );
    }

    // 4. If redemptionCode provided, validate code (including member binding)
    if (input.redemptionCode) {
      const codeRow = await this.deps.db.getCode(tenantId, input.redemptionCode);
      if (!codeRow) {
        throw new AppError('Invalid coupon code', 'INVALID_CODE', 422);
      }
      if (codeRow.offerId !== input.offerId) {
        throw new AppError('Code does not match this offer', 'CODE_OFFER_MISMATCH', 422);
      }
      if (codeRow.memberId && codeRow.memberId !== input.memberId) {
        throw new AppError('This code belongs to another member', 'CODE_MEMBER_MISMATCH', 403);
      }
      if (codeRow.status === 'redeemed') {
        throw new AppError('This code has already been used', 'CODE_ALREADY_USED', 409);
      }
      if (codeRow.status === 'expired') {
        throw new AppError('This code has expired', 'CODE_EXPIRED', 422);
      }
    }

    // 4b. If visit-based offer requires a code, enforce it
    if (offer.minVisits && offer.minVisits > 0 && !input.redemptionCode) {
      // Check if member has an assigned code for this offer
      const assignedCode = await this.deps.db.getMemberCodeForOffer(tenantId, input.memberId, input.offerId);
      if (assignedCode) {
        throw new AppError('Coupon code required for visit-based offers', 'CODE_REQUIRED', 422);
      }
    }

    // 5. If points_cost, call loyalty engine to debit points
    let pointsUsed = 0;
    let newBalance = member.pointsBalance;
    let engineRedemptionId: string | undefined;

    if (offer.pointsCost && offer.pointsCost > 0) {
      const engineResult = await this.deps.engineClient.redeemPoints(tenantId, {
        memberId: input.memberId,
        offerId: input.offerId,
        pointsToBurn: offer.pointsCost,
      });
      pointsUsed = engineResult.pointsUsed;
      newBalance = engineResult.newBalance;
      engineRedemptionId = engineResult.redemptionId;
    }

    // 6. Calculate discount value
    const discountValue = offer.value;

    // 7. Create redemption record
    const redemptionId = randomUUID();
    const now = new Date().toISOString();
    const redemption: RedemptionRow = {
      redemptionId,
      memberId: input.memberId,
      offerId: input.offerId,
      channel: input.channel,
      pointsUsed,
      discountValue,
      redemptionCode: input.redemptionCode ?? null,
      status: 'completed',
      redeemedAt: now,
      reversedAt: null,
      createdAt: now,
    };

    await this.deps.db.createRedemption(tenantId, redemption);
    await this.deps.db.incrementOfferRedemptions(tenantId, input.offerId);

    // 8. Mark code as redeemed if applicable
    if (input.redemptionCode) {
      await this.deps.db.redeemCode(tenantId, input.redemptionCode, input.memberId);
    }

    // 9. Publish points.redeemed event if points were deducted
    if (pointsUsed > 0) {
      await this.deps.publisher.publish(
        'points.redeemed',
        'points.redeemed',
        {
          memberId: input.memberId,
          redemptionId: engineRedemptionId ?? redemptionId,
          offerId: input.offerId,
          points: pointsUsed,
          balanceAfter: newBalance,
        },
        tenantId,
      );
    }

    this.deps.logger.info(
      { tenantId, redemptionId, offerId: input.offerId, memberId: input.memberId, pointsUsed },
      'offer.redeemed',
    );

    return { redemptionId, discountValue, pointsUsed, newBalance };
  }

  // ───────── Reverse Redemption ─────────

  async reverseRedemption(tenantId: string, redemptionId: string): Promise<{ reversed: true }> {
    const redemption = await this.deps.db.getRedemption(tenantId, redemptionId);
    if (!redemption) throw new NotFoundError(`redemption ${redemptionId} not found`);
    if (redemption.status === 'reversed') {
      throw new ConflictError('redemption already reversed');
    }

    // Reverse in DB
    await this.deps.db.reverseRedemption(tenantId, redemptionId);
    await this.deps.db.decrementOfferRedemptions(tenantId, redemption.offerId);

    // Unredeeem code if applicable
    if (redemption.redemptionCode) {
      await this.deps.db.unredeemCode(tenantId, redemption.redemptionCode);
    }

    // Restore points if points were used
    if (redemption.pointsUsed > 0) {
      await this.deps.engineClient.reverseRedemption(tenantId, {
        memberId: redemption.memberId,
        pointsToRestore: redemption.pointsUsed,
      });
    }

    this.deps.logger.info({ tenantId, redemptionId }, 'redemption.reversed');
    return { reversed: true };
  }

  // ───────── Code Generation ─────────

  async generateCodes(tenantId: string, offerId: string, input: GenerateCodesInput): Promise<{ codes: string[]; count: number }> {
    const offer = await this.deps.db.getOffer(tenantId, offerId);
    if (!offer) throw new NotFoundError(`offer ${offerId} not found`);

    const codes = generateCodes(input.count, input.prefix);

    const codeRows = codes.map((code) => ({
      code,
      offerId,
      memberId: null,
      status: 'available' as const,
      assignedAt: null,
      redeemedAt: null,
    }));

    await this.deps.db.createCodes(tenantId, codeRows);

    this.deps.logger.info({ tenantId, offerId, count: codes.length }, 'codes.generated');
    return { codes, count: codes.length };
  }

  async insertOfferCode(tenantId: string, data: {
    code: string;
    offerId: string;
    memberId: string;
    status: 'assigned';
  }): Promise<void> {
    await this.deps.db.createCodes(tenantId, [{
      code: data.code,
      offerId: data.offerId,
      memberId: data.memberId,
      status: data.status,
      assignedAt: new Date().toISOString(),
      redeemedAt: null,
    }]);
  }

  async listCodes(tenantId: string, offerId: string, status?: string): Promise<{ codes: Array<{ code: string; status: string; memberId: string | null }> }> {
    const offer = await this.deps.db.getOffer(tenantId, offerId);
    if (!offer) throw new NotFoundError(`offer ${offerId} not found`);

    const codes = await this.deps.db.listCodes(tenantId, offerId, status);
    return {
      codes: codes.map((c) => ({ code: c.code, status: c.status, memberId: c.memberId })),
    };
  }
}
