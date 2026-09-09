import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Use Node.js 24 built-in SQLite engine
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DatabaseSync } = require('node:sqlite');

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  name: string;
  company_name: string;
  role: 'ADMIN' | 'ESG_MANAGER' | 'ESG_ANALYST' | 'AUDITOR';
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
  name: string;
  companyName: string;
  role: string;
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
    `);
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
        password_hash: adminCreds.hash,
        salt: adminCreds.salt,
        name: 'INVTY Enterprise Admin',
        company_name: 'INVTY Sustainability Systems',
        role: 'ADMIN',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const demoCreds = this.hashPassword('Demo@1234');
      this.createUser({
        id: 'usr-demo-lead-002',
        email: 'demo@company.com',
        password_hash: demoCreds.hash,
        salt: demoCreds.salt,
        name: 'Rajesh Sharma',
        company_name: 'Tata Heavy Engineering Ltd',
        role: 'ESG_ANALYST',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log('[INVTY DB] Demo accounts created: admin@invty.com & demo@company.com');
    }
  }

  public createUser(user: UserRecord): SafeUser {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, email, password_hash, salt, name, company_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      user.email.toLowerCase().trim(),
      user.password_hash,
      user.salt,
      user.name.trim(),
      user.company_name.trim(),
      user.role,
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

  public findUserById(id: string): UserRecord | null {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const row = stmt.get(id) as UserRecord | undefined;
    return row || null;
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
             u.id, u.email, u.name, u.company_name, u.role, u.created_at
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
        name: row.name,
        companyName: row.company_name,
        role: row.role,
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
      name: user.name,
      companyName: user.company_name,
      role: user.role,
      createdAt: user.created_at,
    };
  }
}

export const dbService = new DatabaseService();
