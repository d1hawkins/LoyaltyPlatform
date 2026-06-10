/**
 * Tenant provisioning CLI.
 *
 *   pnpm tsx scripts/provision-tenant.ts --slug daiso-test --name "Daiso Test Tenant"
 *
 * See /scripts/PROVISIONING.md for full docs.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import * as sql from 'mssql';
import * as bcrypt from 'bcryptjs';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import { createLogger } from '@loyalty/shared-logger';
import { AppError } from '@loyalty/shared-errors';
import { runMigrationsDir } from './sql-runner';

interface Args {
  slug: string;
  name: string;
  dryRun: boolean;
  sqlServer: string;
  keyVault: string;
  location: string;
  dbTier: string;
}

const SLUG_RE = /^[a-z][a-z0-9-]{2,40}$/;

const infraOutputs = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'infra', 'infra-outputs.json'), 'utf8'),
);

function parseArgs(argv: string[]): Args {
  const a: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      a[key] = true;
    } else {
      a[key] = next;
      i++;
    }
  }
  const slug = String(a.slug || '');
  const name = String(a.name || '');
  if (!slug || !name) {
    console.error(
      'Usage: provision-tenant --slug <slug> --name "<name>" [--dry-run] [--sql-server <fqdn>] [--key-vault <name>] [--location <region>] [--db-tier <tier>]',
    );
    process.exit(1);
  }
  return {
    slug,
    name,
    dryRun: Boolean(a['dry-run']),
    sqlServer: String(a['sql-server'] || infraOutputs.sqlServerFqdn),
    keyVault: String(a['key-vault'] || infraOutputs.keyVaultName),
    location: String(a.location || 'westus2'),
    dbTier: String(a['db-tier'] || 'Basic'),
  };
}

function stepTimer(name: string, logger: ReturnType<typeof createLogger>) {
  const start = Date.now();
  logger.info({ step: name }, `▶ ${name}`);
  return () => logger.info({ step: name, ms: Date.now() - start }, `✔ ${name}`);
}

function randomPassword(): string {
  // 24-char strong password meeting Azure SQL complexity: upper, lower, digit, symbol
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digit = '23456789';
  const sym = '!@#$%^&*()-_=+';
  const all = upper + lower + digit + sym;
  const pick = (s: string) => s[crypto.randomInt(0, s.length)];
  const chars = [pick(upper), pick(lower), pick(digit), pick(sym)];
  for (let i = 0; i < 20; i++) chars.push(pick(all));
  // Fisher-Yates
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function az(args: string[], log: (m: string) => void): { stdout: string; stderr: string } {
  log(`  $ az ${args.join(' ')}`);
  const r = spawnSync('az', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new AppError(
      'AZ_CLI_FAILED',
      `az ${args[0]} ${args[1]} failed (exit ${r.status}): ${r.stderr || r.stdout}`,
      500,
    );
  }
  return { stdout: r.stdout || '', stderr: r.stderr || '' };
}

async function appendBlocker(msg: string) {
  const p = path.resolve(__dirname, '..', 'blockers', 'BLOCKERS.md');
  const stamp = new Date().toISOString();
  fs.appendFileSync(p, `\n- [${stamp}] [A-03] ${msg}\n`);
}

async function main() {
  const logger = createLogger('provision-tenant');
  const args = parseArgs(process.argv.slice(2));

  if (!SLUG_RE.test(args.slug)) {
    logger.error({ slug: args.slug }, 'invalid slug');
    throw new AppError('INVALID_SLUG', `slug must match ${SLUG_RE}`, 400);
  }

  const tenantId = crypto.randomUUID();
  const dbName = `tenant-${args.slug}`;
  const secretName = `tenant-${tenantId}-sql-connstr`;
  const sqlAdminLogin =
    process.env.SQL_ADMIN_LOGIN || 'sqladmin';
  const sqlAdminPassword = process.env.SQL_ADMIN_PASSWORD || '';

  logger.info(
    {
      tenantId,
      slug: args.slug,
      name: args.name,
      dbName,
      secretName,
      dryRun: args.dryRun,
      sqlServer: args.sqlServer,
      keyVault: args.keyVault,
      location: args.location,
      dbTier: args.dbTier,
    },
    'provision start',
  );

  const controlPlaneConnStr = process.env.CONTROL_PLANE_SQL_CONNSTR;
  if (!controlPlaneConnStr) {
    throw new AppError('MISSING_ENV', 'CONTROL_PLANE_SQL_CONNSTR env var required', 500);
  }

  if (args.dryRun) {
    logger.warn({}, 'DRY RUN — steps only');
  }

  const tenantDbPassword = randomPassword();
  // For dev we reuse server admin creds for app connections (single-user DB).
  // Production would CREATE LOGIN per tenant. For now, connection string uses server admin.

  // Connect control plane
  const cpStart = stepTimer('connect-control-plane', logger);
  const cpPool = args.dryRun
    ? null
    : await new sql.ConnectionPool(controlPlaneConnStr).connect();
  cpStart();

  let rollbackActions: Array<() => Promise<void>> = [];

  try {
    // Step 1: validate already done above
    // Step 2: generate ids done above
    logger.info({ tenantId, passwordPreview: '***' }, 'generated tenant_id and password');

    // Step 3: insert tenants row (status=provisioning)
    {
      const s = stepTimer('insert-tenant-row', logger);
      if (cpPool) {
        await cpPool
          .request()
          .input('tenant_id', sql.UniqueIdentifier, tenantId)
          .input('name', sql.NVarChar(200), args.name)
          .input('slug', sql.NVarChar(100), args.slug)
          .input('status', sql.NVarChar(20), 'provisioning')
          .input('db_name', sql.NVarChar(200), dbName)
          .input('db_server', sql.NVarChar(255), args.sqlServer)
          .query(
            `INSERT INTO dbo.tenants (tenant_id, name, slug, status, db_name, db_server)
             VALUES (@tenant_id, @name, @slug, @status, @db_name, @db_server);`,
          );
      }
      rollbackActions.push(async () => {
        if (!cpPool) return;
        await cpPool
          .request()
          .input('tenant_id', sql.UniqueIdentifier, tenantId)
          .query(
            `UPDATE dbo.tenants SET status='deleted', deleted_at=SYSUTCDATETIME(), updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenant_id;`,
          );
      });
      s();
    }

    // Step 4: az sql db create
    {
      const s = stepTimer('az-sql-db-create', logger);
      if (!args.dryRun) {
        az(
          [
            'sql',
            'db',
            'create',
            '-g',
            infraOutputs.resourceGroup,
            '-s',
            infraOutputs.sqlServerName,
            '-n',
            dbName,
            '--edition',
            args.dbTier,
          ],
          (m) => logger.info({}, m),
        );
      }
      rollbackActions.push(async () => {
        try {
          az(
            [
              'sql',
              'db',
              'delete',
              '-g',
              infraOutputs.resourceGroup,
              '-s',
              infraOutputs.sqlServerName,
              '-n',
              dbName,
              '--yes',
            ],
            (m) => logger.warn({}, m),
          );
        } catch (e) {
          logger.error({ err: (e as Error).message }, 'rollback db delete failed');
        }
      });
      s();
    }

    // Build tenant connection string — reuse server admin creds from env for the app conn
    if (!sqlAdminPassword) {
      throw new AppError(
        'MISSING_ENV',
        'SQL_ADMIN_PASSWORD env var required (fetched via `az keyvault secret show --vault-name loyalty-dev-kv-5rdrqh --name sql-admin-password`)',
        500,
      );
    }
    const tenantConnStr = `Server=tcp:${args.sqlServer},1433;Database=${dbName};User ID=${sqlAdminLogin};Password=${sqlAdminPassword};Encrypt=true;TrustServerCertificate=false;`;

    // Step 5: store secret in Key Vault
    {
      const s = stepTimer('keyvault-store-secret', logger);
      if (!args.dryRun) {
        const cred = new DefaultAzureCredential();
        const kvUri = `https://${args.keyVault}.vault.azure.net/`;
        const kv = new SecretClient(kvUri, cred);
        await kv.setSecret(secretName, tenantConnStr, {
          tags: { tenantId, slug: args.slug },
        });
      }
      s();
    }

    // Step 6: run V1..V7 against tenant DB
    let tenantPool: sql.ConnectionPool | null = null;
    {
      const s = stepTimer('connect-tenant-db', logger);
      if (!args.dryRun) {
        // Azure SQL may take a few seconds to be reachable
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            tenantPool = await new sql.ConnectionPool(tenantConnStr).connect();
            break;
          } catch (e) {
            lastErr = e;
            logger.warn({ attempt }, 'tenant db not ready, retrying in 5s');
            await new Promise((r) => setTimeout(r, 5000));
          }
        }
        if (!tenantPool) throw lastErr;
      }
      s();
    }

    {
      const s = stepTimer('run-tenant-migrations', logger);
      if (tenantPool) {
        const migDir = path.resolve(__dirname, '..', 'services', 'tenant-migrations');
        const results = await runMigrationsDir(tenantPool, migDir, (m) =>
          logger.info({}, m),
        );
        logger.info({ count: results.length }, 'migrations applied');
      }
      s();
    }

    // Step 7: default program_config seed (tiers already seeded in V4)
    {
      const s = stepTimer('seed-program-config', logger);
      if (tenantPool) {
        await tenantPool
          .request()
          .input('name', sql.NVarChar(200), args.name)
          .query(
            `IF NOT EXISTS (SELECT 1 FROM dbo.program_config WHERE id = 1)
             INSERT INTO dbo.program_config (id, program_name, base_earn_rate, point_value, points_expiry_days, config_json)
             VALUES (1, @name, 1.0000, 0.0100, 365, N'{}');`,
          );
      }
      s();
    }

    if (tenantPool) await tenantPool.close();

    // Step 8: update control-plane tenants row -> active
    {
      const s = stepTimer('activate-tenant', logger);
      if (cpPool) {
        await cpPool
          .request()
          .input('tenant_id', sql.UniqueIdentifier, tenantId)
          .input('secret', sql.NVarChar(200), secretName)
          .query(
            `UPDATE dbo.tenants
             SET sql_connstr_secret_name=@secret, status='active', updated_at=SYSUTCDATETIME()
             WHERE tenant_id=@tenant_id;`,
          );
      }
      s();
    }

    // Step 9: initial API key
    let plaintextKey = '';
    {
      const s = stepTimer('generate-api-key', logger);
      plaintextKey = 'lp_sk_' + crypto.randomBytes(32).toString('hex');
      const hash = await bcrypt.hash(plaintextKey, 10);
      if (cpPool) {
        await cpPool
          .request()
          .input('tenant_id', sql.UniqueIdentifier, tenantId)
          .input('key_hash', sql.NVarChar(200), hash)
          .input('label', sql.NVarChar(200), 'initial')
          .input('scope', sql.NVarChar(20), 'read-write')
          .query(
            `INSERT INTO dbo.tenant_api_keys (tenant_id, key_hash, label, scope)
             VALUES (@tenant_id, @key_hash, @label, @scope);`,
          );
      }
      s();
    }

    // Step 10: audit
    {
      const s = stepTimer('audit-log', logger);
      if (cpPool) {
        await cpPool
          .request()
          .input('actor', sql.NVarChar(200), process.env.USER || 'provision-cli')
          .input('action', sql.NVarChar(100), 'tenant.provisioned')
          .input('entity', sql.NVarChar(100), 'tenant')
          .input('entity_id', sql.NVarChar(200), tenantId)
          .input(
            'metadata_json',
            sql.NVarChar(sql.MAX),
            JSON.stringify({ slug: args.slug, dbName, secretName }),
          )
          .query(
            `INSERT INTO dbo.audit_control_plane (actor, action, entity, entity_id, metadata_json)
             VALUES (@actor, @action, @entity, @entity_id, @metadata_json);`,
          );
      }
      s();
    }

    logger.info(
      { tenantId, slug: args.slug, dbName, secretName },
      '✔ provisioning complete',
    );

    // Print initial API key ONCE
    console.log('\n============================================================');
    console.log('  TENANT PROVISIONED');
    console.log('  tenant_id:  ' + tenantId);
    console.log('  slug:       ' + args.slug);
    console.log('  db_name:    ' + dbName);
    console.log('  secret:     ' + secretName);
    console.log('  API KEY (shown ONCE, store it now):');
    console.log('    ' + plaintextKey);
    console.log('============================================================\n');
  } catch (err) {
    logger.error(
      { err: (err as Error).message, stack: (err as Error).stack },
      'provisioning failed — rolling back',
    );
    for (const r of rollbackActions.reverse()) {
      try {
        await r();
      } catch (e) {
        logger.error({ err: (e as Error).message }, 'rollback step failed');
      }
    }
    await appendBlocker(
      `tenant provisioning failed for slug=${args.slug} tenant_id=${tenantId}: ${(err as Error).message}`,
    );
    if (cpPool) await cpPool.close();
    process.exit(1);
  }

  if (cpPool) await cpPool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
