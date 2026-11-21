/**
 * One small, async database interface with two implementations:
 *
 *   SQLite   (node:sqlite)  the default, a file under backend/data. No setup;
 *                           used for local development and the test suite.
 *   Postgres (pg)           used whenever DATABASE_URL is set. For hosts whose
 *                           disk is wiped on restart (Render/Koyeb free tiers),
 *                           with a free Postgres such as Neon.
 *
 * SQL is written once, with `?` placeholders and portable syntax. The few
 * places where the two differ ask the driver (`like`, the schema files).
 */
export type DbKind = 'sqlite' | 'postgres';

export interface RunResult { changes: number }

export interface Db {
  readonly kind: DbKind;
  /** Case-insensitive LIKE: SQLite's LIKE already is, Postgres needs ILIKE. */
  readonly like: 'LIKE' | 'ILIKE';
  get<T = any>(sql: string, ...args: unknown[]): Promise<T | undefined>;
  all<T = any>(sql: string, ...args: unknown[]): Promise<T[]>;
  run(sql: string, ...args: unknown[]): Promise<RunResult>;
  exec(sql: string): Promise<void>;
  /**
   * Runs fn with no other `serial` call on the same key running at the same
   * time, in one transaction. Postgres uses an advisory lock, so it holds
   * across several server instances; SQLite uses an in-process queue.
   */
  serial<T>(key: string, fn: (db: Db) => Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** `?` → `$1, $2 …`, skipping anything inside single-quoted strings. */
export function toPositional(sql: string): string {
  let out = '';
  let n = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'") {
      inString = !inString;
      out += c;
    } else if (c === '?' && !inString) {
      out += `$${++n}`;
    } else {
      out += c;
    }
  }
  return out;
}
