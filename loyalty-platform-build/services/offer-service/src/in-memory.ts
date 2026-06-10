/**
 * In-memory adapters for dev mode and unit/integration tests.
 */

import type {
  EventPublisher,
  LoyaltyEngineClient,
  MemberClient,
  MemberInfo,
  OfferCodeRow,
  OfferDb,
  OfferRow,
  RedemptionRow,
} from './deps';

export class InMemoryOfferDb implements OfferDb {
  // Keyed by `${tenantId}:${offerId}`
  public offers = new Map<string, OfferRow>();
  // Keyed by `${tenantId}:${redemptionId}`
  public redemptions = new Map<string, RedemptionRow>();
  // Keyed by `${tenantId}:${code}`
  public codes = new Map<string, OfferCodeRow>();

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  async createOffer(tenantId: string, offer: OfferRow): Promise<void> {
    this.offers.set(this.key(tenantId, offer.offerId), offer);
  }

  async updateOffer(tenantId: string, offerId: string, updates: Partial<OfferRow>): Promise<void> {
    const k = this.key(tenantId, offerId);
    const existing = this.offers.get(k);
    if (existing) {
      this.offers.set(k, { ...existing, ...updates, updatedAt: new Date().toISOString() });
    }
  }

  async getOffer(tenantId: string, offerId: string): Promise<OfferRow | null> {
    return this.offers.get(this.key(tenantId, offerId)) ?? null;
  }

  async listOffers(tenantId: string, filters?: { type?: string; active?: boolean }): Promise<OfferRow[]> {
    const prefix = `${tenantId}:`;
    const results: OfferRow[] = [];
    for (const [k, v] of this.offers) {
      if (!k.startsWith(prefix)) continue;
      if (filters?.type && v.type !== filters.type) continue;
      if (filters?.active !== undefined && v.isActive !== filters.active) continue;
      results.push(v);
    }
    return results;
  }

  async deactivateOffer(tenantId: string, offerId: string): Promise<void> {
    await this.updateOffer(tenantId, offerId, { isActive: false });
  }

  async createRedemption(tenantId: string, redemption: RedemptionRow): Promise<void> {
    this.redemptions.set(this.key(tenantId, redemption.redemptionId), redemption);
  }

  async getRedemption(tenantId: string, redemptionId: string): Promise<RedemptionRow | null> {
    return this.redemptions.get(this.key(tenantId, redemptionId)) ?? null;
  }

  async countMemberRedemptions(tenantId: string, memberId: string, offerId: string): Promise<number> {
    const prefix = `${tenantId}:`;
    let count = 0;
    for (const [k, v] of this.redemptions) {
      if (!k.startsWith(prefix)) continue;
      if (v.memberId === memberId && v.offerId === offerId && v.status === 'completed') count++;
    }
    return count;
  }

  async incrementOfferRedemptions(tenantId: string, offerId: string): Promise<void> {
    const k = this.key(tenantId, offerId);
    const offer = this.offers.get(k);
    if (offer) {
      this.offers.set(k, { ...offer, currentRedemptions: offer.currentRedemptions + 1 });
    }
  }

  async decrementOfferRedemptions(tenantId: string, offerId: string): Promise<void> {
    const k = this.key(tenantId, offerId);
    const offer = this.offers.get(k);
    if (offer && offer.currentRedemptions > 0) {
      this.offers.set(k, { ...offer, currentRedemptions: offer.currentRedemptions - 1 });
    }
  }

  async reverseRedemption(tenantId: string, redemptionId: string): Promise<void> {
    const k = this.key(tenantId, redemptionId);
    const existing = this.redemptions.get(k);
    if (existing) {
      this.redemptions.set(k, {
        ...existing,
        status: 'reversed',
        reversedAt: new Date().toISOString(),
      });
    }
  }

  async createCodes(tenantId: string, codes: OfferCodeRow[]): Promise<void> {
    for (const c of codes) {
      this.codes.set(this.key(tenantId, c.code), c);
    }
  }

  async listCodes(tenantId: string, offerId: string, status?: string): Promise<OfferCodeRow[]> {
    const prefix = `${tenantId}:`;
    const results: OfferCodeRow[] = [];
    for (const [k, v] of this.codes) {
      if (!k.startsWith(prefix)) continue;
      if (v.offerId !== offerId) continue;
      if (status && v.status !== status) continue;
      results.push(v);
    }
    return results;
  }

  async getCode(tenantId: string, code: string): Promise<OfferCodeRow | null> {
    return this.codes.get(this.key(tenantId, code)) ?? null;
  }

  async getMemberCodeForOffer(tenantId: string, memberId: string, offerId: string): Promise<OfferCodeRow | null> {
    const prefix = `${tenantId}:`;
    for (const [k, v] of this.codes) {
      if (!k.startsWith(prefix)) continue;
      if (v.offerId === offerId && v.memberId === memberId && v.status === 'assigned') {
        return v;
      }
    }
    return null;
  }

  async redeemCode(tenantId: string, code: string, memberId: string): Promise<void> {
    const k = this.key(tenantId, code);
    const existing = this.codes.get(k);
    if (existing) {
      this.codes.set(k, {
        ...existing,
        status: 'redeemed',
        memberId,
        redeemedAt: new Date().toISOString(),
      });
    }
  }

  async getQualifiedVisitCount(
    _tenantId: string,
    _memberId: string,
    _config: {
      windowDays?: number | null;
      minSpendCents?: number | null;
      minItems?: number | null;
      channels?: string[] | null;
      storeIds?: string[] | null;
    },
  ): Promise<number> {
    // In-memory stub: always returns 0
    return 0;
  }

  async unredeemCode(tenantId: string, code: string): Promise<void> {
    const k = this.key(tenantId, code);
    const existing = this.codes.get(k);
    if (existing) {
      this.codes.set(k, {
        ...existing,
        status: 'available',
        memberId: null,
        redeemedAt: null,
      });
    }
  }
}

export interface CapturedEvent {
  topic: string;
  eventType: string;
  tenantId: string;
  payload: unknown;
}

export class InMemoryPublisher implements EventPublisher {
  public events: CapturedEvent[] = [];
  async publish<T>(topic: string, eventType: string, payload: T, tenantId: string): Promise<void> {
    this.events.push({ topic, eventType, tenantId, payload });
  }
}

export class InMemoryLoyaltyEngineClient implements LoyaltyEngineClient {
  public members = new Map<string, MemberInfo>();
  public lastRedemption: { memberId: string; pointsToBurn: number } | null = null;

  setMember(m: MemberInfo): void {
    this.members.set(`${m.tenantId}:${m.memberId}`, m);
  }

  async redeemPoints(
    tenantId: string,
    body: { memberId: string; offerId: string; pointsToBurn: number },
  ): Promise<{ redemptionId: string; pointsUsed: number; newBalance: number }> {
    const k = `${tenantId}:${body.memberId}`;
    const member = this.members.get(k);
    if (!member) throw new Error('member not found in engine');
    if (member.pointsBalance < body.pointsToBurn) {
      throw new Error('insufficient points');
    }
    member.pointsBalance -= body.pointsToBurn;
    this.lastRedemption = { memberId: body.memberId, pointsToBurn: body.pointsToBurn };
    return {
      redemptionId: 'engine-rdm-' + Date.now(),
      pointsUsed: body.pointsToBurn,
      newBalance: member.pointsBalance,
    };
  }

  async reverseRedemption(
    tenantId: string,
    body: { memberId: string; pointsToRestore: number },
  ): Promise<{ newBalance: number }> {
    const k = `${tenantId}:${body.memberId}`;
    const member = this.members.get(k);
    if (!member) throw new Error('member not found');
    member.pointsBalance += body.pointsToRestore;
    return { newBalance: member.pointsBalance };
  }
}

export class InMemoryMemberClient implements MemberClient {
  public members = new Map<string, MemberInfo>();

  put(m: MemberInfo): void {
    this.members.set(`${m.tenantId}:${m.memberId}`, m);
  }

  async getMember(tenantId: string, memberId: string): Promise<MemberInfo | null> {
    return this.members.get(`${tenantId}:${memberId}`) ?? null;
  }
}
