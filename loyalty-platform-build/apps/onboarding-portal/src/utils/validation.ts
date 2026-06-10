import { z } from 'zod';

export const businessInfoSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  businessType: z.enum(['retail', 'restaurant', 'hospitality', 'services', 'other'], {
    required_error: 'Please select a business type',
  }),
  websiteUrl: z.string().url('Please enter a valid URL').or(z.literal('')),
  contactName: z.string().min(1, 'Contact name is required').max(200),
  contactEmail: z.string().email('Please enter a valid email address'),
  contactPhone: z.string().min(1, 'Phone number is required').max(30),
  country: z.string().min(1, 'Please select a country'),
  estimatedLocations: z.enum(['1', '2-5', '6-20', '20+'], {
    required_error: 'Please select an estimate',
  }),
});

export const programSetupSchema = z.object({
  programName: z.string().min(1, 'Program name is required').max(200),
  baseEarnRate: z.number().min(1).max(10),
  enableTiers: z.boolean(),
  tiers: z.array(
    z.object({
      name: z.string().min(1, 'Tier name is required'),
      threshold: z.number().min(0, 'Threshold must be non-negative'),
    })
  ),
  enableExpiry: z.boolean(),
  expiryMonths: z.union([z.literal(6), z.literal(12), z.literal(18), z.literal(24)]),
});

export const channelConfigSchema = z.object({
  channels: z.array(z.enum(['pos', 'ecommerce', 'mobile'])).min(1, 'Select at least one channel'),
  posTerminals: z.number().min(1).max(100),
  ecommercePlatform: z.enum(['shopify', 'woocommerce', 'custom', 'other']),
});

export type BusinessInfoErrors = Partial<Record<keyof z.infer<typeof businessInfoSchema>, string>>;
export type ProgramSetupErrors = Partial<Record<keyof z.infer<typeof programSetupSchema>, string>>;
export type ChannelConfigErrors = Partial<Record<keyof z.infer<typeof channelConfigSchema>, string>>;

/** Validate a step and return field-level errors (empty object = valid) */
export function validateStep<T>(schema: z.ZodSchema<T>, data: unknown): Record<string, string> {
  const result = schema.safeParse(data);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = issue.message;
    }
  }
  return errors;
}
