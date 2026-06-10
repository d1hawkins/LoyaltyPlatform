import * as sql from 'mssql';

const connStr = process.env.TENANT_SQL_CONNSTR!;
if (!connStr) {
  console.error('TENANT_SQL_CONNSTR env var is required');
  process.exit(1);
}

async function main() {
  const pool = await sql.connect(connStr);
  const result = await pool.request().query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
  );
  console.log('Tables in tenant-daiso-test:');
  result.recordset.forEach((r: any) => console.log('  ' + r.TABLE_NAME));
  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
