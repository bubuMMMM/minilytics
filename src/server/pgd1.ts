/**
 * A tiny D1-compatible wrapper over Postgres, so the Worker code (written for Cloudflare D1)
 * runs unchanged on Vercel + Neon. Translates `?` placeholders and a few SQLite-isms.
 */
import { Pool, neonConfig, types, type PoolClient } from '@neondatabase/serverless';
import ws from 'ws';

// Neon's driver talks Postgres over WebSockets (port 443), which works everywhere incl. Vercel Functions.
neonConfig.webSocketConstructor = ws;
types.setTypeParser(20, (v: string) => Number(v)); // int8 (COUNT, BIGINT)
types.setTypeParser(1700, (v: string) => Number(v)); // numeric (SUM, AVG)

export function translate(sql: string): string {
  let s = sql;
  let ignore = false;
  s = s.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, () => {
    ignore = true;
    return 'INSERT INTO';
  });
  let i = 0;
  s = s.replace(/\?/g, () => `$${++i}`);
  if (ignore) s = s.replace(/;?\s*$/, ' ON CONFLICT DO NOTHING');
  return s;
}

type Row = Record<string, unknown>;

class Stmt {
  constructor(
    private db: PgD1,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}
  bind(...params: unknown[]) {
    return new Stmt(this.db, this.sql, params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p)));
  }
  async all<T = Row>(): Promise<{ results: T[]; success: true; meta: { changes: number } }> {
    const r = await this.db.query(this.sql, this.params);
    return { results: r.rows as T[], success: true, meta: { changes: r.rowCount ?? 0 } };
  }
  async first<T = Row>(): Promise<T | null> {
    const r = await this.db.query(this.sql, this.params);
    return (r.rows[0] as T) ?? null;
  }
  run() {
    return this.all();
  }
}

export class PgD1 {
  constructor(private pool: Pool) {}
  query(sql: string, params: unknown[], client?: PoolClient) {
    return (client ?? this.pool).query(translate(sql), params);
  }
  prepare(sql: string) {
    return new Stmt(this, sql);
  }
  async batch(stmts: Stmt[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = [];
      for (const st of stmts) {
        const r = await this.query(st.sql, st.params, client);
        out.push({ results: r.rows, success: true, meta: { changes: r.rowCount ?? 0 } });
      }
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}

let cached: PgD1 | null = null;
export function getDb(): PgD1 {
  if (!cached) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    cached = new PgD1(new Pool({ connectionString: url, max: 3 }));
  }
  return cached;
}
