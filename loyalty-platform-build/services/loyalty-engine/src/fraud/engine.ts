/**
 * FraudEngine — orchestrates fraud rule checks against transactions and
 * enrollments. All checks use Redis for O(1) velocity tracking; no SQL
 * in the hot path. Performance target: < 20ms overhead.
 */

import type { Logger } from '@loyalty/shared-logger';
import type {
  FraudCacheClient,
  FraudCheckResult,
  FraudFlag,
  FraudRepository,
  FraudRuleConfig,
  TransactionInput,
  EnrollmentInput,
} from './types';
import {
  checkVelocityTxnCount,
  checkVelocityTxnAmount,
  checkRapidEnrollmentRedeem,
  checkDuplicateAmountPattern,
  checkBulkEnrollment,
  checkRapidBalanceDrain,
  checkLocationVelocity,
  checkDuplicateExternalRef,
} from './rules';

export interface FraudEngineDeps {
  repo: FraudRepository;
  cache: FraudCacheClient;
  logger: Logger;
}

/** Severity hierarchy for action resolution. Highest severity wins. */
const SEVERITY_ORDER: Record<string, number> = {
  warning: 1,
  block: 2,
  quarantine: 3,
};

function resolveAction(flags: FraudFlag[]): 'allow' | 'warn' | 'block' | 'quarantine' {
  if (flags.length === 0) return 'allow';
  let maxSeverity = 0;
  let action: 'allow' | 'warn' | 'block' | 'quarantine' = 'warn';
  for (const flag of flags) {
    const sev = SEVERITY_ORDER[flag.severity] ?? 0;
    if (sev > maxSeverity) {
      maxSeverity = sev;
      if (flag.severity === 'block') action = 'block';
      else if (flag.severity === 'quarantine') action = 'quarantine';
      else action = 'warn';
    }
  }
  return action;
}

/** Default rule configs if DB rules are unavailable. */
const DEFAULT_RULES: FraudRuleConfig[] = [
  { ruleCode: 'VELOCITY_TXN_COUNT', description: '', severity: 'warning', isEnabled: true, config: { maxCount: 10, windowMinutes: 60 } },
  { ruleCode: 'VELOCITY_TXN_AMOUNT', description: '', severity: 'warning', isEnabled: true, config: { maxAmount: 1000, windowMinutes: 60 } },
  { ruleCode: 'RAPID_ENROLLMENT_REDEEM', description: '', severity: 'block', isEnabled: true, config: { minHoursAfterEnroll: 24 } },
  { ruleCode: 'DUPLICATE_AMOUNT_PATTERN', description: '', severity: 'warning', isEnabled: true, config: { maxRepeats: 3, windowMinutes: 30 } },
  { ruleCode: 'BULK_ENROLLMENT', description: '', severity: 'quarantine', isEnabled: true, config: { maxEnrollments: 20, windowMinutes: 60 } },
  { ruleCode: 'RAPID_BALANCE_DRAIN', description: 'Large redemption shortly after earning', severity: 'warning', isEnabled: true, config: { maxDrainPercent: 80, windowMinutes: 60 } },
  { ruleCode: 'LOCATION_VELOCITY', description: 'Transactions from different locations in short window', severity: 'warning', isEnabled: true, config: { windowMinutes: 30 } },
  { ruleCode: 'DUPLICATE_EXTERNAL_REF', description: 'Reuse of external reference ID', severity: 'warning', isEnabled: true, config: { windowHours: 24 } },
];

export class FraudEngine {
  private readonly repo: FraudRepository;
  private readonly cache: FraudCacheClient;
  private readonly logger: Logger;

  constructor(deps: FraudEngineDeps) {
    this.repo = deps.repo;
    this.cache = deps.cache;
    this.logger = deps.logger;
  }

  private async loadRules(tenantId: string): Promise<FraudRuleConfig[]> {
    try {
      const rules = await this.repo.getRules(tenantId);
      return rules.length > 0 ? rules : DEFAULT_RULES;
    } catch (err) {
      this.logger.warn({ err, tenantId }, 'fraud.rules.load_failed, using defaults');
      return DEFAULT_RULES;
    }
  }

  private ruleConfig(rules: FraudRuleConfig[], code: string): FraudRuleConfig | undefined {
    return rules.find((r) => r.ruleCode === code && r.isEnabled);
  }

  /**
   * Check a transaction against all applicable fraud rules.
   * Returns within < 20ms using Redis-only lookups.
   */
  async checkTransaction(
    tenantId: string,
    memberId: string,
    txn: TransactionInput,
    opts?: { isRedemption?: boolean; enrolledAt?: string; now?: number; currentBalance?: number; redeemAmount?: number },
  ): Promise<FraudCheckResult> {
    const start = Date.now();
    const rules = await this.loadRules(tenantId);
    const flags: FraudFlag[] = [];

    const ctx = { tenantId, memberId, cache: this.cache, now: opts?.now };

    // Run applicable rules in parallel for minimum latency
    const checks: Array<{ ruleConfig: FraudRuleConfig; promise: Promise<FraudFlag | null> }> = [];

    const velocityCount = this.ruleConfig(rules, 'VELOCITY_TXN_COUNT');
    if (velocityCount) {
      checks.push({ ruleConfig: velocityCount, promise: checkVelocityTxnCount(ctx, txn, velocityCount.config as { maxCount: number; windowMinutes: number }) });
    }

    const velocityAmount = this.ruleConfig(rules, 'VELOCITY_TXN_AMOUNT');
    if (velocityAmount) {
      checks.push({ ruleConfig: velocityAmount, promise: checkVelocityTxnAmount(ctx, txn, velocityAmount.config as { maxAmount: number; windowMinutes: number }) });
    }

    const rapidRedeem = this.ruleConfig(rules, 'RAPID_ENROLLMENT_REDEEM');
    if (rapidRedeem) {
      checks.push({ ruleConfig: rapidRedeem, promise: checkRapidEnrollmentRedeem(
        ctx, txn,
        rapidRedeem.config as { minHoursAfterEnroll: number },
        { isRedemption: opts?.isRedemption ?? false, enrolledAt: opts?.enrolledAt },
      ) });
    }

    const dupAmount = this.ruleConfig(rules, 'DUPLICATE_AMOUNT_PATTERN');
    if (dupAmount) {
      checks.push({ ruleConfig: dupAmount, promise: checkDuplicateAmountPattern(ctx, txn, dupAmount.config as { maxRepeats: number; windowMinutes: number }) });
    }

    const rapidDrain = this.ruleConfig(rules, 'RAPID_BALANCE_DRAIN');
    if (rapidDrain) {
      checks.push({ ruleConfig: rapidDrain, promise: checkRapidBalanceDrain(
        ctx, txn,
        rapidDrain.config as { maxDrainPercent: number; windowMinutes: number },
        {
          isRedemption: opts?.isRedemption ?? false,
          currentBalance: opts?.currentBalance ?? 0,
          redeemAmount: opts?.redeemAmount ?? 0,
        },
      ) });
    }

    const locationVelocity = this.ruleConfig(rules, 'LOCATION_VELOCITY');
    if (locationVelocity) {
      checks.push({ ruleConfig: locationVelocity, promise: checkLocationVelocity(ctx, txn, locationVelocity.config as { windowMinutes: number }) });
    }

    const dupExtRef = this.ruleConfig(rules, 'DUPLICATE_EXTERNAL_REF');
    if (dupExtRef) {
      checks.push({ ruleConfig: dupExtRef, promise: checkDuplicateExternalRef(ctx, txn, dupExtRef.config as { windowHours: number }) });
    }

    const results = await Promise.all(checks.map((c) => c.promise));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result) {
        // Override severity from rule config (DB-configurable) rather than hardcoded rule default
        result.severity = checks[i]!.ruleConfig.severity;
        flags.push(result);
      }
    }

    const action = resolveAction(flags);
    const elapsed = Date.now() - start;

    this.logger.info(
      { tenantId, memberId, action, flagCount: flags.length, elapsed },
      'fraud.check.transaction',
    );

    return { passed: action === 'allow', flags, action };
  }

  /**
   * Check an enrollment for bulk enrollment fraud.
   */
  async checkEnrollment(
    tenantId: string,
    sourceIp: string,
    email: string,
  ): Promise<FraudCheckResult> {
    const start = Date.now();
    const rules = await this.loadRules(tenantId);
    const flags: FraudFlag[] = [];

    const emailDomain = email.includes('@') ? email.split('@')[1]! : email;
    const bulkRule = this.ruleConfig(rules, 'BULK_ENROLLMENT');
    if (bulkRule) {
      const ctx = { tenantId, memberId: '', cache: this.cache };
      const result = await checkBulkEnrollment(
        ctx,
        { sourceIp, email, emailDomain },
        bulkRule.config as { maxEnrollments: number; windowMinutes: number },
      );
      if (result) {
        result.severity = bulkRule.severity;
        flags.push(result);
      }
    }

    const action = resolveAction(flags);
    const elapsed = Date.now() - start;

    this.logger.info(
      { tenantId, sourceIp, emailDomain, action, flagCount: flags.length, elapsed },
      'fraud.check.enrollment',
    );

    return { passed: action === 'allow', flags, action };
  }

  /**
   * Persist fraud flags to the database. Called after the fraud check
   * to record findings for admin review.
   */
  async persistFlags(
    tenantId: string,
    memberId: string,
    txnId: string | null,
    flags: FraudFlag[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const flag of flags) {
      try {
        const id = await this.repo.insertFlag(tenantId, {
          memberId,
          txnId,
          ruleCode: flag.ruleCode,
          severity: flag.severity,
          detailsJson: JSON.stringify(flag.details),
        });
        ids.push(id);
      } catch (err) {
        this.logger.error({ err, ruleCode: flag.ruleCode, tenantId, memberId }, 'fraud.flag.persist_failed');
      }
    }
    return ids;
  }
}
