import { randomBytes, randomUUID, scrypt, ScryptOptions, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/** promisify() drops the options overload, so wrap scrypt by hand. */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) =>
      err ? reject(err) : resolve(derived)
    );
  });
}

/**
 * Password hashing parameters.
 *
 * scrypt is memory-hard and ships with Node, so there is no native build step
 * and no third-party hashing dependency to keep patched. N=2^15 with r=8 is a
 * commonly recommended interactive-login cost.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;

/**
 * scrypt needs roughly 128 * N * r bytes, which at these parameters is exactly
 * Node's 32 MB default ceiling and so is rejected. Raise the ceiling rather
 * than weaken the cost factor.
 */
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

export type AuthProvider = 'password' | 'google';

export interface UserProfile {
  companyName: string;
  sector: string;
  role: string;
  reportingPeriod: string;
  country?: string;
  employeeBand?: string;
  completedAt: string;
}

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  provider: AuthProvider;
  /** Absent for federated accounts, which never have a local password. */
  passwordHash?: string;
  /** Google's stable subject id, used to re-match a returning federated user. */
  googleSubject?: string;
  avatarUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string;
  /** Organisation details captured after first sign-in. */
  profile?: UserProfile;
}

/** What is safe to hand back to the client. Never includes the hash. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  provider: AuthProvider;
  avatarUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  profile?: UserProfile;
  /** Drives the post-login onboarding step. */
  profileComplete: boolean;
}

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '.data');
const USERS_FILE = join(DATA_DIR, 'users.json');

function loadUsers(): StoredUser[] {
  try {
    if (!existsSync(USERS_FILE)) return [];
    return JSON.parse(readFileSync(USERS_FILE, 'utf8')) as StoredUser[];
  } catch (err) {
    // Never silently fall back to an empty store: that would let anyone
    // re-register an existing address and take over the account.
    console.error('[auth] User store is unreadable.', err);
    throw new Error('User store is unreadable');
  }
}

/** Write via a temp file + rename so a crash mid-write cannot truncate the store. */
function saveUsers(users: StoredUser[]): void {
  mkdirSync(dirname(USERS_FILE), { recursive: true });
  const tmp = `${USERS_FILE}.${randomUUID()}.tmp`;
  writeFileSync(tmp, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, USERS_FILE);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      // Sized from the stored parameters so older hashes still verify if the
      // cost factor is raised later.
      maxmem: 128 * Number(n) * Number(r) * 2,
    });

    // Constant-time compare so response timing does not leak the hash.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    profile: user.profile,
    profileComplete: Boolean(user.profile),
  };
}

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export const usersService = {
  findByEmail(email: string): StoredUser | undefined {
    const target = normaliseEmail(email);
    return loadUsers().find((u) => u.email === target);
  },

  findById(id: string): StoredUser | undefined {
    return loadUsers().find((u) => u.id === id);
  },

  async createWithPassword(input: {
    email: string;
    name: string;
    password: string;
  }): Promise<StoredUser> {
    const users = loadUsers();
    const email = normaliseEmail(input.email);

    if (users.some((u) => u.email === email)) {
      throw Object.assign(new Error('An account with this email already exists.'), {
        code: 'EMAIL_TAKEN',
      });
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: randomUUID(),
      email,
      name: input.name.trim(),
      provider: 'password',
      passwordHash: await hashPassword(input.password),
      // Email ownership is unproven until a verification link is sent. That
      // flow is not built yet, so this stays false rather than claiming
      // a verification that never happened.
      emailVerified: false,
      createdAt: now,
      lastLoginAt: now,
    };

    users.push(user);
    saveUsers(users);
    return user;
  },

  /**
   * Find or create the local account behind a verified Google identity.
   * An existing password account with the same address is linked rather than
   * duplicated, so a user who signed up by email can later use Google.
   */
  upsertGoogleUser(input: {
    googleSubject: string;
    email: string;
    name: string;
    avatarUrl?: string;
    emailVerified: boolean;
  }): StoredUser {
    const users = loadUsers();
    const email = normaliseEmail(input.email);
    const now = new Date().toISOString();

    let user =
      users.find((u) => u.googleSubject === input.googleSubject) ||
      users.find((u) => u.email === email);

    if (user) {
      user.googleSubject = input.googleSubject;
      user.name = user.name || input.name;
      user.avatarUrl = input.avatarUrl ?? user.avatarUrl;
      user.emailVerified = user.emailVerified || input.emailVerified;
      user.lastLoginAt = now;
    } else {
      user = {
        id: randomUUID(),
        email,
        name: input.name.trim(),
        provider: 'google',
        googleSubject: input.googleSubject,
        avatarUrl: input.avatarUrl,
        emailVerified: input.emailVerified,
        createdAt: now,
        lastLoginAt: now,
      };
      users.push(user);
    }

    saveUsers(users);
    return user;
  },

  recordLogin(id: string): void {
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return;
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);
  },

  saveProfile(id: string, profile: Omit<UserProfile, 'completedAt'>): StoredUser | undefined {
    const users = loadUsers();
    const user = users.find((u) => u.id === id);
    if (!user) return undefined;

    user.profile = { ...profile, completedAt: new Date().toISOString() };
    saveUsers(users);
    return user;
  },
};
