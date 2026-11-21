import { Client, Pool, PoolClient, types } from 'pg';
import type { Db, RunResult } from './driver';
import { toPositional } from './driver';
import { POSTGRES_SCHEMA } from './schema';

// COUNT(*) and SUM() come back as int8/numeric strings; the app expects numbers.
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1700, (v) => parseFloat(v));

const norm = (args: unknown[]) => args.map((a) => (a === undefined ? null : a));

type Queryable = Pool | PoolClient;

class PgHandle implements Db {
  readonly kind = 'postgres' as const;
  readonly like = 'ILIKE' as const;
  constructor(protected q: Queryable, private serialImpl: Db['serial']) {}

  async get<T>(sql: string, ...args: unknown[]): Promise<T | undefined> {
    const r = await this.q.query(toPositional(sql), norm(args));
    return r.rows[0] as T | undefined;
  }

  async all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    const r = await this.q.query(toPositional(sql), norm(args));
    return r.rows as T[];
  }

  async run(sql: string, ...args: unknown[]): Promise<RunResult> {
    const r = await this.q.query(toPositional(sql), norm(args));
    return { changes: r.rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    await this.q.query(sql);
  }

  serial<T>(key: string, fn: (db: Db) => Promise<T>): Promise<T> {
    return this.serialImpl(key, fn);
  }

  async ping(): Promise<boolean> {
    try { await this.q.query('SELECT 1'); return true; } catch { return false; }
  }

  async close(): Promise<void> { /* a transaction handle is released by serial() */ }
}

export class PostgresDb implements Db {
  readonly kind = 'postgres' as const;
  readonly like = 'ILIKE' as const;
  private pool: Pool;
  private handle: PgHandle;
  private schema: string | null;

  constructor(url: string, schema?: string) {
    this.schema = schema && /^[a-z_][a-z0-9_]*$/.test(schema) ? schema : null;
    this.pool = new Pool({
      connectionString: url,
      max: Number(process.env.DATABASE_POOL_MAX) || 5,
      // Free Postgres hosts (Neon) suspend when idle; give the first query time to wake it.
      connectionTimeoutMillis: 15_000,
      idleTimeoutMillis: 30_000,
      // A separate schema per test run, so test files never see each other's rows.
      options: this.schema ? `-c search_path=${this.schema}` : undefined,
    });
    this.pool.on('error', (err) => console.warn('[IINVTY DB] idle Postgres connection error:', err.message));
    this.handle = new PgHandle(this.pool, (k, f) => this.serial(k, f));
  }

  /**
   * Creates the tables. Over the direct (unpooled) connection when one is
   * given, as Neon recommends for schema changes; otherwise over the pool.
   */
  async init(directUrl?: string): Promise<void> {
    if (directUrl) {
      const client = new Client({ connectionString: directUrl, connectionTimeoutMillis: 15_000 });
      await client.connect();
      try {
        if (this.schema) {
          await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
          await client.query(`SET search_path TO ${this.schema}`);
        }
        await client.query(POSTGRES_SCHEMA);
      } finally {
        await client.end();
      }
      return;
    }
    if (this.schema) await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    await this.pool.query(POSTGRES_SCHEMA);
  }

  get<T>(sql: string, ...args: unknown[]) { return this.handle.get<T>(sql, ...args); }
  all<T>(sql: string, ...args: unknown[]) { return this.handle.all<T>(sql, ...args); }
  run(sql: string, ...args: unknown[]) { return this.handle.run(sql, ...args); }
  exec(sql: string) { return this.handle.exec(sql); }
  ping() { return this.handle.ping(); }

  async serial<T>(key: string, fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const result = await fn(new PgHandle(client, (k, f) => this.serial(k, f)));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
