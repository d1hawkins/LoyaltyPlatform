import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3005),
  LOG_LEVEL: z.string().optional(),
  KEY_VAULT_URI: z.string().optional(),
  TENANT_SQL_CONNSTR: z.string().optional(),
  CONTROL_PLANE_SQL_CONNSTR: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  MEMBER_SERVICE_URL: z.string().default('http://member-service:3001'),
  LOYALTY_ENGINE_URL: z.string().default('http://loyalty-engine:3002'),
  WEBHOOK_WORKER_URL: z.string().default('http://webhook-worker:3004'),
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
