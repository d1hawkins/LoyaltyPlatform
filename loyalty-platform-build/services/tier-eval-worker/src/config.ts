import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().optional(),
  KEY_VAULT_URI: z.string().optional(),
  CONTROL_PLANE_SQL_CONNSTR: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  SUBSCRIPTION_NAME: z.string().default('tier-eval-worker'),
  TIER_DEMOTION_CRON: z.string().default('0 3 * * *'),
  TIER_DEMOTION_COOLDOWN_DAYS: z.coerce.number().int().positive().default(30),
  DEDUPE_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid config', parsed.error.flatten());
    throw new Error('Invalid tier-eval-worker configuration');
  }
  return parsed.data;
}
