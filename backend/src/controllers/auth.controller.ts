import { Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { dbService } from '../db/database';

const signupSchema = z.object({
  email: z.string().email('Valid email address is required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  role: z.enum(['ADMIN', 'ESG_MANAGER', 'ESG_ANALYST', 'AUDITOR']).default('ESG_ANALYST'),
});

const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const oauthMockSchema = z.object({
  provider: z.enum(['google', 'apple']),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

export const authController = {
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
            message: 'An account with this email already exists.',
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
            message: 'Invalid email or password.',
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
            message: 'Invalid email or password.',
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

  oauthMock: async (req: Request, res: Response) => {
    try {
      const parsed = oauthMockSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid OAuth provider request',
          },
        });
        return;
      }

      const { provider } = parsed.data;
      const email = parsed.data.email || (provider === 'google' ? 'google.user@invty-enterprise.com' : 'apple.user@invty-enterprise.com');
      const name = parsed.data.name || (provider === 'google' ? 'Google Enterprise User' : 'Apple Enterprise User');
      const companyName = 'INVTY Global Partner Corp';

      let user = dbService.findUserByEmail(email);
      if (!user) {
        const { hash, salt } = dbService.hashPassword(crypto.randomBytes(16).toString('hex'));
        const userId = `usr-oauth-${provider}-${crypto.randomBytes(6).toString('hex')}`;
        const createdSafeUser = dbService.createUser({
          id: userId,
          email,
          password_hash: hash,
          salt,
          name,
          company_name: companyName,
          role: 'ESG_ANALYST',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        user = dbService.findUserById(createdSafeUser.id)!;
      }

      const token = dbService.createSession(user.id);
      const safeUser = dbService.toSafeUser(user);

      res.status(200).json({
        success: true,
        message: `Signed in successfully with ${provider.charAt(0).toUpperCase() + provider.slice(1)}.`,
        user: safeUser,
        token,
      });
    } catch (error: any) {
      console.error('[AUTH OAUTH ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'OAuth authentication failed.',
        },
      });
    }
  },

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

  getDemoAccounts: (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      accounts: [
        {
          email: 'admin@invty.com',
          password: 'Invty@2026',
          name: 'INVTY Enterprise Admin',
          company: 'INVTY Sustainability Systems',
          role: 'ADMIN',
        },
        {
          email: 'demo@company.com',
          password: 'Demo@1234',
          name: 'Rajesh Sharma',
          company: 'Tata Heavy Engineering Ltd',
          role: 'ESG_ANALYST',
        },
      ],
    });
  },
};
