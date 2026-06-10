import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.string().optional(),
  KEY_VAULT_URI: z.string().optional(),
  CONTROL_PLANE_SQL_CONNSTR: z.string().optional(),
  TENANT_SQL_CONNSTR: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  // 32-byte AES-256 key hex encoded (64 chars). Required in production.
  // In dev/test we fall back to a deterministic key.
  MEMBER_PII_KEY_HEX: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  // Per-tenant HMAC pepper base. Combined with tenantId to derive per-tenant pepper.
  MEMBER_HASH_PEPPER: z.string().default('loyalty-dev-pepper-change-me'),
  SKIP_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid config', parsed.error.flatten());
    throw new Error('Invalid configuration');
  }
  return parsed.data;
}
