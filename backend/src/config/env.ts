import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

/*
 * Settings come from the host's environment first (Render, Docker, CI). For
 * local runs they are also read from files, earliest wins, never overriding a
 * variable that is already set:
 *   backend/.env            your own local settings
 *   <repo>/.env.local       written by `neon deploy` / `neon env pull`
 *                           (DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH…)
 *   <repo>/.env
 */
const backendDir = path.resolve(__dirname, '../..');
const repoDir = path.resolve(backendDir, '..');
// Tests never read the repo-level files: they hold the real Neon database, and
// a test run must not write to it. Tests pass DATABASE_URL explicitly when wanted.
const envFiles = process.env.NODE_ENV === 'test'
  ? [path.join(backendDir, '.env')]
  : [path.join(backendDir, '.env'), path.join(repoDir, '.env.local'), path.join(repoDir, '.env')];
dotenv.config({ path: envFiles, quiet: true } as dotenv.DotenvConfigOptions);

/**
 * Development-only signing secret. Production refuses to start on this value,
 * because anyone reading the repository could otherwise mint valid tokens.
 */
const DEV_JWT_SECRET = 'invty-dev-only-jwt-secret-change-me-before-deploying';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((val) => parseInt(val, 10)).default('5000'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_WINDOW_MS: z.string().transform((val) => parseInt(val, 10)).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform((val) => parseInt(val, 10)).default('200'),
  API_SECRET_KEY: z.string().min(16).default('invty_secure_dev_key_2026_ghg_protocol'),

  // Auth
  JWT_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  ACCESS_TOKEN_TTL: z.string().default('12h'),
  /** Google OAuth client id. Sign-in with Google is disabled when unset. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  /** Minimum password length accepted at registration. */
  MIN_PASSWORD_LENGTH: z.string().transform((v) => parseInt(v, 10)).default('12'),
  DATA_DIR: z.string().optional(),
  /**
   * The admin site's address(es), comma-separated, e.g. https://ops-x7k2.example.com.
   * When set, the console API answers only browser requests from these origins
   * (any other origin gets a plain 404), and they are added to the CORS list.
   */
  ADMIN_ORIGIN: z.string().optional(),
  /**
   * Postgres connection string (e.g. a free Neon database). When set, accounts
   * and logs are kept there; when not, in a SQLite file under backend/data,
   * which hosts with an ephemeral disk wipe on every restart.
   */
  DATABASE_URL: z.string().optional(),
  /**
   * Direct (unpooled) connection string, used only to create the tables at
   * start-up, as Neon recommends for schema changes. Optional.
   */
  DATABASE_URL_UNPOOLED: z.string().optional(),
  /**
   * How to reach Postgres. 'pg' (default): node-postgres over TCP, for a
   * long-running server (Render, Docker, a VM). 'neon-http': Neon's serverless
   * driver over HTTPS, for serverless/edge hosts or networks that only allow HTTPS.
   */
  DATABASE_DRIVER: z.enum(['pg', 'neon-http']).optional(),
  /**
   * Optional network allowlist for the console API: comma-separated IPs or CIDR
   * ranges (office, VPN). Any other address gets a plain 404.
   */
  OPS_ALLOWED_IPS: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('[CRITICAL CONFIG ERROR] Invalid environment variables configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;

if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
  console.warn('\n[CONFIG WARNING] DATABASE_URL is not set: accounts and logs go to a SQLite file. On a host '
    + 'whose disk is wiped on restart (Render/Koyeb free) they will be LOST. Set DATABASE_URL to a Postgres '
    + 'database (see DEPLOY.md).\n');
}

if (env.NODE_ENV === 'production') {
  const fatal: string[] = [];

  if (env.JWT_SECRET === DEV_JWT_SECRET) {
    fatal.push('JWT_SECRET is still the development default. Generate one with: openssl rand -base64 48');
  }
  if (env.API_SECRET_KEY === 'invty_secure_dev_key_2026_ghg_protocol') {
    fatal.push('API_SECRET_KEY is still the development default.');
  }

  if (fatal.length > 0) {
    console.error('[CRITICAL CONFIG ERROR] Refusing to start in production:');
    for (const line of fatal) console.error(`  - ${line}`);
    process.exit(1);
  }
}

export const isGoogleSignInEnabled = Boolean(env.GOOGLE_CLIENT_ID);
