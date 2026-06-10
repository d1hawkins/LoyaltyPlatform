/** Business types supported by the platform */
export type BusinessType = 'retail' | 'restaurant' | 'hospitality' | 'services' | 'other';

/** Estimated location count ranges */
export type LocationRange = '1' | '2-5' | '6-20' | '20+';

/** E-commerce platforms */
export type EcommercePlatform = 'shopify' | 'woocommerce' | 'custom' | 'other';

/** Points expiry duration in months */
export type ExpiryMonths = 6 | 12 | 18 | 24;

/** Channel types */
export type Channel = 'pos' | 'ecommerce' | 'mobile';

/** Tier definition for program setup */
export interface TierConfig {
  name: string;
  threshold: number;
}

/** Step 1 — Business Information */
export interface BusinessInfo {
  companyName: string;
  businessType: BusinessType;
  websiteUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  country: string;
  estimatedLocations: LocationRange;
}

/** Step 2 — Loyalty Program Setup */
export interface ProgramSetup {
  programName: string;
  baseEarnRate: number;
  enableTiers: boolean;
  tiers: TierConfig[];
  enableExpiry: boolean;
  expiryMonths: ExpiryMonths;
}

/** Step 3 — Channel Configuration */
export interface ChannelConfig {
  channels: Channel[];
  posTerminals: number;
  ecommercePlatform: EcommercePlatform;
}

/** Combined onboarding form data */
export interface OnboardingData {
  business: BusinessInfo;
  program: ProgramSetup;
  channels: ChannelConfig;
  acceptedTerms: boolean;
}

/** POST /api/onboard request body */
export interface OnboardRequest {
  business: BusinessInfo;
  program: ProgramSetup;
  channels: ChannelConfig;
}

/** POST /api/onboard response */
export interface OnboardResponse {
  tenantId: string;
  apiKey: string;
  adminPortalUrl: string;
  slug: string;
  programName: string;
}

/** Provisioning progress step */
export interface ProvisioningStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}
