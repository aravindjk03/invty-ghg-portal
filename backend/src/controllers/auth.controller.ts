import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { dbService, normalisePhone } from '../db/database';
import { env } from '../config/env';

const signupSchema = z.object({
  email: z.string().email('Valid business email address is required'),
  password: z.string().min(12, 'Password must be at least 12 characters')
    .max(200, 'Password must be at most 200 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  // `role` is deliberately NOT accepted here. It used to be part of this
  // schema and was written straight through to the user record, so anyone
  // could POST {"role":"ADMIN"} to /auth/signup and mint an administrator.
  // Nothing checked roles at the time, which hid it; the moment a role check
  // exists it is privilege escalation by request body. A role is granted by
  // an administrator, never claimed by the person signing up.
});

/**
 * A profile picture is stored as a small inline image, not a link. A link
 * would let an account point its avatar at any address — a tracking pixel
 * loaded by everyone who sees the name, or a `javascript:` URL — so only an
 * image the browser has already decoded and re-encoded is accepted.
 */
const AVATAR = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120).optional(),
  companyName: z.string().trim().min(2, 'Organisation name is required').max(200).optional(),
  avatarUrl: z.union([
    z.string().max(120_000, 'That picture is too large.').regex(AVATAR, 'That is not a supported picture.'),
    z.null(),
  ]).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12, 'Password must be at least 12 characters')
    .max(200, 'Password must be at most 200 characters'),
});

const deleteAccountSchema = z.object({ confirmEmail: z.string().min(3).max(320) });

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const sendOtpSchema = z.object({
  phone: z.string().min(8, 'Phone number must be at least 8 digits'),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8, 'Valid phone number is required'),
  code: z.string().length(6, 'OTP code must be exactly 6 digits'),
  name: z.string().optional(),
  companyName: z.string().optional(),
});

const googleAuthSchema = z.object({
  /** ID token from the Google Sign-In button / One Tap. */
  credential: z.string().optional(),
  /** OAuth access token from the Google account-chooser popup. */
  accessToken: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
  companyName: z.string().optional(),
});

interface VerifiedGoogleIdentity {
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Asks Google whether a token is genuine, unexpired and was issued to this
 * app, and returns the verified identity. The browser's own claims about the
 * user (email, name) are never trusted: without this check anyone could POST
 * someone else's email address and be signed in as them.
 */
async function verifyGoogleToken(
  kind: 'id_token' | 'access_token',
  token: string
): Promise<VerifiedGoogleIdentity | null> {
  const info = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?${kind}=${encodeURIComponent(token)}`
  );
  if (!info.ok) return null;
  const claims = (await info.json()) as Record<string, string | boolean | undefined>;

  // A token minted for another site must not open an account here.
  //
  // This check used to be skipped whenever GOOGLE_CLIENT_ID was unset, and
  // production start-up does not require it — so one missing variable meant
  // a valid Google token issued to ANY app on the internet signed its owner
  // in here. With no client ID configured there is nothing to compare
  // against, so Google sign-in is refused outright. `azp` is no longer
  // accepted in place of `aud`: it names who asked for the token, not who it
  // is for.
  if (!env.GOOGLE_CLIENT_ID) return null;
  if (String(claims.aud ?? '') !== env.GOOGLE_CLIENT_ID) return null;

  if (kind === 'id_token') {
    const issuer = String(claims.iss ?? '');
    if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') return null;
  }

  const email = typeof claims.email === 'string' ? claims.email : '';
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!email || !emailVerified) return null;

  if (kind === 'id_token') {
    return {
      email,
      name: typeof claims.name === 'string' ? claims.name : undefined,
      picture: typeof claims.picture === 'string' ? claims.picture : undefined,
    };
  }

  // tokeninfo for an access token carries no profile; read it with the token.
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = profileRes.ok ? ((await profileRes.json()) as Record<string, string>) : {};
  return { email, name: profile.name, picture: profile.picture };
}

export const authController = {
  // 1. Email + Password Sign Up
  signup: async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Invalid input data',
            details: parsed.error.format(),
          },
        });
        return;
      }

      const { email, password, name, companyName } = parsed.data;

      const existing = dbService.findUserByEmail(email);
      if (existing) {
        res.status(409).json({
          success: false,
          error: {
            code: 'USER_EXISTS',
            message: 'An account with this email address already exists. Please log in.',
          },
        });
        return;
      }

      const { hash, salt } = dbService.hashPassword(password);
      const userId = `usr-${crypto.randomBytes(8).toString('hex')}`;

      const user = dbService.createUser({
        id: userId,
        email,
        password_hash: hash,
        salt,
        name,
        company_name: companyName,
        // Everyone who signs up themselves is an analyst. Elevation is an
        // administrator's act, not a field in the request.
        role: 'ESG_ANALYST',
        auth_provider: 'email',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const token = dbService.createSession(user.id);

      res.status(201).json({
        success: true,
        message: 'Account successfully registered and authenticated.',
        user,
        token,
      });
    } catch (error: any) {
      console.error('[AUTH SIGNUP ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'An internal error occurred during registration.',
        },
      });
    }
  },

  // 2. Email + Password Login
  login: async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Email and password required',
          },
        });
        return;
      }

      const { email, password } = parsed.data;

      // Too many wrong passwords for this account, from anywhere. The IP
      // limiter alone lets a spread-out guessing run through untouched.
      const lockedFor = dbService.loginLockSeconds(email);
      if (lockedFor > 0) {
        res.setHeader('Retry-After', String(lockedFor));
        res.status(429).json({
          success: false,
          error: {
            code: 'ACCOUNT_LOCKED',
            message: `Too many failed sign-in attempts. Try again in ${Math.ceil(lockedFor / 60)} minute(s).`,
          },
        });
        return;
      }

      const user = dbService.findUserByEmail(email);

      if (!user) {
        // Spend the same time hashing as a real attempt would. Returning at
        // once made "no such account" ten times faster than "wrong password",
        // which told anyone timing the endpoint which emails are customers.
        dbService.burnPasswordCheck(password);
        dbService.recordLoginFailure(email);
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password. Please verify your credentials.',
          },
        });
        return;
      }

      const valid = dbService.verifyPassword(password, user.password_hash, user.salt);
      if (!valid) {
        dbService.recordLoginFailure(email);
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password. Please verify your credentials.',
          },
        });
        return;
      }

      dbService.clearLoginFailures(email);
      const token = dbService.createSession(user.id);
      const safeUser = dbService.toSafeUser(user);

      res.status(200).json({
        success: true,
        message: 'Authentication successful.',
        user: safeUser,
        token,
      });
    } catch (error: any) {
      console.error('[AUTH LOGIN ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'An internal error occurred during authentication.',
        },
      });
    }
  },

  // 3. Mobile Phone - Send OTP
  sendMobileOtp: async (req: Request, res: Response) => {
    try {
      const parsed = sendOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Valid mobile phone number required',
          },
        });
        return;
      }

      // Digits and an optional leading + only; anything else is not a phone
      // number and gets no "code sent" reply.
      const phone = normalisePhone(parsed.data.phone);
      if (!phone) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Please enter a valid mobile number, with country code.' },
        });
        return;
      }

      // No SMS provider is connected. In production that means a code can be
      // generated but never delivered, so saying "code sent" would be untrue
      // and the sign-in could not be completed anyway.
      if (env.NODE_ENV === 'production') {
        res.status(503).json({
          success: false,
          error: {
            code: 'SMS_NOT_AVAILABLE',
            message: 'Sign-in by mobile number is not available yet. Please use your email address.',
          },
        });
        return;
      }

      // Math.random() was used here. It is a non-cryptographic PRNG whose
      // internal state can be recovered from a handful of outputs, so
      // observing a few codes predicts the next one.
      const otpCode = crypto.randomInt(100000, 1000000).toString();

      // Save to SQLite otps table with 5 minutes validity
      dbService.saveOtp(phone, otpCode, 300);

      // Development and test only — production returned above. The code is
      // handed back because there is no SMS provider to deliver it. It must
      // never be returned where real accounts live: doing so let anyone
      // request a code for any number, read it from the reply and sign in as
      // that person.
      console.log(`[SMS SERVICE] Dispatched 6-digit OTP for ${phone}: ${otpCode}`);

      res.status(200).json({
        success: true,
        message: `One-Time Password (OTP) dispatched to ${phone}`,
        phone,
        devOtp: otpCode,
        expiresInSeconds: 300,
      });
    } catch (error: any) {
      console.error('[AUTH SEND OTP ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to dispatch OTP. Please check the phone number.',
        },
      });
    }
  },

  // 4. Mobile Phone - Verify OTP & Sign In
  verifyMobileOtp: async (req: Request, res: Response) => {
    try {
      const parsed = verifyOtpSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Phone and 6-digit OTP code required',
          },
        });
        return;
      }

      const { phone, code, name, companyName } = parsed.data;
      const isValid = dbService.verifyOtp(phone, code);

      if (!isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_OTP',
            message: 'Invalid or expired OTP code. Please enter the correct code or request a new one.',
          },
        });
        return;
      }

      // Find existing user or auto-create enterprise mobile user in SQLite
      const safeUser = dbService.findOrCreateMobileUser(phone, name, companyName);
      const token = dbService.createSession(safeUser.id);

      res.status(200).json({
        success: true,
        message: 'Phone number verified successfully. Session activated.',
        user: safeUser,
        token,
      });
    } catch (error: any) {
      console.error('[AUTH VERIFY OTP ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to verify OTP.',
        },
      });
    }
  },

  // 5. Official Google Sign-In & Verification
  googleAuth: async (req: Request, res: Response) => {
    try {
      const parsed = googleAuthSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid Google authentication parameters',
          },
        });
        return;
      }

      const { credential, accessToken } = parsed.data;
      if (!credential && !accessToken) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_GOOGLE_TOKEN',
            message: 'Google sign-in did not return a token. Please try again.',
          },
        });
        return;
      }

      let identity: VerifiedGoogleIdentity | null;
      try {
        identity = credential
          ? await verifyGoogleToken('id_token', credential)
          : await verifyGoogleToken('access_token', accessToken!);
      } catch (error) {
        console.error('[AUTH GOOGLE] Could not reach Google to verify the token:', error);
        res.status(502).json({
          success: false,
          error: {
            code: 'GOOGLE_UNREACHABLE',
            message: 'Could not reach Google to confirm the sign-in. Please try again.',
          },
        });
        return;
      }

      if (!identity) {
        res.status(401).json({
          success: false,
          error: {
            code: 'GOOGLE_TOKEN_INVALID',
            message: 'Google could not confirm this sign-in. Please try again.',
          },
        });
        return;
      }

      const email = identity.email;
      const name = identity.name || parsed.data.name;
      const picture = identity.picture || parsed.data.picture;

      const safeUser = dbService.findOrCreateGoogleUser({
        email,
        name: name || email.split('@')[0],
        avatarUrl: picture,
        companyName: parsed.data.companyName,
      });

      const token = dbService.createSession(safeUser.id);

      res.status(200).json({
        success: true,
        message: `Signed in with Google as ${safeUser.email}.`,
        user: safeUser,
        token,
      });
    } catch (error: any) {
      console.error('[AUTH GOOGLE ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Google authentication processing failed.',
        },
      });
    }
  },

  // 6. Current User Session Check (Bearer Token)
  me: async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or malformed Authorization header',
        },
      });
      return;
    }

    const token = authHeader.substring(7);
    const sessionData = dbService.getSession(token);

    if (!sessionData) {
      res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: 'Session has expired or is invalid. Please log in again.',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: sessionData.user,
    });
  },

  // 7. Logout
  logout: async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      dbService.deleteSession(token);
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  },

  // 8. Demo Accounts List for quick dev/testing
  // ── Account self-service (all behind requireAuth) ───────────────────────

  updateProfile: (req: Request, res: Response) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid profile details.' },
      });
      return;
    }
    const user = dbService.updateProfile(req.user!.id, parsed.data);
    res.status(200).json({ success: true, user });
  },

  changePassword: (req: Request, res: Response) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0]?.message || 'Invalid password.' },
      });
      return;
    }
    const record = dbService.findUserById(req.user!.id);
    // The current password is asked for again: a borrowed, unlocked session
    // must not be enough to lock the owner out of their own account.
    if (!record || !dbService.verifyPassword(parsed.data.currentPassword, record.password_hash, record.salt)) {
      res.status(403).json({
        success: false,
        error: { code: 'WRONG_PASSWORD', message: 'The current password is not correct.' },
      });
      return;
    }
    const token = (req.headers.authorization || '').slice(7).trim();
    dbService.changePassword(record.id, parsed.data.newPassword, token);
    res.status(200).json({ success: true, message: 'Password changed. Other devices have been signed out.' });
  },

  logoutEverywhere: (req: Request, res: Response) => {
    const token = (req.headers.authorization || '').slice(7).trim();
    const ended = dbService.deleteOtherSessions(req.user!.id, token);
    res.status(200).json({ success: true, sessionsEnded: ended });
  },

  deleteAccount: (req: Request, res: Response) => {
    const parsed = deleteAccountSchema.safeParse(req.body);
    const record = dbService.findUserById(req.user!.id);
    if (!parsed.success || !record) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Type your email address to confirm.' },
      });
      return;
    }
    if (parsed.data.confirmEmail.trim().toLowerCase() !== record.email.toLowerCase()) {
      res.status(403).json({
        success: false,
        error: { code: 'CONFIRMATION_MISMATCH', message: 'That is not the email address on this account.' },
      });
      return;
    }
    dbService.deleteUser(record.id);
    res.status(200).json({ success: true, message: 'Your account and everything stored with it have been deleted.' });
  },

  getDemoAccounts: (_req: Request, res: Response) => {
    // Seeded credentials are a development convenience. In production this
    // endpoint does not exist, so the passwords never leave the server.
    if (env.NODE_ENV === 'production') {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Demo accounts are not available.' },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    res.status(200).json({
      success: true,
      accounts: [
        {
          type: 'email',
          email: 'admin@invty.com',
          password: 'IINVTY@2026',
          name: 'IINVTY Enterprise Admin',
          company: 'IINVTY Sustainability Systems',
          role: 'ADMIN',
        },
        {
          type: 'email',
          email: 'demo@company.com',
          password: 'Demo@1234',
          name: 'Rajesh Sharma',
          company: 'Tata Heavy Engineering Ltd',
          role: 'ESG_ANALYST',
        },
        {
          type: 'mobile',
          phone: '+919876543210',
          name: 'IINVTY Enterprise Admin',
          company: 'IINVTY Sustainability Systems',
          role: 'ADMIN',
        },
      ],
    });
  },
};
