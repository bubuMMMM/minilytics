import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { translate } from '../../src/server/pgd1';

/** In-memory Postgres (PGlite) behind the same D1-shaped API the app uses in production (src/server/pgd1.ts). */
export async function testDb() {
  const pg = new PGlite();
  const dir = new URL('../../migrations-pg/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(new URL(f, dir), 'utf8'));
  const num = (rows: any[]) =>
    rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  const run = async (sql: string, params: unknown[]) => {
    const r = await pg.query(translate(sql), params as any[]);
    return { results: num(r.rows as any[]), success: true, meta: { changes: r.affectedRows ?? 0 } };
  };
  const stmt = (sql: string, params: unknown[] = []): any => ({
    sql,
    params,
    bind: (...p: unknown[]) => stmt(sql, p.map((x) => (typeof x === 'boolean' ? (x ? 1 : 0) : x === undefined ? null : x))),
    all: () => run(sql, params),
    first: async () => (await run(sql, params)).results[0] ?? null,
    run: () => run(sql, params),
  });
  const db: any = {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: any[]) => {
      const out = [];
      await pg.exec('BEGIN');
      try {
        for (const s of stmts) out.push(await run(s.sql, s.params));
        await pg.exec('COMMIT');
      } catch (e) {
        await pg.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
  };
  return { db: db as D1Database, pg };
}
