import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('[CRITICAL CONFIG ERROR] Invalid environment variables configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;

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
