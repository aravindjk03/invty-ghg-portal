import { NextFunction, Request, Response } from 'express';
import { tokensService } from '../services/tokens.service';
import { StoredUser, usersService } from '../services/users.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: StoredUser;
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
 * Rejects the request unless it carries a valid, unexpired access token whose
 * subject still resolves to a real account. Deleting a user therefore revokes
 * their outstanding tokens immediately.
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

  const claims = tokensService.verifyAccessToken(token);
  if (!claims) {
    res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALID', message: 'Your session has expired. Please sign in again.' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const user = usersService.findById(claims.sub);
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'ACCOUNT_NOT_FOUND', message: 'This account no longer exists.' },
      timestamp: new Date().toISOString(),
    });
    return;
  }

  req.user = user;
  next();
}

/** Attaches the user when a valid token is present, but never rejects. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (token) {
    const claims = tokensService.verifyAccessToken(token);
    if (claims) req.user = usersService.findById(claims.sub);
  }
  next();
}
