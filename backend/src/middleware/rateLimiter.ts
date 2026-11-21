import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env';
import { recordEvent } from '../services/ops.service';

/** Every limiter answers as before, and the refusal is recorded for the cyber team. */
function recordedRefusal(limiter: string) {
  return (req: Request, res: Response, _next: unknown, options: { statusCode: number; message: unknown }) => {
    recordEvent({ type: 'access.rate_limited', req,
      detail: { limiter, path: req.originalUrl.slice(0, 200) } });
    res.status(options.statusCode).send(options.message);
  };
}

export const globalRateLimiter = rateLimit({
  handler: recordedRefusal('global'),
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP. Please try again after 15 minutes.',
    },
    timestamp: new Date().toISOString(),
  },
});

export const strictRateLimiter = rateLimit({
  handler: recordedRefusal('strict'),
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'STRICT_RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded on critical compute endpoint.',
    },
    timestamp: new Date().toISOString(),
  },
});

export const exportRateLimiter = rateLimit({
  handler: recordedRefusal('export'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // 20 exports per 15 min
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'EXPORT_RATE_LIMIT_EXCEEDED',
      message: 'Export rate limit exceeded. Please wait a few minutes before requesting additional document packages.',
    },
    timestamp: new Date().toISOString(),
  },
});

export const leadRateLimiter = rateLimit({
  handler: recordedRefusal('lead'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15, // 15 lead submissions per 15 min
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'LEAD_SUBMISSION_LIMIT_EXCEEDED',
      message: 'Multiple profile registrations detected from this network.',
    },
    timestamp: new Date().toISOString(),
  },
});

/**
 * Credential endpoints: sign-in, sign-up and OTP. Ten attempts per fifteen
 * minutes per address makes password and six-digit OTP guessing impractical
 * while leaving room for someone who genuinely mistypes.
 */
export const authRateLimiter = rateLimit({
  handler: recordedRefusal('auth'),
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Too many sign-in attempts. Please wait fifteen minutes and try again.',
    },
    timestamp: new Date().toISOString(),
  },
});
