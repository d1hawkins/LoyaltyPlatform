import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3009),
  LOG_LEVEL: z.string().optional(),
  KEY_VAULT_URI: z.string().optional(),
  CONTROL_PLANE_SQL_CONNSTR: z.string().optional(),
  SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  DELIVERY_POLL_MS: z.coerce.number().default(2000),
  DELIVERY_BATCH_SIZE: z.coerce.number().default(50),
  HTTP_TIMEOUT_MS: z.coerce.number().default(10_000),
  WEBHOOK_SECRET_KEY: z.string().optional(),
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
