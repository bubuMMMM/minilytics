// Applies migrations-pg/*.sql to DATABASE_URL (idempotent). Usage: DATABASE_URL=... node scripts/migrate-pg.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
await client.query('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)');
for (const f of readdirSync('migrations-pg').filter((f) => f.endsWith('.sql')).sort()) {
  const done = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
  if (done.rowCount) continue;
  await client.query('BEGIN');
  await client.query(readFileSync(`migrations-pg/${f}`, 'utf8'));
  await client.query('INSERT INTO _migrations VALUES ($1, $2)', [f, Date.now()]);
  await client.query('COMMIT');
  console.log('applied', f);
}
client.release();
await pool.end();
