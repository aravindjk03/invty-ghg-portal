/**
 * What an account is entitled to, and spending it.
 *
 * The count lives in this database because this process owns the account. The
 * AI service never keeps its own copy: a quota held in two places is a quota
 * that disagrees with itself, and the one the customer would find is whichever
 * is larger.
 *
 * Two kinds of caller, and they get different doors:
 *
 *   The browser may only READ (`GET /`), with the user's own bearer token, so
 *   the page can show "1 of 2 estimates left" and the upgrade wall.
 *
 *   The AI service may SPEND (`POST /reserve`, `POST /refund`), with a shared
 *   secret the browser never sees. If the browser could spend, it could also
 *   decline to, and the paywall would be advisory.
 */
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { dbService } from '../db/database';

const router = Router();

/** The user behind a bearer token, or null. */
function userFromToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const session = dbService.getSession(header.substring(7));
  return session ? session.user.id : null;
}

/**
 * Only the AI service may spend a credit.
 *
 * Compared in constant time, because a timing-leaky comparison on a shared
 * secret is a slow way to hand it over. With no secret configured the door is
 * shut rather than left open: a missing environment variable must not become
 * an unmetered endpoint.
 */
function requireServiceSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ESTIMATE_SERVICE_SECRET || '';
  const presented = String(req.headers['x-service-secret'] || '');

  const expectedBuffer = Buffer.from(expected);
  const presentedBuffer = Buffer.from(presented);
  const ok = expected.length > 0
    && expectedBuffer.length === presentedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, presentedBuffer);

  if (!ok) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'This endpoint is for the estimate service only.',
      },
    });
    return;
  }
  next();
}

/** What this account may do. Read-only, for the page. */
router.get('/', (req: Request, res: Response) => {
  const userId = userFromToken(req);
  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Sign in to see your plan.' },
    });
    return;
  }
  res.status(200).json({
    success: true,
    entitlement: dbService.getEntitlement(userId),
    recentEstimates: dbService.recentEstimates(userId, 10),
  });
});

/** Spend one estimate, or refuse with 402. Service only. */
router.post('/reserve', requireServiceSecret, (req: Request, res: Response) => {
  const { userId, product } = req.body ?? {};
  if (typeof userId !== 'string' || !userId) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'userId is required.' },
    });
    return;
  }

  const reservation = dbService.reserveEstimate(userId, String(product ?? 'unnamed'));
  if (!reservation.allowed) {
    // 402 Payment Required, because that is exactly what it is. The message is
    // the one the page shows, so it is written for the customer, not the log.
    res.status(402).json({
      success: false,
      error: {
        code: 'ESTIMATE_LIMIT_REACHED',
        message: `You have used all ${reservation.entitlement.estimatesLimit} estimates `
          + 'included with the free plan. Upgrade to Premium for unlimited estimates, '
          + 'answered by the most capable model.',
      },
      entitlement: reservation.entitlement,
    });
    return;
  }

  res.status(200).json({
    success: true,
    ledgerId: reservation.ledgerId,
    entitlement: reservation.entitlement,
  });
});

/** Give back an estimate that was reserved but never delivered. Service only. */
router.post('/refund', requireServiceSecret, (req: Request, res: Response) => {
  const { userId, ledgerId, reason } = req.body ?? {};
  if (typeof userId !== 'string' || typeof ledgerId !== 'string') {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'userId and ledgerId are required.' },
    });
    return;
  }
  res.status(200).json({
    success: true,
    entitlement: dbService.refundEstimate(userId, ledgerId, String(reason ?? 'not delivered')),
  });
});

export default router;
