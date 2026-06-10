import * as sql from 'mssql';
import * as path from 'path';
import { runMigrationsDir } from './sql-runner';

const connStr = process.env.TENANT_SQL_CONNSTR!;
if (!connStr) {
  console.error('TENANT_SQL_CONNSTR env var is required');
  process.exit(1);
}

async function main() {
  console.log('Connecting to tenant DB...');
  const pool = await sql.connect(connStr);
  console.log('Connected.');

  const migrationsDir = path.join(__dirname, '..', 'services', 'tenant-migrations');
  console.log(`Running migrations from ${migrationsDir}`);

  const results = await runMigrationsDir(pool, migrationsDir, (m) => console.log(m));

  console.log('\n=== Migration Summary ===');
  for (const r of results) {
    console.log(`  ${r.file}: ${r.batches} batches, ${r.rowsAffected} rows, ${r.ms}ms`);
  }
  console.log(`Total: ${results.length} migrations applied.`);

  await pool.close();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
