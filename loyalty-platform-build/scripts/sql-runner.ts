import * as fs from 'fs';
import * as path from 'path';
import * as sql from 'mssql';

export interface MigrationResult {
  file: string;
  batches: number;
  rowsAffected: number;
  ms: number;
}

/**
 * Parse a T-SQL script on GO batch separators (case-insensitive, line-only).
 */
export function splitBatches(script: string): string[] {
  return script
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

export async function runSqlFile(
  pool: sql.ConnectionPool,
  filePath: string,
): Promise<MigrationResult> {
  const started = Date.now();
  const script = fs.readFileSync(filePath, 'utf8');
  const batches = splitBatches(script);
  let rows = 0;
  for (const batch of batches) {
    const req = pool.request();
    const res = await req.batch(batch);
    if (Array.isArray(res.rowsAffected)) {
      rows += res.rowsAffected.reduce((a, b) => a + b, 0);
    }
  }
  return {
    file: path.basename(filePath),
    batches: batches.length,
    rowsAffected: rows,
    ms: Date.now() - started,
  };
}

export async function runMigrationsDir(
  pool: sql.ConnectionPool,
  dir: string,
  log: (m: string) => void,
): Promise<MigrationResult[]> {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^V\d+__.*\.sql$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^V(\d+)/i)![1], 10);
      const nb = parseInt(b.match(/^V(\d+)/i)![1], 10);
      return na - nb;
    });
  const results: MigrationResult[] = [];
  for (const f of files) {
    const full = path.join(dir, f);
    log(`  -> applying ${f}`);
    const r = await runSqlFile(pool, full);
    log(`     ok (${r.batches} batches, ${r.rowsAffected} rows, ${r.ms}ms)`);
    results.push(r);
  }
  return results;
}
