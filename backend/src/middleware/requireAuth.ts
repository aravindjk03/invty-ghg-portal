import { NextFunction, Request, Response } from 'express';
import { dbService, SafeUser } from '../db/database';
import { recordEvent } from '../services/ops.service';

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
    recordEvent({ type: 'access.invalid_token', req, detail: { path: req.originalUrl.slice(0, 200) } });
    res.status(401).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Your session has expired. Please sign in again.' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (session.user.status === 'suspended') {
    dbService.deleteSession(token);
    recordEvent({ type: 'access.suspended', userId: session.user.id, req,
      detail: { path: req.originalUrl.slice(0, 200) } });
    res.status(403).json({
      success: false,
      error: { code: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended. Contact your administrator.' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  req.user = session.user;
  next();
}

/**
 * Rejects the request unless the signed-in user holds one of these roles.
 *
 * `role` has been on the user record from the start and nothing ever checked
 * it, so every signed-in account could reach every endpoint. Chain this after
 * requireAuth on anything that exposes data belonging to the business rather
 * than to the person making the request.
 */
export function requireRole(...roles: Array<SafeUser['role']>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      recordEvent({ type: 'access.forbidden', userId: req.user?.id ?? null, req,
        detail: { path: req.originalUrl.slice(0, 200), role: req.user?.role ?? null } });
      // Deliberately the same shape whether the account is absent or merely
      // unprivileged: a different answer tells a prober which it was.
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'This account cannot access that resource.' },
        timestamp: new Date().toISOString(),
      });
      return;
    }
    next();
  };
}
