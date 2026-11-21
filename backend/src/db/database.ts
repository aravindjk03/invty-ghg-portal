import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import type { Db } from './driver';

export interface UserRecord {
  id: string;
  email: string;
  phone?: string | null;
  password_hash: string;
  salt: string;
  name: string;
  company_name: string;
  role: 'ADMIN' | 'ESG_MANAGER' | 'ESG_ANALYST' | 'AUDITOR' | 'OPERATOR' | 'SECURITY';
  status?: 'active' | 'suspended';
  last_login_at?: string | null;
  suspended_reason?: string | null;
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
  /** 'suspended' accounts are refused at sign-in and on every request. */
  status?: 'active' | 'suspended';
}

export interface AuditBlockRow {
  owner_id: string;
  block_index: number;
  timestamp: string;
  action: string;
  entity_id: string;
  actor: string;
  payload_summary: string;
  previous_block_hash: string;
  block_hash: string;
}

/**
 * One spelling for a phone number, so the same handset is the same account
 * however it was typed, and so nothing but digits and a leading + ever
 * reaches a query.
 */
export function normalisePhone(phone: string): string {
  const trimmed = String(phone ?? '').trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return hasPlus ? `+${digits}` : digits;
}

class DatabaseService {
  private _db: Db | null = null;
  private ready: Promise<void> | null = null;

  private get db(): Db {
    if (!this._db) throw new Error('Database not initialised: await dbService.init() before serving requests.');
    return this._db;
  }

  /** Which database is in use, for /api/health and the logs. */
  public get kind(): Db['kind'] | null {
    return this._db?.kind ?? null;
  }

  /**
   * Opens the database (Postgres when DATABASE_URL is set, else the SQLite file),
   * creates the tables and seeds what an empty database needs. Safe to call
   * more than once.
   */
  public init(): Promise<void> {
    if (!this.ready) this.ready = this.open();
    return this.ready;
  }

  private async open(): Promise<void> {
    const url = (process.env.DATABASE_URL || '').trim();
    if (url) {
      // Loaded only when used, so a Postgres host never touches node:sqlite and vice versa.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PostgresDb } = require('./postgres') as typeof import('./postgres');
      const pg = new PostgresDb(url, process.env.IINVTY_DB_SCHEMA?.trim() || undefined);
      await pg.init();
      this._db = pg;
    } else {
      const dataDir = path.resolve(__dirname, '../../data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      // IINVTY_DB_FILE lets the test suite use a throwaway database.
      const file = process.env.IINVTY_DB_FILE || path.join(dataDir, 'invty_portal.db');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SqliteDb } = require('./sqlite') as typeof import('./sqlite');
      const lite = new SqliteDb(file);
      await lite.init();
      this._db = lite;
    }
    await this.seedDefaultUsers();
    await this.renameDemoAdmin();
  }

  /** Runs fn under a lock named key, in one transaction (see Db.serial). */
  public serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return this.db.serial(key, () => fn());
  }

  public async ping(): Promise<boolean> {
    return this._db ? this._db.ping() : false;
  }

  public async close(): Promise<void> {
    await this._db?.close();
    this._db = null;
    this.ready = null;
  }

  // Hash password with secure scrypt algorithm + random salt
  public hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
    const salt = existingSalt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return { hash, salt };
  }

  /** Does the work of a password check and throws the answer away. */
  public burnPasswordCheck(password: string): void {
    crypto.scryptSync(password, 'no-such-account-fixed-salt', 64);
  }

  // Account lockout. Five wrong passwords lock the account for fifteen
  // minutes, whatever addresses they came from.
  private static readonly MAX_FAILURES = 5;
  private static readonly LOCK_MINUTES = 15;

  public async loginLockSeconds(email: string): Promise<number> {
    const row = await this.db.get('SELECT locked_until FROM login_failures WHERE email = ?', email.trim().toLowerCase()) as { locked_until: string | null } | undefined;
    if (!row?.locked_until) return 0;
    const remaining = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1000);
    if (remaining <= 0) {
      await this.clearLoginFailures(email);
      return 0;
    }
    return remaining;
  }

  public async recordLoginFailure(email: string): Promise<void> {
    const key = email.trim().toLowerCase();
    await this.db.run('INSERT INTO login_failures (email, failures) VALUES (?, 1) '
      + 'ON CONFLICT(email) DO UPDATE SET failures = login_failures.failures + 1', key);
    const row = await this.db.get('SELECT failures FROM login_failures WHERE email = ?', key) as { failures: number };
    if (row.failures >= DatabaseService.MAX_FAILURES) {
      const until = new Date(Date.now() + DatabaseService.LOCK_MINUTES * 60_000).toISOString();
      await this.db.run('UPDATE login_failures SET locked_until = ?, failures = 0 WHERE email = ?', until, key);
    }
  }

  public async clearLoginFailures(email: string): Promise<void> {
    await this.db.run('DELETE FROM login_failures WHERE email = ?', email.trim().toLowerCase());
  }

  public verifyPassword(password: string, hash: string, salt: string): boolean {
    const computed = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
  }

  /**
   * Accounts an empty database starts with.
   *
   * This had no environment guard. On any fresh production database it
   * created admin@invty.com with the password IINVTY@2026 and the ADMIN role,
   * and demo@company.com with Demo@1234 — both passwords sitting in a public
   * GitHub repository. Anyone who read the source owned the deployment.
   *
   * It is worse than a one-off mistake on a host whose disk is ephemeral:
   * the table is empty again after every restart, so the known-password admin
   * came back even if someone had changed it.
   *
   * In production nothing is seeded unless ADMIN_EMAIL is set, and then the
   * password is random and printed once to the server log for the operator to
   * collect and change. Outside production the demo accounts stay, because
   * that is what they are for.
   */
  private async seedDefaultUsers(): Promise<void> {
        const result = await this.db.get('SELECT COUNT(*) as count FROM users') as { count: number };
    if (!result || result.count !== 0) return;

    if (process.env.NODE_ENV === 'production') {
      await this.seedProductionAdmin();
      return;
    }

    {
      console.log('[IINVTY DB] Seeding initial enterprise demonstration accounts...');

      const adminCreds = this.hashPassword('IINVTY@2026');
      await this.createUser({
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
      await this.createUser({
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

  /**
   * The one account a fresh production database gets, if the operator asked
   * for one. The password is never in the source: it is generated here and
   * written to the log once, where only someone who can already read the
   * server's output will see it.
   */
  private async seedProductionAdmin(): Promise<void> {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (!email) {
      console.log(
        '[IINVTY DB] Empty database and no ADMIN_EMAIL set, so no account was created. '
        + 'Set ADMIN_EMAIL and restart to get one.'
      );
      return;
    }

    // 32 hex characters from the system CSPRNG: not guessable, and not in git.
    const password = crypto.randomBytes(16).toString('hex');
    const creds = this.hashPassword(password);
    const now = new Date().toISOString();

    await this.createUser({
      id: `usr-admin-${crypto.randomBytes(6).toString('hex')}`,
      email,
      password_hash: creds.hash,
      salt: creds.salt,
      name: 'Administrator',
      company_name: process.env.ADMIN_COMPANY?.trim() || 'IINVTY',
      role: 'ADMIN',
      auth_provider: 'email',
      created_at: now,
      updated_at: now,
    });

    console.log(
      `\n[IINVTY DB] Created the administrator account ${email}.`
      + `\n[IINVTY DB] One-time password: ${password}`
      + '\n[IINVTY DB] Sign in and change it. This is printed once and is not stored anywhere else.\n'
    );
  }

  public async createUser(user: UserRecord): Promise<SafeUser> {
    
    await this.db.run(`
      INSERT INTO users (id, email, phone, password_hash, salt, name, company_name, role, avatar_url, auth_provider, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, user.id,
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
      user.updated_at);

    return this.toSafeUser(user);
  }

  // The company is IINVTY (formerly written INVTY). Databases seeded before the rename
  // still hold the old demo admin name and password; update them in place without
  // touching any other account, or a password the admin has already changed.
  private async renameDemoAdmin(): Promise<void> {
    try {
      const admin = await this.findUserByEmail('admin@invty.com');
      if (!admin) return;
      const now = new Date().toISOString();
      // Deliberately no password rewrite here. This used to notice the old
      // demo password and replace it with the newer published one, which put
      // a credential from the public repository back onto a live account.
      // Outside production the seeder sets it; in production nothing should
      // move an account's password but its owner.
      await this.db.run(
        "UPDATE users SET name = 'IINVTY Enterprise Admin', company_name = 'IINVTY Sustainability Systems', updated_at = ? " +
        "WHERE id = ? AND name = 'INVTY Enterprise Admin' AND company_name = 'INVTY Sustainability Systems'"
      , now, admin.id);
    } catch (err) {
      console.warn('[IINVTY DB] Demo admin rename notice:', err);
    }
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
        const row = await this.db.get('SELECT * FROM users WHERE lower(email) = ?', email.toLowerCase().trim()) as UserRecord | undefined;
    return row || null;
  }

  public async findUserByPhone(phone: string): Promise<UserRecord | null> {
    // This used to strip only whitespace and hyphens and interpolate what was
    // left into a LIKE pattern, so `%` and `_` survived as wildcards: a
    // "phone number" of %%%%%%%% produced phone LIKE '%%%%%%%%%', matched
    // every account and returned the first row — the seeded administrator.
    // With the OTP handed back in the response, that was an unauthenticated
    // takeover in two requests. The suffix match was its own bug besides: two
    // customers in different countries sharing their last ten digits resolved
    // to one account.
    const normalised = normalisePhone(phone);
    if (!normalised) return null;
        const row = await this.db.get('SELECT * FROM users WHERE phone = ?', normalised) as UserRecord | undefined;
    return row || null;
  }

  public async findUserById(id: string): Promise<UserRecord | null> {
        const row = await this.db.get('SELECT * FROM users WHERE id = ?', id) as UserRecord | undefined;
    return row || null;
  }

  // OTP management for mobile sign-in
  public async saveOtp(phone: string, code: string, ttlSeconds = 300): Promise<void> {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    
    await this.db.run(`
      INSERT INTO otps (phone, code, created_at, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        code = excluded.code,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `, cleanPhone, code, now.toISOString(), expiresAt.toISOString());
  }

  public async verifyOtp(phone: string, code: string): Promise<boolean> {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) return false;
        const row = await this.db.get('SELECT * FROM otps WHERE phone = ?', cleanPhone) as { phone: string; code: string; expires_at: string } | undefined;

    if (!row) return false;
    if (new Date(row.expires_at) < new Date()) {
      await this.deleteOtp(cleanPhone);
      return false;
    }

    if (row.code.trim() === code.trim()) {
      await this.deleteOtp(cleanPhone);
      return true;
    }

    return false;
  }

  public async deleteOtp(phone: string): Promise<void> {
    const cleanPhone = normalisePhone(phone);
        await this.db.run('DELETE FROM otps WHERE phone = ?', cleanPhone);
  }

  // Find or create user from Mobile Phone OTP
  public async findOrCreateMobileUser(phone: string, name?: string, companyName?: string): Promise<SafeUser> {
    const cleanPhone = normalisePhone(phone);
    if (!cleanPhone) throw new Error('A valid phone number is required.');
    let user = await this.findUserByPhone(cleanPhone);

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

      await this.createUser(user);
    }

    return this.toSafeUser(user);
  }

  // Find or create user from verified Google OAuth
  public async findOrCreateGoogleUser(data: {
    email: string;
    name: string;
    avatarUrl?: string;
    companyName?: string;
  }): Promise<SafeUser> {
    const cleanEmail = data.email.toLowerCase().trim();
    let user = await this.findUserByEmail(cleanEmail);

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

      await this.createUser(user);
    } else if (data.avatarUrl && (!user.avatar_url || user.avatar_url !== data.avatarUrl)) {
      try {
                await this.db.run('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?', data.avatarUrl, new Date().toISOString(), user.id);
        user.avatar_url = data.avatarUrl;
      } catch (e) {
        // Ignore non-fatal update error
      }
    }

    return this.toSafeUser(user);
  }

  public async createSession(userId: string, expiresInDays = 7): Promise<string> {
    await this.db.run('UPDATE users SET last_login_at = ? WHERE id = ?', new Date().toISOString(), userId);
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    
    await this.db.run(`
      INSERT INTO sessions (token, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `, token, userId, now.toISOString(), expiresAt.toISOString());
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

  private async entitlementRow(userId: string): Promise<{ plan: Plan; estimates_used: number;
    first_used_at: string | null; last_used_at: string | null;
    upgraded_at: string | null }> {
    const existing = await this.db.get('SELECT plan, estimates_used, first_used_at, last_used_at, upgraded_at '
               + 'FROM entitlements WHERE user_id = ?', userId) as any;
    if (existing) return existing;

    await this.db.run('INSERT INTO entitlements (user_id, plan, estimates_used) '
               + "VALUES (?, 'free', 0) ON CONFLICT (user_id) DO NOTHING", userId);
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

  public async getEntitlement(userId: string): Promise<Entitlement> {
    return this.toEntitlement(userId, await this.entitlementRow(userId));
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
  public async reserveEstimate(userId: string, product: string): Promise<Reservation> {
    const row = await this.entitlementRow(userId);

    if (row.plan === 'premium') {
      const ledgerId = await this.recordLedger(userId, product, row.plan);
      await this.db.run("UPDATE entitlements SET estimates_used = estimates_used + 1, "
                      + "last_used_at = ?, first_used_at = COALESCE(first_used_at, ?) "
                      + 'WHERE user_id = ?', new Date().toISOString(), new Date().toISOString(), userId);
      return { allowed: true, entitlement: await this.getEntitlement(userId), ledgerId };
    }

    const now = new Date().toISOString();
    const result = await this.db.run('UPDATE entitlements SET estimates_used = estimates_used + 1, '
               + 'last_used_at = ?, first_used_at = COALESCE(first_used_at, ?) '
               + 'WHERE user_id = ? AND estimates_used < ?', now, now, userId, this.freeEstimateLimit);

    if (!result.changes) {
      return { allowed: false, entitlement: await this.getEntitlement(userId) };
    }
    const ledgerId = await this.recordLedger(userId, product, row.plan);
    return { allowed: true, entitlement: await this.getEntitlement(userId), ledgerId };
  }

  /** Give back an estimate that was reserved but never delivered. */
  public async refundEstimate(userId: string, ledgerId: string, reason: string): Promise<Entitlement> {
    const ledger = await this.db.get('SELECT user_id, refunded_at FROM estimate_ledger WHERE id = ?', ledgerId) as any;

    // Only an unrefunded reservation belonging to this account, so a replayed
    // refund cannot hand out free estimates.
    if (ledger && ledger.user_id === userId && !ledger.refunded_at) {
      const now = new Date().toISOString();
      await this.db.run('UPDATE estimate_ledger SET refunded_at = ?, refund_reason = ? '
                      + 'WHERE id = ?', now, reason.slice(0, 200), ledgerId);
      await this.db.run('UPDATE entitlements SET estimates_used = CASE WHEN estimates_used > 0 THEN estimates_used - 1 ELSE 0 END '
                      + 'WHERE user_id = ?', userId);
    }
    return await this.getEntitlement(userId);
  }

  private async recordLedger(userId: string, product: string, plan: Plan): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.run('INSERT INTO estimate_ledger (id, user_id, product, plan_at_time, created_at) '
               + 'VALUES (?, ?, ?, ?, ?)', id, userId, product.slice(0, 300), plan, new Date().toISOString());
    return id;
  }

  /** Move an account onto premium. Called once payment is confirmed. */
  public async setPlan(userId: string, plan: Plan): Promise<Entitlement> {
    await this.entitlementRow(userId);
    await this.db.run('UPDATE entitlements SET plan = ?, upgraded_at = ? WHERE user_id = ?', plan, plan === 'premium' ? new Date().toISOString() : null, userId);
    return await this.getEntitlement(userId);
  }

  // ── Leads ─────────────────────────────────────────────────────────────────

  // Audit chain storage. One chain per owning account, so one customer's
  // history is never readable from another's session.
  public async auditBlocks(ownerId: string): Promise<AuditBlockRow[]> {
    return await this.db.all('SELECT * FROM audit_blocks WHERE owner_id = ? ORDER BY block_index ASC', ownerId) as unknown as AuditBlockRow[];
  }

  public async appendAuditBlock(row: AuditBlockRow): Promise<void> {
    await this.db.run('INSERT INTO audit_blocks (owner_id, block_index, timestamp, action, entity_id, '
               + 'actor, payload_summary, previous_block_hash, block_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', row.owner_id, row.block_index, row.timestamp, row.action, row.entity_id,
           row.actor, row.payload_summary, row.previous_block_hash, row.block_hash);
  }

  public async insertLead(lead: LeadRow): Promise<LeadRow> {
    await this.db.run('INSERT INTO leads (id, name, work_email, company_name, sector, phone, '
               + 'primary_need, requested_action, referral_source, annual_scale, '
               + 'inventory_stats, captured_at, ip_address) '
               + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', lead.id, lead.name, lead.workEmail, lead.companyName, lead.sector ?? null,
           lead.phone ?? null, lead.primaryNeed ?? null, lead.requestedAction ?? null,
           lead.referralSource ?? null, lead.annualTurnoverOrProduction ?? null,
           lead.inventoryStats ? JSON.stringify(lead.inventoryStats) : null,
           lead.capturedAt, lead.ipAddress ?? null);
    return lead;
  }

  public async allLeads(): Promise<LeadRow[]> {
    const rows = await this.db.all('SELECT * FROM leads ORDER BY captured_at DESC') as any[];
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

  public async recentEstimates(userId: string, limit = 20): Promise<Array<{ id: string; product: string;
    createdAt: string; refundedAt: string | null }>> {
    const rows = await this.db.all<any>('SELECT id, product, created_at, refunded_at FROM estimate_ledger '
               + 'WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', userId, Math.min(Math.max(limit, 1), 100));
    return rows.map((row) => ({
      id: row.id,
      product: row.product,
      createdAt: row.created_at,
      refundedAt: row.refunded_at,
    }));
  }

  public async getSession(token: string): Promise<{ session: SessionRecord; user: SafeUser } | null> {
    
    const row = await this.db.get(`
      SELECT s.token, s.user_id, s.created_at as session_created_at, s.expires_at,
             u.id, u.email, u.phone, u.name, u.company_name, u.role, u.avatar_url, u.auth_provider, u.created_at,
             u.status
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `, token) as any;
    if (!row) return null;

    // Check expiry
    if (new Date(row.expires_at) < new Date()) {
      await this.deleteSession(token);
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
        status: row.status === 'suspended' ? 'suspended' : 'active',
      },
    };
  }

  /** The shared database handle, for the operations console store. */
  public get connection(): Db {
    return this.db;
  }

  // ── Account self-service ────────────────────────────────────────────────
  // None of this existed. An account could not change its own name, picture
  // or password, and could not be deleted — which meant a leaked password had
  // no remedy inside the product, and no erasure request could be honoured.

  public async updateProfile(
    userId: string,
    fields: { name?: string; companyName?: string; avatarUrl?: string | null },
  ): Promise<SafeUser | null> {
    const user = await this.findUserById(userId);
    if (!user) return null;
    const next = {
      name: fields.name ?? user.name,
      company: fields.companyName ?? user.company_name,
      avatar: fields.avatarUrl === undefined ? (user.avatar_url ?? null) : fields.avatarUrl,
    };
    await this.db.run('UPDATE users SET name = ?, company_name = ?, avatar_url = ?, updated_at = ? WHERE id = ?', next.name.trim(), next.company.trim(), next.avatar, new Date().toISOString(), userId);
    return this.toSafeUser((await this.findUserById(userId))!);
  }

  /** Sets a new password and signs every other device out. */
  public async changePassword(userId: string, newPassword: string, keepToken: string): Promise<void> {
    const { hash, salt } = this.hashPassword(newPassword);
    await this.db.run('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?', hash, salt, new Date().toISOString(), userId);
    // A password is usually changed because the old one may be known. Any
    // session opened with it must not outlive it.
    await this.db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', userId, keepToken);
  }

  public async deleteOtherSessions(userId: string, keepToken: string): Promise<number> {
    const result = await this.db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', userId, keepToken);
    return Number(result.changes ?? 0);
  }

  /** Erases the account. Sessions, entitlements, ledger and audit rows cascade. */
  public async deleteUser(userId: string): Promise<void> {
    await this.db.run('DELETE FROM users WHERE id = ?', userId);
  }

  public async deleteSession(token: string): Promise<void> {
        await this.db.run('DELETE FROM sessions WHERE token = ?', token);
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
      status: user.status === 'suspended' ? 'suspended' : 'active',
    };
  }
}

export const dbService = new DatabaseService();
