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
      console.warn('[INVTY DB] Schema migration check notice:', err);
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
      console.log('[INVTY DB] Seeding initial enterprise demonstration accounts...');

      const adminCreds = this.hashPassword('Invty@2026');
      this.createUser({
        id: 'usr-admin-invty-001',
        email: 'admin@invty.com',
        phone: '+919876543210',
        password_hash: adminCreds.hash,
        salt: adminCreds.salt,
        name: 'INVTY Enterprise Admin',
        company_name: 'INVTY Sustainability Systems',
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

      console.log('[INVTY DB] Demo accounts created: admin@invty.com & demo@company.com');
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
        company_name: companyName?.trim() || 'INVTY Industrial Enterprise',
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
        company_name: data.companyName?.trim() || `${cleanEmail.split('@')[1]?.split('.')[0]?.toUpperCase() || 'INVTY'} Enterprise`,
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
