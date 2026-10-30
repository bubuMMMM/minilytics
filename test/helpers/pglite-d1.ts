/**
 * In-process Postgres (PGlite, WASM) behind the same D1-style API as src/server/pgd1.ts, so API routes can be
 * tested end-to-end against the real Postgres migrations without a network database.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, types } from '@electric-sql/pglite';
import { translate } from '../../src/server/pgd1';

const parsers = { [types.INT8]: (v: string) => Number(v), [types.NUMERIC]: (v: string) => Number(v) };

class Stmt {
  constructor(
    private db: PgliteD1,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p)));
  }
  async all() {
    const r = await this.db.pg.query(translate(this.sql), this.params, { parsers });
    return { results: r.rows as any[], success: true, meta: { changes: r.affectedRows ?? 0 } };
  }
  async first<T = any>(): Promise<T | null> {
    return ((await this.all()).results[0] as T) ?? null;
  }
  run() {
    return this.all();
  }
}

export class PgliteD1 {
  constructor(readonly pg: PGlite) {}
  prepare(sql: string) {
    return new Stmt(this, sql);
  }
  async batch(stmts: Stmt[]) {
    return this.pg.transaction(async (tx) => {
      const out = [];
      for (const st of stmts) {
        const r = await tx.query(translate(st.sql), st.params, { parsers });
        out.push({ results: r.rows as any[], success: true, meta: { changes: r.affectedRows ?? 0 } });
      }
      return out;
    });
  }
}

export async function makeDb(): Promise<PgliteD1> {
  const pg = new PGlite();
  const dir = join(__dirname, '../../migrations-pg');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await pg.exec(readFileSync(join(dir, f), 'utf8'));
  return new PgliteD1(pg);
}
