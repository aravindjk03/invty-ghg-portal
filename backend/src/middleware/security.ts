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
    if (allowed.includes(origin) || env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    return callback(new Error('Blocked by CORS policy'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  credentials: true,
});

export const requestSanitizer = (req: Request, _res: Response, next: NextFunction) => {
  // Prevent prototype pollution
  if (req.body && typeof req.body === 'object') {
    delete (req.body as any)['__proto__'];
    delete (req.body as any)['constructor'];
    delete (req.body as any)['prototype'];
  }
  next();
};
