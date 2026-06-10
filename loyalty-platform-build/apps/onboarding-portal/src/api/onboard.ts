import type { OnboardRequest, OnboardResponse } from './types';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Check if a slug is available.
 *
 * Calls the admin-api public provisioning endpoint:
 *   POST /v1/public/tenants/check-slug
 *
 * Falls back to the mock server in dev mode via Vite proxy.
 */
export async function checkSlugAvailability(
  slug: string,
): Promise<{ available: boolean; suggestion?: string }> {
  const base = API_URL || '/api';
  const url = API_URL
    ? `${API_URL}/v1/public/tenants/check-slug`
    : `${base}/tenants/check-slug`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });

  if (!response.ok) {
    throw new Error('Failed to check slug availability');
  }

  return response.json() as Promise<{ available: boolean; suggestion?: string }>;
}

/**
 * Submit onboarding data to provision a new tenant.
 *
 * When VITE_API_URL is set, calls the admin-api provisioning endpoint:
 *   POST /v1/public/tenants/provision
 *
 * Otherwise, falls back to the legacy mock endpoint:
 *   POST /api/onboard (proxied via Vite to localhost:3099)
 *
 * Real integration path:
 *   1. Creates tenant record in control plane DB
 *   2. Creates tenant Azure SQL DB + runs V1-V14 migrations
 *   3. Seeds program_config with custom settings
 *   4. Generates API key (bcrypt stored, plaintext returned once)
 *   5. Returns { tenantId, apiKey, adminPortalUrl, slug, programName }
 */
export async function submitOnboarding(data: OnboardRequest): Promise<OnboardResponse> {
  if (API_URL) {
    // Use the new public provisioning endpoint on admin-api
    return submitViaProvisionEndpoint(data);
  }

  // Legacy: call the mock server / onboard endpoint
  return submitViaLegacyEndpoint(data);
}

async function submitViaProvisionEndpoint(data: OnboardRequest): Promise<OnboardResponse> {
  const slug = data.business.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 41);

  const body = {
    slug,
    name: data.business.companyName,
    contactEmail: data.business.contactEmail,
    contactPhone: data.business.contactPhone,
    contactName: data.business.contactName,
    businessType: data.business.businessType,
    website: data.business.websiteUrl || undefined,
    programName: data.program.programName,
    baseEarnRate: data.program.baseEarnRate,
    enableTiers: data.program.enableTiers,
    tiers: data.program.enableTiers ? data.program.tiers : undefined,
    expiryMonths: data.program.enableExpiry ? data.program.expiryMonths : undefined,
    channels: data.channels.channels,
  };

  const response = await fetch(`${API_URL}/v1/public/tenants/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message =
      (errBody as Record<string, unknown>).detail ??
      (errBody as Record<string, unknown>).message ??
      'Provisioning failed';
    throw new Error(String(message));
  }

  const result = (await response.json()) as {
    tenantId: string;
    slug: string;
    apiKey: string;
    adminUrl: string;
  };

  return {
    tenantId: result.tenantId,
    apiKey: result.apiKey,
    adminPortalUrl: result.adminUrl,
    slug: result.slug,
    programName: data.program.programName,
  };
}

async function submitViaLegacyEndpoint(data: OnboardRequest): Promise<OnboardResponse> {
  const response = await fetch('/api/onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as Record<string, unknown>).detail ??
      (body as Record<string, unknown>).message ??
      'Onboarding failed';
    throw new Error(String(message));
  }

  return response.json() as Promise<OnboardResponse>;
}
