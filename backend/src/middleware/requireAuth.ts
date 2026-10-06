import { NextFunction, Request, Response } from 'express';
import { dbService, SafeUser } from '../db/database';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Rejects the request unless it carries a live session token issued by
 * /auth/login, /auth/signup, /auth/google or the mobile OTP flow. Sessions are
 * looked up in the database on every request, so logging out or expiry revokes
 * access immediately.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Sign in to access this resource.' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const session = dbService.getSession(token);
  if (!session) {
    res.status(401).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  req.user = session.user;
  next();
}
