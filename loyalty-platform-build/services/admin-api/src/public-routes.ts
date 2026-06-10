import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ValidationError } from '@loyalty/shared-errors';

const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;

/**
 * Repository interface for the control-plane tenants table.
 * In dev/test mode, the in-memory implementation is used.
 */
export interface TenantRepository {
  checkSlug(slug: string): Promise<boolean>;
  create(tenant: {
    tenantId: string;
    slug: string;
    name: string;
    contactEmail: string;
    contactPhone: string;
    contactName: string;
    businessType: string;
    website?: string;
    status: string;
  }): Promise<void>;
  activate(tenantId: string): Promise<void>;
}

export interface ProvisioningService {
  provision(body: ProvisionRequest): Promise<ProvisionResponse>;
}

export interface ProvisionRequest {
  slug: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  contactName: string;
  businessType: string;
  website?: string;
  programName: string;
  baseEarnRate: number;
  enableTiers: boolean;
  tiers?: Array<{ name: string; threshold: number }>;
  expiryMonths?: number;
  channels: string[];
}

export interface ProvisionResponse {
  tenantId: string;
  slug: string;
  apiKey: string;
  adminUrl: string;
}

export interface PublicRoutesDeps {
  tenants: TenantRepository;
  provisioning: ProvisioningService;
}

// ── In-memory implementations for dev/test ──────────────────────────────

export class InMemoryTenantRepository implements TenantRepository {
  public rows: Array<{
    tenantId: string;
    slug: string;
    name: string;
    contactEmail: string;
    contactPhone: string;
    contactName: string;
    businessType: string;
    website?: string;
    status: string;
  }> = [];

  async checkSlug(slug: string): Promise<boolean> {
    return !this.rows.some((r) => r.slug === slug);
  }

  async create(tenant: {
    tenantId: string;
    slug: string;
    name: string;
    contactEmail: string;
    contactPhone: string;
    contactName: string;
    businessType: string;
    website?: string;
    status: string;
  }): Promise<void> {
    this.rows.push(tenant);
  }

  async activate(tenantId: string): Promise<void> {
    const row = this.rows.find((r) => r.tenantId === tenantId);
    if (row) row.status = 'active';
  }
}

export class DevProvisioningService implements ProvisioningService {
  constructor(private tenants: TenantRepository) {}

  async provision(body: ProvisionRequest): Promise<ProvisionResponse> {
    const available = await this.tenants.checkSlug(body.slug);
    if (!available) {
      throw new ValidationError(`slug "${body.slug}" is already taken`);
    }

    const tenantId = crypto.randomUUID();
    const apiKey = `lk_test_${crypto.randomUUID().replace(/-/g, '').substring(0, 32)}`;

    await this.tenants.create({
      tenantId,
      slug: body.slug,
      name: body.name,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      contactName: body.contactName,
      businessType: body.businessType,
      website: body.website,
      status: 'provisioning',
    });

    // In dev mode we skip real DB creation, migrations, etc.
    // In production this would:
    //   1. Create Azure SQL database
    //   2. Run tenant migrations V1-V14
    //   3. Insert program_config with custom earn rate / expiry
    //   4. Insert tiers if enabled
    //   5. Generate a bcrypt-hashed API key

    await this.tenants.activate(tenantId);

    return {
      tenantId,
      slug: body.slug,
      apiKey,
      adminUrl: process.env.ADMIN_PORTAL_URL || 'https://loyaltyadminportal.z20.web.core.windows.net',
    };
  }
}

// ── Zod schemas ─────────────────────────────────────────────────────────

const checkSlugSchema = z.object({
  slug: z.string().min(1),
});

const provisionSchema = z.object({
  slug: z.string().min(3).max(41).regex(SLUG_RE, 'slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1).max(200),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(1),
  contactName: z.string().min(1),
  businessType: z.string().min(1),
  website: z.string().url().optional(),
  programName: z.string().min(1),
  baseEarnRate: z.number().positive(),
  enableTiers: z.boolean(),
  tiers: z
    .array(
      z.object({
        name: z.string().min(1),
        threshold: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  expiryMonths: z.number().int().positive().optional(),
  channels: z.array(z.string()).min(1),
});

// ── Slug suggestion helper ──────────────────────────────────────────────

function suggestSlug(slug: string): string {
  return `${slug}-${Math.floor(Math.random() * 900 + 100)}`;
}

// ── Router builder ──────────────────────────────────────────────────────

export function buildPublicRouter(deps: PublicRoutesDeps): Router {
  const router = Router();

  // POST /v1/public/tenants/check-slug
  router.post(
    '/tenants/check-slug',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = checkSlugSchema.safeParse(req.body);
        if (!parsed.success) throw new ValidationError('invalid check-slug body');

        const { slug } = parsed.data;
        if (!SLUG_RE.test(slug)) {
          res.json({
            available: false,
            suggestion: slug
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, '-')
              .replace(/^-+|-+$/g, '')
              .replace(/-{2,}/g, '-')
              .slice(0, 41) || 'my-program',
          });
          return;
        }

        const available = await deps.tenants.checkSlug(slug);
        const result: { available: boolean; suggestion?: string } = { available };
        if (!available) {
          result.suggestion = suggestSlug(slug);
        }
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /v1/public/tenants/provision
  router.post(
    '/tenants/provision',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = provisionSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            `invalid provision body: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
          );
        }

        const result = await deps.provisioning.provision(parsed.data);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
