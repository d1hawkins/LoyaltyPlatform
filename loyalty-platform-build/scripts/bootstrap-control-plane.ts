/**
 * Apply control plane migrations to the already-deployed `control-plane` DB.
 * Usage: CONTROL_PLANE_SQL_CONNSTR="..." pnpm tsx scripts/bootstrap-control-plane.ts
 */
import * as path from 'path';
import * as sql from 'mssql';
import { runMigrationsDir } from './sql-runner';

async function main() {
  const connStr = process.env.CONTROL_PLANE_SQL_CONNSTR;
  if (!connStr) {
    console.error('CONTROL_PLANE_SQL_CONNSTR env var is required');
    process.exit(1);
  }
  const log = (m: string) => console.log(`[bootstrap] ${m}`);
  log('connecting to control plane DB...');
  const pool = await new sql.ConnectionPool(connStr).connect();
  try {
    const dir = path.resolve(__dirname, '..', 'infra', 'control-plane', 'migrations');
    log(`applying migrations from ${dir}`);
    const results = await runMigrationsDir(pool, dir, log);
    log(`done: ${results.length} migrations applied`);
  } finally {
    await pool.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
