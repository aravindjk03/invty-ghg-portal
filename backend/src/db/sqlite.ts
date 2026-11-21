import type { Db, RunResult } from './driver';
import { SQLITE_SCHEMA, sqliteMigrate } from './schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

const norm = (args: unknown[]) => args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

export class SqliteDb implements Db {
  readonly kind = 'sqlite' as const;
  readonly like = 'LIKE' as const;
  private db: any;
  private queues = new Map<string, Promise<unknown>>();

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  async init(): Promise<void> {
    this.db.exec(SQLITE_SCHEMA);
    sqliteMigrate(this.db);
  }

  async get<T>(sql: string, ...args: unknown[]): Promise<T | undefined> {
    return this.db.prepare(sql).get(...norm(args)) as T | undefined;
  }

  async all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...norm(args)) as T[];
  }

  async run(sql: string, ...args: unknown[]): Promise<RunResult> {
    const r = this.db.prepare(sql).run(...norm(args));
    return { changes: Number(r?.changes ?? 0) };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
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
    try { this.db.prepare('SELECT 1').get(); return true; } catch { return false; }
  }

  async close(): Promise<void> {
    try { this.db.close(); } catch { /* already closed */ }
  }
}
