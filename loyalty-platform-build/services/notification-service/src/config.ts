import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3002),
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

  // Notification-specific
  EMAIL_PROVIDER: z.enum(['noop', 'azure-comm']).default('noop'),
  PUSH_PROVIDER: z.enum(['noop', 'azure-notification-hub']).default('noop'),
  SMS_PROVIDER: z.enum(['noop', 'azure-comm-sms']).default('noop'),
  AZURE_COMM_CONNECTION_STRING: z.string().optional(),
  AZURE_NH_CONNECTION_STRING: z.string().optional(),
  AZURE_NH_HUB_NAME: z.string().optional(),
  SMS_FROM_NUMBER: z.string().optional(),
  NOTIFICATION_PII_KEY_HEX: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, '32-byte hex key required')
    .default('00'.repeat(32)),
  NOTIFICATION_RECIPIENT_PEPPER: z.string().default('dev-pepper-change-me'),
  FROM_EMAIL: z.string().default('no-reply@loyalty.local'),
  SUPPORT_EMAIL: z.string().default('support@loyalty.local'),
  MEMBER_SERVICE_URL: z.string().default('http://localhost:3001'),
  PROGRAM_NAME: z.string().default('Loyalty Program'),
  TENANT_NAME: z.string().default('Loyalty'),
  UNSUBSCRIBE_BASE_URL: z.string().default('https://loyalty.local/unsubscribe'),
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
