import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const takenSlugs = new Set(['daiso-test']);

app.post('/api/tenants/check-slug', (req, res) => {
  const { slug } = req.body as { slug: string };
  const available = !takenSlugs.has(slug);
  res.json({
    available,
    suggestion: available ? undefined : `${slug}-${Math.floor(Math.random() * 900 + 100)}`,
  });
});

app.post('/api/tenants/provision', async (req, res) => {
  const body = req.body as { slug: string; name: string };

  if (takenSlugs.has(body.slug)) {
    res.status(409).json({ error: 'SLUG_TAKEN', message: `slug "${body.slug}" is already taken` });
    return;
  }

  // Simulate provisioning delay (5 seconds)
  await new Promise((r) => setTimeout(r, 5000));

  takenSlugs.add(body.slug);

  res.status(201).json({
    tenantId: crypto.randomUUID(),
    slug: body.slug,
    apiKey: `lk_test_${crypto.randomUUID().replace(/-/g, '').substring(0, 32)}`,
    adminUrl: process.env.ADMIN_PORTAL_URL || 'https://loyaltyadminportal.z20.web.core.windows.net',
  });
});

app.post('/api/onboard', async (req, res) => {
  // Legacy endpoint — maps onboarding wizard data to provisioning
  const body = req.body as {
    business: { companyName: string; contactEmail: string; contactPhone: string; contactName: string; businessType: string; websiteUrl: string };
    program: { programName: string; baseEarnRate: number; enableTiers: boolean; tiers: Array<{ name: string; threshold: number }>; enableExpiry: boolean; expiryMonths: number };
    channels: { channels: string[] };
  };

  const slug = body.business.companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 41);

  await new Promise((r) => setTimeout(r, 3000));

  res.status(201).json({
    tenantId: crypto.randomUUID(),
    apiKey: `lk_test_${crypto.randomUUID().replace(/-/g, '').substring(0, 32)}`,
    adminPortalUrl: 'http://localhost:5173',
    slug,
    programName: body.program.programName,
  });
});

const PORT = Number(process.env.PORT) || 3099;
app.listen(PORT, () => {
  console.log(`Mock provisioning server on :${PORT}`);
});
