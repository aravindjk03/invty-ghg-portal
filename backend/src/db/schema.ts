/**
 * The schema, once per dialect. Kept side by side so a new table or column is
 * added to both in the same change.
 *
 * Timestamps are ISO-8601 TEXT in both, so string comparison and
 * substr(at, 1, 10) mean the same thing on SQLite and Postgres.
 */

export const SQLITE_SCHEMA = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'ESG_ANALYST',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS otps (
        phone TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- What a customer is entitled to. One row per account, created on first
      -- use. The count lives here, in the database, and not in the browser:
      -- a quota a visitor can clear by opening developer tools is not a quota.
      CREATE TABLE IF NOT EXISTS entitlements (
        user_id TEXT PRIMARY KEY,
        plan TEXT NOT NULL DEFAULT 'free',
        estimates_used INTEGER NOT NULL DEFAULT 0,
        first_used_at TEXT,
        last_used_at TEXT,
        upgraded_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Every estimate that consumed a credit, so a disputed bill can be
      -- answered with a list rather than a number.
      CREATE TABLE IF NOT EXISTS estimate_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product TEXT NOT NULL,
        plan_at_time TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refunded_at TEXT,
        refund_reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_user ON estimate_ledger(user_id);

      -- Someone asking to be contacted: for a report, or to be put on Premium.
      -- On disk rather than in memory, because a restart losing the request of
      -- a customer who tried to pay is worse than any bug in this file.
      CREATE TABLE IF NOT EXISTS login_failures (
        email TEXT PRIMARY KEY COLLATE NOCASE,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_blocks (
        owner_id TEXT NOT NULL,
        block_index INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload_summary TEXT NOT NULL,
        previous_block_hash TEXT NOT NULL,
        block_hash TEXT NOT NULL,
        PRIMARY KEY (owner_id, block_index),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        work_email TEXT NOT NULL,
        company_name TEXT NOT NULL,
        sector TEXT,
        phone TEXT,
        primary_need TEXT,
        requested_action TEXT,
        referral_source TEXT,
        annual_scale TEXT,
        inventory_stats TEXT,
        captured_at TEXT NOT NULL,
        ip_address TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_leads_captured ON leads(captured_at);

      -- ── Operations console ────────────────────────────────────────────
      -- What happened to accounts and requests, for the developer and cyber
      -- team. IP addresses are stored masked (last octet / last 80 bits
      -- removed) and every row is deleted after 90 days.
      CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        user_id TEXT,
        actor_id TEXT,
        subject TEXT,
        ip_masked TEXT,
        user_agent TEXT,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sec_at ON security_events(at);
      CREATE INDEX IF NOT EXISTS idx_sec_type ON security_events(type, at);
      CREATE INDEX IF NOT EXISTS idx_sec_user ON security_events(user_id, at);

      -- Counts per account per day. No content, no figures: only how often.
      CREATE TABLE IF NOT EXISTS usage_daily (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        metric TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, metric)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_daily(day);

      CREATE TABLE IF NOT EXISTS ops_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        detail TEXT,
        resolved_at TEXT,
        resolved_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON ops_alerts(status, at);

      -- Every action taken in the console, chained with a keyed hash so an
      -- edited or deleted row breaks verification.
      CREATE TABLE IF NOT EXISTS admin_actions (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        detail TEXT,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
`;

/** Columns added to users after the first release; an old SQLite file gets them here. */
export function sqliteMigrate(db: any): void {
  try {
    const columns = (db.prepare('PRAGMA table_info(users)').all() as any[]).map((c) => c.name);
    const add = (name: string, ddl: string) => { if (!columns.includes(name)) db.exec(ddl); };
    add('phone', 'ALTER TABLE users ADD COLUMN phone TEXT;');
    db.exec('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);');
    add('avatar_url', 'ALTER TABLE users ADD COLUMN avatar_url TEXT;');
    add('auth_provider', "ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email';");
    add('status', "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';");
    add('last_login_at', 'ALTER TABLE users ADD COLUMN last_login_at TEXT;');
    add('suspended_reason', 'ALTER TABLE users ADD COLUMN suspended_reason TEXT;');
  } catch (err) {
    console.warn('[IINVTY DB] Schema migration check notice:', err);
  }
}

/**
 * Postgres: the same tables. Emails are stored lower-case and unique on
 * lower(email), which is what COLLATE NOCASE gives SQLite.
 */
export const POSTGRES_SCHEMA = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        avatar_url TEXT,
        auth_provider TEXT DEFAULT 'email',
        status TEXT NOT NULL DEFAULT 'active',
        last_login_at TEXT,
        suspended_reason TEXT,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'ESG_ANALYST',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS otps (
        phone TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      -- What a customer is entitled to. One row per account, created on first
      -- use. The count lives here, in the database, and not in the browser:
      -- a quota a visitor can clear by opening developer tools is not a quota.
      CREATE TABLE IF NOT EXISTS entitlements (
        user_id TEXT PRIMARY KEY,
        plan TEXT NOT NULL DEFAULT 'free',
        estimates_used INTEGER NOT NULL DEFAULT 0,
        first_used_at TEXT,
        last_used_at TEXT,
        upgraded_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Every estimate that consumed a credit, so a disputed bill can be
      -- answered with a list rather than a number.
      CREATE TABLE IF NOT EXISTS estimate_ledger (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        product TEXT NOT NULL,
        plan_at_time TEXT NOT NULL,
        created_at TEXT NOT NULL,
        refunded_at TEXT,
        refund_reason TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_ledger_user ON estimate_ledger(user_id);

      -- Someone asking to be contacted: for a report, or to be put on Premium.
      -- On disk rather than in memory, because a restart losing the request of
      -- a customer who tried to pay is worse than any bug in this file.
      CREATE TABLE IF NOT EXISTS login_failures (
        email TEXT PRIMARY KEY,
        failures INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT
      );

      CREATE TABLE IF NOT EXISTS audit_blocks (
        owner_id TEXT NOT NULL,
        block_index INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        payload_summary TEXT NOT NULL,
        previous_block_hash TEXT NOT NULL,
        block_hash TEXT NOT NULL,
        PRIMARY KEY (owner_id, block_index),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        work_email TEXT NOT NULL,
        company_name TEXT NOT NULL,
        sector TEXT,
        phone TEXT,
        primary_need TEXT,
        requested_action TEXT,
        referral_source TEXT,
        annual_scale TEXT,
        inventory_stats TEXT,
        captured_at TEXT NOT NULL,
        ip_address TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_leads_captured ON leads(captured_at);

      -- ── Operations console ────────────────────────────────────────────
      -- What happened to accounts and requests, for the developer and cyber
      -- team. IP addresses are stored masked (last octet / last 80 bits
      -- removed) and every row is deleted after 90 days.
      CREATE TABLE IF NOT EXISTS security_events (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        at TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        user_id TEXT,
        actor_id TEXT,
        subject TEXT,
        ip_masked TEXT,
        user_agent TEXT,
        detail TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sec_at ON security_events(at);
      CREATE INDEX IF NOT EXISTS idx_sec_type ON security_events(type, at);
      CREATE INDEX IF NOT EXISTS idx_sec_user ON security_events(user_id, at);

      -- Counts per account per day. No content, no figures: only how often.
      CREATE TABLE IF NOT EXISTS usage_daily (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        metric TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, metric)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_daily(day);

      CREATE TABLE IF NOT EXISTS ops_alerts (
        id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        detail TEXT,
        resolved_at TEXT,
        resolved_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON ops_alerts(status, at);

      -- Every action taken in the console, chained with a keyed hash so an
      -- edited or deleted row breaks verification.
      CREATE TABLE IF NOT EXISTS admin_actions (
        seq BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        at TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        detail TEXT,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
`;
