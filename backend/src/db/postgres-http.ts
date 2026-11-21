/**
 * Postgres over HTTPS with Neon's serverless driver (`@neondatabase/serverless`).
 *
 * Chosen with DATABASE_DRIVER=neon-http. For hosts where a long-lived TCP
 * connection is not available: serverless/edge platforms (Netlify, Vercel Edge,
 * Cloudflare Workers without Hyperdrive), and networks that allow only HTTPS.
 * A long-running server (Render, Docker, a VM) should keep the default `pg`
 * driver over the pooled DATABASE_URL, as Neon recommends.
 *
 * Each query is one HTTPS request. There are no interactive transactions over
 * HTTP, so `serial()` orders work within this process only; running several
 * instances of the backend at once needs the `pg` driver, whose `serial()`
 * holds a Postgres advisory lock.
 */
import { neon, types, type NeonQueryFunction } from '@neondatabase/serverless';
import type { Db, RunResult } from './driver';
import { toPositional } from './driver';
import { POSTGRES_SCHEMA } from './schema';

// COUNT(*) and SUM() arrive as int8/numeric strings; the app expects numbers.
types.setTypeParser(20, (v: string) => parseInt(v, 10));
types.setTypeParser(1700, (v: string) => parseFloat(v));

const norm = (args: unknown[]) => args.map((a) => (a === undefined ? null : a));

/** Splits a schema script into single statements (HTTP takes one per request). */
export function splitStatements(script: string): string[] {
  return script
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

type Result = { rows: any[]; rowCount: number | null };

export class PostgresHttpDb implements Db {
  readonly kind = 'postgres' as const;
  readonly like = 'ILIKE' as const;
  private sql: NeonQueryFunction<false, true>;
  private queues = new Map<string, Promise<unknown>>();
  private schema: string | null;

  constructor(url: string, schema?: string) {
    this.sql = neon(url, { fullResults: true });
    this.schema = schema && /^[a-z_][a-z0-9_]*$/.test(schema) ? schema : null;
  }

  /** One statement; inside the test schema when one is set. */
  private async q(text: string, params: unknown[] = []): Promise<Result> {
    if (!this.schema) return (await this.sql.query(text, params)) as unknown as Result;
    const results = await this.sql.transaction((tx) => [
      tx.query("SELECT set_config('search_path', $1, true)", [this.schema]),
      tx.query(text, params),
    ]);
    return results[1] as unknown as Result;
  }

  async init(directUrl?: string): Promise<void> {
    const ddl = directUrl ? neon(directUrl, { fullResults: true }) : this.sql;
    if (this.schema) await ddl.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    for (const statement of splitStatements(POSTGRES_SCHEMA)) {
      if (this.schema) {
        await ddl.transaction((tx) => [
          tx.query("SELECT set_config('search_path', $1, true)", [this.schema]),
          tx.query(statement),
        ]);
      } else {
        await ddl.query(statement);
      }
    }
  }

  async get<T>(sql: string, ...args: unknown[]): Promise<T | undefined> {
    return (await this.q(toPositional(sql), norm(args))).rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    return (await this.q(toPositional(sql), norm(args))).rows as T[];
  }

  async run(sql: string, ...args: unknown[]): Promise<RunResult> {
    return { changes: (await this.q(toPositional(sql), norm(args))).rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    for (const statement of splitStatements(sql)) await this.q(statement);
  }

  async serial<T>(key: string, fn: (db: Db) => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    const chained = prev.then(() => mine);
    this.queues.set(key, chained);
    await prev;
    try {
      return await fn(this);
    } finally {
      release();
      if (this.queues.get(key) === chained) this.queues.delete(key);
    }
  }

  async ping(): Promise<boolean> {
    try { await this.sql.query('SELECT 1'); return true; } catch { return false; }
  }

  async close(): Promise<void> { /* HTTP: nothing held open */ }
}
