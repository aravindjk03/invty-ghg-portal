import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

export interface UserRecord {
  id: string;
  email: string;
  phone?: string | null;
  password_hash: string;
  salt: string;
  name: string;
  company_name: string;
  role: 'ADMIN' | 'ESG_MANAGER' | 'ESG_ANALYST' | 'AUDITOR';
  avatar_url?: string | null;
  auth_provider?: string;
  created_at: string;
  updated_at: string;
}

export interface SessionRecord {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

/** What an account may do. `free` gets a fixed number of AI estimates. */
export type Plan = 'free' | 'premium';

export interface Entitlement {
  userId: string;
  plan: Plan;
  estimatesUsed: number;
  estimatesLimit: number | null;   // null = no limit (premium)
  estimatesRemaining: number | null;
  firstUsedAt?: string | null;
  lastUsedAt?: string | null;
  upgradedAt?: string | null;
}

/** The outcome of trying to spend one estimate. */
export interface Reservation {
  allowed: boolean;
  entitlement: Entitlement;
  ledgerId?: string;
}

export interface LeadRow {
  id: string;
  name: string;
  workEmail: string;
  companyName: string;
  sector: string;
  phone?: string;
  primaryNeed: string;
  /** What they were trying to do when asked. 'premium' is an upgrade request. */
  requestedAction?: string;
  referralSource: string;
  annualTurnoverOrProduction?: string;
  inventoryStats?: Record<string, unknown>;
  capturedAt: string;
  ipAddress?: string;
}

export interface SafeUser {
  id: string;
  email: string;
  phone?: string;
  name: string;
  companyName: string;
  role: string;
  avatarUrl?: string;
  authProvider?: string;
  createdAt: string;
}

class DatabaseService {
  private db: any;
  private dbFilePath: string;

  constructor() {
    const dataDir = path.resolve(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbFilePath = path.join(dataDir, 'invty_portal.db');
    this.db = new DatabaseSync(this.dbFilePath);
    this.initSchema();
    this.seedDefaultUsers();
    this.renameDemoAdmin();
  }

  private initSchema() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    // Users table
    this.db.exec(`
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
    `);

    // Schema migrations for existing SQLite file
    try {
      const columns = (this.db.prepare('PRAGMA table_info(users)').all()).map((c: any) => c.name);
      if (!columns.includes('phone')) {
        this.db.exec('ALTER TABLE users ADD COLUMN phone TEXT;');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);');
      }
      if (!columns.includes('avatar_url')) {
        this.db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT;');
      }
      if (!columns.includes('auth_provider')) {
        this.db.exec("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'email';");
      }
    } catch (err) {
      console.warn('[IINVTY DB] Schema migration check notice:', err);
    }
  }

  // Hash password with secure scrypt algorithm + random salt
  public hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
    const salt = existingSalt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  public verifyPassword(password: string, hash: string, salt: string): boolean {
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  }

  private seedDefaultUsers() {
    const checkStmt = this.db.prepare('SELECT COUNT(*) as count FROM users');
    const result = checkStmt.get() as { count: number };

    if (result && result.count === 0) {
      console.log('[IINVTY DB] Seeding initial enterprise demonstration accounts...');

      const adminCreds = this.hashPassword('IINVTY@2026');
      this.createUser({
        id: 'usr-admin-invty-001',
        email: 'admin@invty.com',
        phone: '+919876543210',
        password_hash: adminCreds.hash,
        salt: adminCreds.salt,
        name: 'IINVTY Enterprise Admin',
        company_name: 'IINVTY Sustainability Systems',
        role: 'ADMIN',
        auth_provider: 'email',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const demoCreds = this.hashPassword('Demo@1234');
      this.createUser({
        id: 'usr-demo-lead-002',
        email: 'demo@company.com',
        phone: '+919123456780',
        password_hash: demoCreds.hash,
        salt: demoCreds.salt,
        name: 'Rajesh Sharma',
        company_name: 'Tata Heavy Engineering Ltd',
        role: 'ESG_ANALYST',
        auth_provider: 'email',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log('[IINVTY DB] Demo accounts created: admin@invty.com & demo@company.com');
    }
  }

  public createUser(user: UserRecord): SafeUser {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, phone, password_hash, salt, name, company_name, role, avatar_url, auth_provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      user.email.toLowerCase().trim(),
      user.phone || null,
      user.password_hash,
      user.salt,
      user.name.trim(),
      user.company_name.trim(),
      user.role,
      user.avatar_url || null,
      user.auth_provider || 'email',
      user.created_at,
      user.updated_at
    );

    return this.toSafeUser(user);
  }

  // The company is IINVTY (formerly written INVTY). Databases seeded before the rename
  // still hold the old demo admin name and password; update them in place without
  // touching any other account, or a password the admin has already changed.
  private renameDemoAdmin() {
    try {
      const admin = this.findUserByEmail('admin@invty.com');
      if (!admin) return;
      const now = new Date().toISOString();
      if (this.verifyPassword('Invty@2026', admin.password_hash, admin.salt)) {
        const creds = this.hashPassword('IINVTY@2026');
        this.db.prepare('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?')
          .run(creds.hash, creds.salt, now, admin.id);
      }
      this.db.prepare(
        "UPDATE users SET name = 'IINVTY Enterprise Admin', company_name = 'IINVTY Sustainability Systems', updated_at = ? " +
        "WHERE id = ? AND name = 'INVTY Enterprise Admin' AND company_name = 'INVTY Sustainability Systems'"
      ).run(now, admin.id);
    } catch (err) {
      console.warn('[IINVTY DB] Demo admin rename notice:', err);
    }
  }

  public findUserByEmail(email: string): UserRecord | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE');
    const row = stmt.get(email.toLowerCase().trim()) as UserRecord | undefined;
    return row || null;
  }

  public findUserByPhone(phone: string): UserRecord | null {
    const cleanPhone = phone.replace(/[\s\-]/g, '').trim();
    const stmt = this.db.prepare('SELECT * FROM users WHERE phone = ? OR phone LIKE ?');
    const row = stmt.get(cleanPhone, `%${cleanPhone.slice(-10)}`) as UserRecord | undefined;
    return row || null;
  }

  public findUserById(id: string): UserRecord | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as UserRecord | undefined;
    return row || null;
  }

  // OTP management for mobile sign-in
  public saveOtp(phone: string, code: string, ttlSeconds = 300): void {
    const cleanPhone = phone.replace(/[\s\-]/g, '').trim();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const stmt = this.db.prepare(`
      INSERT INTO otps (phone, code, created_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        code = excluded.code,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `);

    stmt.run(cleanPhone, code, now.toISOString(), expiresAt.toISOString());
  }

  public verifyOtp(phone: string, code: string): boolean {
    const cleanPhone = phone.replace(/[\s\-]/g, '').trim();
    const stmt = this.db.prepare('SELECT * FROM otps WHERE phone = ?');
    const row = stmt.get(cleanPhone) as { phone: string; code: string; expires_at: string } | undefined;

    if (!row) return false;
    if (new Date(row.expires_at) < new Date()) {
      this.deleteOtp(cleanPhone);
      return false;
    }

    if (row.code.trim() === code.trim()) {
      this.deleteOtp(cleanPhone);
      return true;
    }

    return false;
  }

  public deleteOtp(phone: string): void {
    const cleanPhone = phone.replace(/[\s\-]/g, '').trim();
    const stmt = this.db.prepare('DELETE FROM otps WHERE phone = ?');
    stmt.run(cleanPhone);
  }

  // Find or create user from Mobile Phone OTP
  public findOrCreateMobileUser(phone: string, name?: string, companyName?: string): SafeUser {
    const cleanPhone = phone.replace(/[\s\-]/g, '').trim();
    let user = this.findUserByPhone(cleanPhone);

    if (!user) {
      const { hash, salt } = this.hashPassword(crypto.randomBytes(16).toString('hex'));
      const userId = `usr-m-${crypto.randomBytes(6).toString('hex')}`;
      const placeholderEmail = `mobile_${cleanPhone.slice(-10)}@invty-auth.local`;

      user = {
        id: userId,
        email: placeholderEmail,
        phone: cleanPhone,
        password_hash: hash,
        salt,
        name: name?.trim() || `Enterprise Member (${cleanPhone.slice(-4)})`,
        company_name: companyName?.trim() || 'IINVTY Industrial Enterprise',
        role: 'ESG_ANALYST',
        avatar_url: null,
        auth_provider: 'mobile_otp',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.createUser(user);
    }

    return this.toSafeUser(user);
  }

  // Find or create user from verified Google OAuth
  public findOrCreateGoogleUser(data: {
    email: string;
    name: string;
    avatarUrl?: string;
    companyName?: string;
  }): SafeUser {
    const cleanEmail = data.email.toLowerCase().trim();
    let user = this.findUserByEmail(cleanEmail);

    if (!user) {
      const { hash, salt } = this.hashPassword(crypto.randomBytes(16).toString('hex'));
      const userId = `usr-g-${crypto.randomBytes(6).toString('hex')}`;

      user = {
        id: userId,
        email: cleanEmail,
        phone: null,
        password_hash: hash,
        salt,
        name: data.name?.trim() || cleanEmail.split('@')[0],
        company_name: data.companyName?.trim() || `${cleanEmail.split('@')[1]?.split('.')[0]?.toUpperCase() || 'IINVTY'} Enterprise`,
        role: 'ESG_ANALYST',
        avatar_url: data.avatarUrl || null,
        auth_provider: 'google',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.createUser(user);
    } else if (data.avatarUrl && (!user.avatar_url || user.avatar_url !== data.avatarUrl)) {
      try {
        const updateStmt = this.db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?');
        updateStmt.run(data.avatarUrl, new Date().toISOString(), user.id);
        user.avatar_url = data.avatarUrl;
      } catch (e) {
        // Ignore non-fatal update error
      }
    }

    return this.toSafeUser(user);
  }

  public createSession(userId: string, expiresInDays = 7): string {
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    const stmt = this.db.prepare(`
      INSERT INTO sessions (token, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(token, userId, now.toISOString(), expiresAt.toISOString());
    return token;
  }

  // ── Entitlements ──────────────────────────────────────────────────────────
  //
  // The free allowance is deliberately small: it is a trial, not a tier. It is
  // read from FREE_ESTIMATE_LIMIT so it can be changed without a deploy, and
  // it is enforced HERE rather than in the browser or in the AI service,
  // because this is the only process that owns the account.

  public get freeEstimateLimit(): number {
    const configured = Number(process.env.FREE_ESTIMATE_LIMIT);
    return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 2;
  }

  private entitlementRow(userId: string): { plan: Plan; estimates_used: number;
    first_used_at: string | null; last_used_at: string | null;
    upgraded_at: string | null } {
    const existing = this.db
      .prepare('SELECT plan, estimates_used, first_used_at, last_used_at, upgraded_at '
               + 'FROM entitlements WHERE user_id = ?')
      .get(userId) as any;
    if (existing) return existing;

    this.db
      .prepare('INSERT OR IGNORE INTO entitlements (user_id, plan, estimates_used) '
               + "VALUES (?, 'free', 0)")
      .run(userId);
    return { plan: 'free', estimates_used: 0, first_used_at: null, last_used_at: null,
             upgraded_at: null };
  }

  private toEntitlement(userId: string, row: { plan: Plan; estimates_used: number;
    first_used_at: string | null; last_used_at: string | null;
    upgraded_at: string | null }): Entitlement {
    const limit = row.plan === 'premium' ? null : this.freeEstimateLimit;
    return {
      userId,
      plan: row.plan,
      estimatesUsed: row.estimates_used,
      estimatesLimit: limit,
      estimatesRemaining: limit === null ? null : Math.max(0, limit - row.estimates_used),
      firstUsedAt: row.first_used_at,
      lastUsedAt: row.last_used_at,
      upgradedAt: row.upgraded_at,
    };
  }

  public getEntitlement(userId: string): Entitlement {
    return this.toEntitlement(userId, this.entitlementRow(userId));
  }

  /**
   * Spend one estimate, or refuse.
   *
   * Reserved BEFORE the AI is called, not after: two requests arriving together
   * would otherwise both read "1 used" and both proceed, and the customer would
   * get a third estimate free. The UPDATE below only matches while the count is
   * still under the limit, so the database decides, not the order of reads.
   *
   * A reservation that is not used is refunded by `refundEstimate`, so a failed
   * or refused AI call never costs the customer one of their two.
   */
  public reserveEstimate(userId: string, product: string): Reservation {
    const row = this.entitlementRow(userId);

    if (row.plan === 'premium') {
      const ledgerId = this.recordLedger(userId, product, row.plan);
      this.db.prepare("UPDATE entitlements SET estimates_used = estimates_used + 1, "
                      + "last_used_at = ?, first_used_at = COALESCE(first_used_at, ?) "
                      + 'WHERE user_id = ?')
        .run(new Date().toISOString(), new Date().toISOString(), userId);
      return { allowed: true, entitlement: this.getEntitlement(userId), ledgerId };
    }

    const now = new Date().toISOString();
    const result = this.db
      .prepare('UPDATE entitlements SET estimates_used = estimates_used + 1, '
               + 'last_used_at = ?, first_used_at = COALESCE(first_used_at, ?) '
               + 'WHERE user_id = ? AND estimates_used < ?')
      .run(now, now, userId, this.freeEstimateLimit);

    if (!result.changes) {
      return { allowed: false, entitlement: this.getEntitlement(userId) };
    }
    const ledgerId = this.recordLedger(userId, product, row.plan);
    return { allowed: true, entitlement: this.getEntitlement(userId), ledgerId };
  }

  /** Give back an estimate that was reserved but never delivered. */
  public refundEstimate(userId: string, ledgerId: string, reason: string): Entitlement {
    const ledger = this.db
      .prepare('SELECT user_id, refunded_at FROM estimate_ledger WHERE id = ?')
      .get(ledgerId) as any;

    // Only an unrefunded reservation belonging to this account, so a replayed
    // refund cannot hand out free estimates.
    if (ledger && ledger.user_id === userId && !ledger.refunded_at) {
      const now = new Date().toISOString();
      this.db.prepare('UPDATE estimate_ledger SET refunded_at = ?, refund_reason = ? '
                      + 'WHERE id = ?')
        .run(now, reason.slice(0, 200), ledgerId);
      this.db.prepare('UPDATE entitlements SET estimates_used = MAX(0, estimates_used - 1) '
                      + 'WHERE user_id = ?')
        .run(userId);
    }
    return this.getEntitlement(userId);
  }

  private recordLedger(userId: string, product: string, plan: Plan): string {
    const id = crypto.randomUUID();
    this.db
      .prepare('INSERT INTO estimate_ledger (id, user_id, product, plan_at_time, created_at) '
               + 'VALUES (?, ?, ?, ?, ?)')
      .run(id, userId, product.slice(0, 300), plan, new Date().toISOString());
    return id;
  }

  /** Move an account onto premium. Called once payment is confirmed. */
  public setPlan(userId: string, plan: Plan): Entitlement {
    this.entitlementRow(userId);
    this.db
      .prepare('UPDATE entitlements SET plan = ?, upgraded_at = ? WHERE user_id = ?')
      .run(plan, plan === 'premium' ? new Date().toISOString() : null, userId);
    return this.getEntitlement(userId);
  }

  // ── Leads ─────────────────────────────────────────────────────────────────

  public insertLead(lead: LeadRow): LeadRow {
    this.db
      .prepare('INSERT INTO leads (id, name, work_email, company_name, sector, phone, '
               + 'primary_need, requested_action, referral_source, annual_scale, '
               + 'inventory_stats, captured_at, ip_address) '
               + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(lead.id, lead.name, lead.workEmail, lead.companyName, lead.sector ?? null,
           lead.phone ?? null, lead.primaryNeed ?? null, lead.requestedAction ?? null,
           lead.referralSource ?? null, lead.annualTurnoverOrProduction ?? null,
           lead.inventoryStats ? JSON.stringify(lead.inventoryStats) : null,
           lead.capturedAt, lead.ipAddress ?? null);
    return lead;
  }

  public allLeads(): LeadRow[] {
    const rows = this.db
      .prepare('SELECT * FROM leads ORDER BY captured_at DESC')
      .all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      workEmail: row.work_email,
      companyName: row.company_name,
      sector: row.sector,
      phone: row.phone ?? undefined,
      primaryNeed: row.primary_need,
      requestedAction: row.requested_action ?? undefined,
      referralSource: row.referral_source,
      annualTurnoverOrProduction: row.annual_scale ?? undefined,
      inventoryStats: row.inventory_stats ? JSON.parse(row.inventory_stats) : undefined,
      capturedAt: row.captured_at,
      ipAddress: row.ip_address ?? undefined,
    }));
  }

  public recentEstimates(userId: string, limit = 20): Array<{ id: string; product: string;
    createdAt: string; refundedAt: string | null }> {
    const rows = this.db
      .prepare('SELECT id, product, created_at, refunded_at FROM estimate_ledger '
               + 'WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(userId, Math.min(Math.max(limit, 1), 100)) as any[];
    return rows.map((row) => ({
      id: row.id,
      product: row.product,
      createdAt: row.created_at,
      refundedAt: row.refunded_at,
    }));
  }

  public getSession(token: string): { session: SessionRecord; user: SafeUser } | null {
    const stmt = this.db.prepare(`
      SELECT s.token, s.user_id, s.created_at as session_created_at, s.expires_at,
             u.id, u.email, u.phone, u.name, u.company_name, u.role, u.avatar_url, u.auth_provider, u.created_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `);

    const row = stmt.get(token) as any;
    if (!row) return null;

    // Check expiry
    if (new Date(row.expires_at) < new Date()) {
      this.deleteSession(token);
      return null;
    }

    return {
      session: {
        token: row.token,
        user_id: row.user_id,
        created_at: row.session_created_at,
        expires_at: row.expires_at,
      },
      user: {
        id: row.id,
        email: row.email,
        phone: row.phone,
        name: row.name,
        companyName: row.company_name,
        role: row.role,
        avatarUrl: row.avatar_url,
        authProvider: row.auth_provider,
        createdAt: row.created_at,
      },
    };
  }

  public deleteSession(token: string): void {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE token = ?');
    stmt.run(token);
  }

  public toSafeUser(user: UserRecord): SafeUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone || undefined,
      name: user.name,
      companyName: user.company_name,
      role: user.role,
      avatarUrl: user.avatar_url || undefined,
      authProvider: user.auth_provider || 'email',
      createdAt: user.created_at,
    };
  }
}

export const dbService = new DatabaseService();
