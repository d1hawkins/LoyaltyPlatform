export { FraudEngine } from './engine';
export type { FraudEngineDeps } from './engine';
export type {
  FraudCheckResult,
  FraudFlag,
  FraudRuleConfig,
  FraudFlagRow,
  FraudCacheClient,
  FraudRepository,
  TransactionInput,
  EnrollmentInput,
} from './types';
export {
  checkVelocityTxnCount,
  checkVelocityTxnAmount,
  checkRapidEnrollmentRedeem,
  checkDuplicateAmountPattern,
  checkBulkEnrollment,
  checkRapidBalanceDrain,
  checkLocationVelocity,
  checkDuplicateExternalRef,
  recordEarnTimestamp,
} from './rules';
export { InMemoryFraudCache, InMemoryFraudRepository } from './repository.memory';
