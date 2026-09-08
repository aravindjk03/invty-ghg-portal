import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import rateLimit from 'express-rate-limit';
import { env, isGoogleSignInEnabled } from '../config/env';
import { tokensService } from '../services/tokens.service';
import { toPublicUser, usersService, verifyPassword } from '../services/users.service';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

/**
 * Credential endpoints get a much tighter limit than the global one: this is
 * the surface an attacker would use to guess passwords.
 */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many sign-in attempts. Try again in a few minutes.',
    },
  },
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(200),
  password: z
    .string()
    .min(env.MIN_PASSWORD_LENGTH, `Password must be at least ${env.MIN_PASSWORD_LENGTH} characters.`)
    .max(200, 'Password is too long.'),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

const profileSchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  sector: z.string().trim().min(2).max(80),
  role: z.string().trim().min(2).max(120),
  reportingPeriod: z.string().trim().min(2).max(60),
  country: z.string().trim().max(80).optional(),
  employeeBand: z.string().trim().max(40).optional(),
});

const fail = (res: Response, status: number, code: string, message: string, details?: unknown) =>
  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
    timestamp: new Date().toISOString(),
  });

const succeed = (res: Response, status: number, data: unknown) =>
  res.status(status).json({ success: true, data, timestamp: new Date().toISOString() });

/** Which sign-in methods the client should offer. */
router.get('/config', (_req: Request, res: Response) => {
  succeed(res, 200, {
    googleEnabled: isGoogleSignInEnabled,
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    minPasswordLength: env.MIN_PASSWORD_LENGTH,
  });
});

router.post('/register', credentialLimiter, async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Check the details entered.', parsed.error.flatten());
  }

  try {
    const user = await usersService.createWithPassword(parsed.data);
    const token = tokensService.issueAccessToken({
      sub: user.id,
      email: user.email,
      provider: user.provider,
    });
    return succeed(res, 201, { token, user: toPublicUser(user) });
  } catch (err) {
    if ((err as { code?: string }).code === 'EMAIL_TAKEN') {
      return fail(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }
    console.error('[auth] Registration failed:', err);
    return fail(res, 500, 'REGISTRATION_FAILED', 'Could not create the account.');
  }
});

router.post('/login', credentialLimiter, async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Enter your email and password.');
  }

  const user = usersService.findByEmail(parsed.data.email);

  // Same response whether the address is unknown or the password is wrong, so
  // the endpoint cannot be used to enumerate registered users.
  const invalid = () => fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');

  if (!user || !user.passwordHash) {
    // Still spend the hashing time so a missing account is not detectably faster.
    await verifyPassword(parsed.data.password, 'scrypt$32768$8$1$AAAA$AAAA');
    return invalid();
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return invalid();

  usersService.recordLogin(user.id);
  const token = tokensService.issueAccessToken({
    sub: user.id,
    email: user.email,
    provider: user.provider,
  });
  return succeed(res, 200, { token, user: toPublicUser(user) });
});

/**
 * Google sign-in.
 *
 * The browser obtains an ID token via Google Identity Services and posts it
 * here. The token's signature, issuer, audience and expiry are verified against
 * Google's published keys, so the client cannot forge an identity.
 */
router.post('/google', credentialLimiter, async (req: Request, res: Response) => {
  if (!isGoogleSignInEnabled || !env.GOOGLE_CLIENT_ID) {
    return fail(res, 503, 'GOOGLE_DISABLED', 'Google sign-in is not configured on this server.');
  }

  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  if (!credential) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Missing Google credential.');
  }

  try {
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      return fail(res, 401, 'GOOGLE_TOKEN_INVALID', 'Google did not return a usable identity.');
    }
    if (!payload.email_verified) {
      return fail(
        res,
        403,
        'GOOGLE_EMAIL_UNVERIFIED',
        'This Google account does not have a verified email address.'
      );
    }

    const user = usersService.upsertGoogleUser({
      googleSubject: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      avatarUrl: payload.picture,
      emailVerified: true,
    });

    const token = tokensService.issueAccessToken({
      sub: user.id,
      email: user.email,
      provider: user.provider,
    });
    return succeed(res, 200, { token, user: toPublicUser(user) });
  } catch (err) {
    console.error('[auth] Google verification failed:', err);
    return fail(res, 401, 'GOOGLE_TOKEN_INVALID', 'Could not verify that Google sign-in.');
  }
});

/** Current session. The client calls this on boot to restore a signed-in user. */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  return succeed(res, 200, { user: toPublicUser(req.user!) });
});

/** Organisation details captured after first sign-in. */
router.put('/profile', requireAuth, (req: Request, res: Response) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Check the details entered.', parsed.error.flatten());
  }

  const updated = usersService.saveProfile(req.user!.id, parsed.data);
  if (!updated) return fail(res, 404, 'ACCOUNT_NOT_FOUND', 'This account no longer exists.');

  return succeed(res, 200, { user: toPublicUser(updated) });
});

/**
 * Tokens are stateless and short-lived, so there is no server-side session to
 * destroy: the client discards its copy. Kept as an endpoint so the client has
 * one place to call and so a revocation list can be added here later.
 */
router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  return succeed(res, 200, { message: 'Signed out.' });
});

export default router;
