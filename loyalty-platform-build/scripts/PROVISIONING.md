# Tenant Provisioning (A-03)

CLI for provisioning a new loyalty tenant: creates the tenant Azure SQL DB, runs
the V1–V7 tenant migrations, stores the connection string in Key Vault, writes
the tenant registry row in the control plane, and issues an initial API key.

## Files

- `/infra/control-plane/migrations/V1__control_plane_init.sql` — `tenants`, `tenant_api_keys`, `feature_flags`, `audit_control_plane`
- `/services/tenant-migrations/V1__members.sql` — `members` + PII hash indexes
- `/services/tenant-migrations/V2__transactions.sql` — `transactions` (posted/voided) + idempotency index
- `/services/tenant-migrations/V3__points_ledger.sql` — append-only `points_ledger` + INSTEAD OF UPDATE/DELETE trigger
- `/services/tenant-migrations/V4__tiers.sql` — `tiers` with Bronze/Silver/Gold/Platinum seed
- `/services/tenant-migrations/V5__webhooks.sql` — `webhook_configs`
- `/services/tenant-migrations/V6__program_config.sql` — singleton `program_config`
- `/services/tenant-migrations/V7__indexes_and_views.sql` — cross-table indexes, `v_member_balance`, `v_member_with_tier`
- `/scripts/provision-tenant.ts` — CLI
- `/scripts/bootstrap-control-plane.ts` — applies control plane migrations
- `/scripts/sql-runner.ts` — GO-aware batch runner used by both

## Environment variables

| Var | Purpose |
| --- | --- |
| `CONTROL_PLANE_SQL_CONNSTR` | mssql connection string to the `control-plane` DB on `loyalty-dev-sql-5rdrqhw.database.windows.net` |
| `SQL_ADMIN_LOGIN` | server admin login (used for tenant DB connection string) |
| `SQL_ADMIN_PASSWORD` | server admin password |

Fetch credentials from Key Vault:

```bash
export SQL_ADMIN_LOGIN=$(az keyvault secret show --vault-name loyalty-dev-kv-5rdrqh --name sql-admin-login --query value -o tsv)
export SQL_ADMIN_PASSWORD=$(az keyvault secret show --vault-name loyalty-dev-kv-5rdrqh --name sql-admin-password --query value -o tsv)
export CONTROL_PLANE_SQL_CONNSTR="Server=tcp:loyalty-dev-sql-5rdrqhw.database.windows.net,1433;Database=control-plane;User ID=${SQL_ADMIN_LOGIN};Password=${SQL_ADMIN_PASSWORD};Encrypt=true;TrustServerCertificate=false;"
```

Your client IP must be allowed on the SQL server firewall:

```bash
CLIENT_IP=$(curl -s https://api.ipify.org)
az sql server firewall-rule create -g loyalty-platform-dev -s loyalty-dev-sql-5rdrqhw \
  -n "claude-a03-$(date +%s)" --start-ip-address $CLIENT_IP --end-ip-address $CLIENT_IP
```

Azure auth for Key Vault uses `DefaultAzureCredential` (relies on `az login`).

## Bootstrap the control plane (once per environment)

```bash
pnpm --filter @loyalty/scripts exec tsx bootstrap-control-plane.ts
```

## Provision a tenant

```bash
pnpm --filter @loyalty/scripts exec tsx provision-tenant.ts \
  --slug daiso-test \
  --name "Daiso Test Tenant"
```

### Flags

| Flag | Required | Default | Description |
| --- | --- | --- | --- |
| `--slug` | yes | — | `/^[a-z][a-z0-9-]{2,40}$/` |
| `--name` | yes | — | Display name |
| `--dry-run` | no | false | Log steps, skip side effects |
| `--sql-server` | no | `sqlServerFqdn` from `/infra/infra-outputs.json` | Azure SQL FQDN |
| `--key-vault` | no | `keyVaultName` from `/infra/infra-outputs.json` | Key Vault name |
| `--location` | no | `westus2` | Azure region |
| `--db-tier` | no | `Basic` | Azure SQL DB edition |

### Steps (each logged with timing)

1. Validate slug against regex
2. Generate UUIDv4 tenant_id and strong random password
3. Insert `tenants` row with `status='provisioning'`
4. `az sql db create -g loyalty-platform-dev -s loyalty-dev-sql-5rdrqhw -n tenant-{slug} --edition Basic`
5. Store tenant connection string in Key Vault as `tenant-{tenant_id}-sql-connstr`
6. Run all 7 tenant migrations against the new DB
7. Seed `program_config` singleton row (tiers seeded inside V4)
8. Update control plane row → `status='active'`, `sql_connstr_secret_name`, `db_name`, `db_server`
9. Generate `lp_sk_` + 64-hex API key, bcrypt hash, insert into `tenant_api_keys`, print plaintext ONCE
10. Insert `audit_control_plane` entry

### Rollback on failure

If any step throws, rollback actions run in reverse:

- Control-plane row marked `status='deleted'`, `deleted_at=now`
- `az sql db delete` for the tenant DB (if created)
- Failure recorded in `/blockers/BLOCKERS.md`

### Expected output (truncated)

```
{"level":"info","step":"az-sql-db-create","ms":18855,"msg":"✔ az-sql-db-create"}
{"level":"info","msg":"  -> applying V1__members.sql"}
...
{"level":"info","count":7,"msg":"migrations applied"}

============================================================
  TENANT PROVISIONED
  tenant_id:  273684b8-4d97-48b0-afb8-cfe831555bc8
  slug:       daiso-test
  db_name:    tenant-daiso-test
  secret:     tenant-273684b8-4d97-48b0-afb8-cfe831555bc8-sql-connstr
  API KEY (shown ONCE, store it now):
    lp_sk_********************************
============================================================
```

## Test tenant (live dev)

| field | value |
| --- | --- |
| slug | `daiso-test` |
| tenant_id | `273684b8-4d97-48b0-afb8-cfe831555bc8` |
| db name | `tenant-daiso-test` |
| db server | `loyalty-dev-sql-5rdrqhw.database.windows.net` |
| Key Vault secret | `tenant-273684b8-4d97-48b0-afb8-cfe831555bc8-sql-connstr` |

Verify:

```bash
az sql db show -g loyalty-platform-dev -s loyalty-dev-sql-5rdrqhw -n tenant-daiso-test -o table
az keyvault secret list --vault-name loyalty-dev-kv-5rdrqh -o table | grep tenant-273684b8
```

## Manual rollback of a tenant

```bash
az sql db delete -g loyalty-platform-dev -s loyalty-dev-sql-5rdrqhw -n tenant-<slug> --yes
az keyvault secret delete --vault-name loyalty-dev-kv-5rdrqh --name tenant-<uuid>-sql-connstr
# In control-plane DB:
UPDATE dbo.tenants SET status='deleted', deleted_at=SYSUTCDATETIME() WHERE slug='<slug>';
```
