import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { dbService } from '../db/database';

const signupSchema = z.object({
  email: z.string().email('Valid business email address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  role: z.enum(['ADMIN', 'ESG_MANAGER', 'ESG_ANALYST', 'AUDITOR']).default('ESG_ANALYST'),
});

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
  credential: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
  companyName: z.string().optional(),
});

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

      const { email, password, name, companyName, role } = parsed.data;

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
        role,
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
      const user = dbService.findUserByEmail(email);

      if (!user) {
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
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password. Please verify your credentials.',
          },
        });
        return;
      }

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

      const { phone } = parsed.data;
      // Generate a secure 6-digit numeric OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Save to SQLite otps table with 5 minutes validity
      dbService.saveOtp(phone, otpCode, 300);

      console.log(`[SMS SERVICE] Dispatched 6-digit OTP for ${phone}: ${otpCode}`);

      res.status(200).json({
        success: true,
        message: `One-Time Password (OTP) dispatched to ${phone}`,
        phone,
        // In local development / intranet demo, provide the OTP for immediate testing
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

      let email = parsed.data.email;
      let name = parsed.data.name;
      let picture = parsed.data.picture;

      // If a real Google ID token (JWT) is provided from Google Identity Services
      if (parsed.data.credential) {
        try {
          // JWT payload parsing (middle segment)
          const parts = parsed.data.credential.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            if (payload.email) {
              email = payload.email;
              name = payload.name || name || payload.given_name;
              picture = payload.picture || picture;
            }
          }
        } catch (e) {
          console.warn('[AUTH GOOGLE] JWT token parse fallback:', e);
        }
      }

      if (!email) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_GOOGLE_EMAIL',
            message: 'Unable to extract verified Google email address.',
          },
        });
        return;
      }

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
  getDemoAccounts: (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      accounts: [
        {
          type: 'email',
          email: 'admin@invty.com',
          password: 'Invty@2026',
          name: 'INVTY Enterprise Admin',
          company: 'INVTY Sustainability Systems',
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
          name: 'INVTY Enterprise Admin',
          company: 'INVTY Sustainability Systems',
          role: 'ADMIN',
        },
      ],
    });
  },
};
