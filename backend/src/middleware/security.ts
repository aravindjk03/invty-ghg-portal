import helmet from 'helmet';
import cors from 'cors';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", ...env.CORS_ORIGIN.split(',')],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests or dev origin
    if (!origin) return callback(null, true);
    const allowed = env.CORS_ORIGIN.split(',').map((o) => o.trim());
    if (allowed.includes(origin)) return callback(null, true);
    // Outside production any LOCAL origin is accepted, for the dev servers.
    // It used to accept every origin on earth whenever NODE_ENV was
    // "development" — which is also the default when the variable is simply
    // forgotten, so one missing setting made a deployment readable from any
    // website.
    if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // No CORS headers for anyone else: the browser then refuses to let that
    // page read the reply. Raising an error here turned every such request
    // into a 500 in the logs.
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  credentials: true,
});

export const requestSanitizer = (req: Request, _res: Response, next: NextFunction) => {
  // Prevent prototype pollution. This only looked at the top level, so
  // {"a":{"__proto__":{...}}} went straight through.
  const strip = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || depth > 20) return;
    for (const key of Object.keys(value as object)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        delete (value as Record<string, unknown>)[key];
      } else {
        strip((value as Record<string, unknown>)[key], depth + 1);
      }
    }
  };
  strip(req.body);
  next();
};
