import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().optional(),
  KEY_VAULT_URI: z.string().optional(),
  CONTROL_PLANE_SQL_CONNSTR: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  SKIP_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  EXPIRY_CRON: z.string().default('0 2 * * *'),
  EXPIRY_WARNING_CRON: z.string().default('0 8 * * *'),
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
