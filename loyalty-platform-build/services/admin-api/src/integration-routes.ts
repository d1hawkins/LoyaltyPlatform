/**
 * Integration settings endpoints for the admin API.
 *
 * Manages third-party marketing tool integrations (ActiveCampaign, etc.)
 * stored in program_config.config_json.integrations.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '@loyalty/shared-errors';
import { requireRole } from './rbac';
import type { ProgramConfigRepository, MemberClient } from './repositories';
import { ActiveCampaignSync, KlaviyoSync, handleLoyaltyEvent } from './contact-sync';
import type { IntegrationConfig, MemberData, LoyaltyEvent } from './contact-sync';

// ── Supported providers ──

const SUPPORTED_PROVIDERS = ['activecampaign', 'klaviyo', 'braze', 'sendgrid'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function isValidProvider(p: string): p is Provider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p);
}

function getProvider(req: Request): string {
  return req.params.provider ?? '';
}

// ── Schemas ──

const integrationUpdateSchema = z.object({
  apiUrl: z.string().url().optional().default(''),
  apiKey: z.string().min(1),
  listId: z.string().optional().default(''),
  automationMappings: z.record(z.string().nullable()).optional().default({}),
  syncSchedule: z.enum(['realtime', 'hourly', 'daily', 'manual']).optional().default('hourly'),
});

const eventTriggerSchema = z.object({
  eventType: z.string().min(1),
  memberData: z.object({
    memberId: z.string().min(1),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string().optional(),
    tierName: z.string(),
    pointsBalance: z.number(),
    enrolledAt: z.string(),
    status: z.string(),
  }),
});

// ── Helpers ──

interface IntegrationsMap {
  [provider: string]: IntegrationConfig;
}

async function getIntegrationsMap(
  programConfig: ProgramConfigRepository,
  tenantId: string,
): Promise<IntegrationsMap> {
  const cfg = await programConfig.get(tenantId);
  if (!cfg) return {};
  const configJson = cfg.configJson as { integrations?: IntegrationsMap };
  return configJson.integrations ?? {};
}

async function saveIntegrationsMap(
  programConfig: ProgramConfigRepository,
  tenantId: string,
  integrations: IntegrationsMap,
): Promise<void> {
  const cfg = await programConfig.get(tenantId);
  const existing = cfg?.configJson ?? {};
  await programConfig.update(tenantId, { ...existing, integrations });
}

// ── Router ──

export interface IntegrationRoutesDeps {
  programConfig: ProgramConfigRepository;
  members: MemberClient;
}

export function buildIntegrationRouter(deps: IntegrationRoutesDeps): Router {
  const router = Router();

  // GET /integrations — list all configured integrations
  router.get(
    '/',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const items = SUPPORTED_PROVIDERS.map((provider) => ({
          provider,
          enabled: integrations[provider]?.enabled ?? false,
          connected: !!integrations[provider]?.apiKey,
          lastSyncAt: integrations[provider]?.lastSyncAt ?? null,
          lastSyncStatus: integrations[provider]?.lastSyncStatus ?? null,
          contactsSynced: integrations[provider]?.contactsSynced ?? 0,
          comingSoon: provider !== 'activecampaign' && provider !== 'klaviyo',
        }));
        res.json({ items });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /integrations/:provider — get config for a specific provider
  router.get(
    '/:provider',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }
        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const config = integrations[provider];
        if (!config) {
          return res.json({
            provider,
            enabled: false,
            connected: false,
          });
        }
        // Mask API key in response
        res.json({
          provider,
          enabled: config.enabled,
          connected: true,
          apiUrl: config.apiUrl,
          apiKeyMasked: config.apiKey ? `${'*'.repeat(12)}${config.apiKey.slice(-4)}` : null,
          listId: config.listId,
          automationMappings: config.automationMappings ?? {},
          syncSchedule: config.syncSchedule ?? 'hourly',
          lastSyncAt: config.lastSyncAt ?? null,
          lastSyncStatus: config.lastSyncStatus ?? null,
          contactsSynced: config.contactsSynced ?? 0,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /integrations/:provider — save/update integration config
  router.put(
    '/:provider',
    requireRole('owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }
        const parsed = integrationUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
          return next(new ValidationError(`invalid integration config: ${parsed.error.message}`));
        }

        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const existing = integrations[provider] ?? ({} as IntegrationConfig);

        const updated: IntegrationConfig = {
          ...existing,
          enabled: true,
          apiUrl: parsed.data.apiUrl,
          apiKey: parsed.data.apiKey,
          listId: parsed.data.listId,
          automationMappings: parsed.data.automationMappings as Record<string, string | null>,
          syncSchedule: parsed.data.syncSchedule,
        };

        integrations[provider] = updated;
        await saveIntegrationsMap(deps.programConfig, req.user!.tenantId, integrations);

        res.json({
          provider,
          enabled: updated.enabled,
          connected: true,
          message: 'Integration configuration saved.',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /integrations/:provider — disconnect integration
  router.delete(
    '/:provider',
    requireRole('owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }
        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        if (!integrations[provider]) {
          return next(new NotFoundError(`integration not configured: ${provider}`));
        }
        delete integrations[provider];
        await saveIntegrationsMap(deps.programConfig, req.user!.tenantId, integrations);
        res.json({ provider, disconnected: true });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /integrations/:provider/test — validate API credentials
  router.post(
    '/:provider/test',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }

        // Allow testing with provided creds or saved creds
        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const saved = integrations[provider];

        const apiUrl = (req.body?.apiUrl as string) ?? saved?.apiUrl;
        const apiKey = (req.body?.apiKey as string) ?? saved?.apiKey;

        if (provider === 'activecampaign') {
          if (!apiUrl || !apiKey) {
            return res.json({ success: false, error: 'API URL and API key are required.' });
          }
          const sync = new ActiveCampaignSync(apiUrl, apiKey, saved?.listId ?? '');
          const result = await sync.testConnection();
          return res.json(result);
        }

        if (provider === 'klaviyo') {
          if (!apiKey) {
            return res.json({ success: false, error: 'Private API key is required.' });
          }
          const sync = new KlaviyoSync(apiKey);
          const result = await sync.testConnection();
          return res.json(result);
        }

        // Other providers not yet implemented
        return res.json({ success: false, error: `${provider} integration is coming soon.` });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /integrations/:provider/sync — trigger a manual full sync
  router.post(
    '/:provider/sync',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }
        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const config = integrations[provider];
        if (!config?.enabled || !config.apiKey) {
          return next(new ValidationError(`integration not configured or not enabled: ${provider}`));
        }

        // Fetch all members for the tenant (shared across providers)
        const membersResult = await deps.members.search(req.user!.tenantId, { limit: 500 });
        const memberDataList: MemberData[] = membersResult.items.map((m) => ({
          memberId: m.id,
          email: m.emailHash ?? `${m.id}@unknown.com`, // emailHash is used as stand-in
          firstName: m.firstName,
          lastName: m.lastName,
          phone: m.phoneHash,
          tierName: m.tierId,
          pointsBalance: m.pointsBalance,
          enrolledAt: m.enrolledAt,
          status: m.status,
        }));

        let result: { synced: number; errors: number; errorDetails?: string[] };

        if (provider === 'activecampaign') {
          const sync = new ActiveCampaignSync(config.apiUrl, config.apiKey, config.listId);
          result = await sync.fullSync(memberDataList);
        } else if (provider === 'klaviyo') {
          const sync = new KlaviyoSync(config.apiKey);
          result = await sync.fullSync(memberDataList);
        } else {
          return res.json({ success: false, error: `${provider} sync is coming soon.` });
        }

        // Update sync metadata
        config.lastSyncAt = new Date().toISOString();
        config.lastSyncStatus = result.errors === 0 ? 'success' : 'partial';
        config.contactsSynced = result.synced;
        integrations[provider] = config;
        await saveIntegrationsMap(deps.programConfig, req.user!.tenantId, integrations);

        return res.json({
          provider,
          ...result,
          lastSyncAt: config.lastSyncAt,
          lastSyncStatus: config.lastSyncStatus,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /integrations/:provider/status — last sync status
  router.get(
    '/:provider/status',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }
        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const config = integrations[provider];

        res.json({
          provider,
          enabled: config?.enabled ?? false,
          connected: !!config?.apiKey,
          lastSyncAt: config?.lastSyncAt ?? null,
          lastSyncStatus: config?.lastSyncStatus ?? null,
          contactsSynced: config?.contactsSynced ?? 0,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /integrations/:provider/trigger — manually trigger a loyalty event
  // (for testing the webhook-to-automation bridge)
  router.post(
    '/:provider/trigger',
    requireRole('manager', 'owner'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const provider = getProvider(req);
        if (!isValidProvider(provider)) {
          return next(new ValidationError(`unsupported provider: ${provider}`));
        }
        const parsed = eventTriggerSchema.safeParse(req.body);
        if (!parsed.success) {
          return next(new ValidationError(`invalid event data: ${parsed.error.message}`));
        }

        const integrations = await getIntegrationsMap(deps.programConfig, req.user!.tenantId);
        const config = integrations[provider];

        const event: LoyaltyEvent = {
          eventType: parsed.data.eventType,
          memberData: parsed.data.memberData,
          tenantId: req.user!.tenantId,
          occurredAt: new Date().toISOString(),
        };

        const result = await handleLoyaltyEvent(event, config, provider);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
