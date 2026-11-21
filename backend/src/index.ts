import './middleware/asyncErrors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env';
import { helmetMiddleware, corsMiddleware, requestSanitizer } from './middleware/security';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { startRetentionSweep } from './services/ops.service';
import apiRoutes from './routes';
import { dbService } from './db/database';

const app = express();

// Behind a reverse proxy (Render, nginx, Cloudflare) the client address arrives
// in X-Forwarded-For. Without this every visitor shares one rate-limit bucket,
// so one busy user locks out everybody else. One hop: the platform's proxy.
app.set('trust proxy', 1);

// Security and utility middleware pipeline
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(globalRateLimiter);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestSanitizer);

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// API Routes
app.use('/api', apiRoutes);

// 404 Handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested API endpoint does not exist.',
    },
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler
app.use(errorHandler);

// Start server: open the database first, so no request meets a half-made schema.
let server: ReturnType<typeof app.listen> | null = null;

dbService.init().then(() => {
  startRetentionSweep();
  server = app.listen(env.PORT, () => {
    console.log(`=========================================`);
    console.log(`[IINVTY Enterprise GHG Engine] Server Started`);
    console.log(`   Port:        ${env.PORT}`);
    console.log(`   Environment: ${env.NODE_ENV}`);
    console.log(`   Database:    ${dbService.kind}`);
    console.log(`   CORS:        ${env.CORS_ORIGIN}`);
    console.log(`=========================================`);
  });
}).catch((err) => {
  console.error('[IINVTY Enterprise GHG Engine] Could not open the database:', (err as Error).message);
  process.exit(1);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[IINVTY Enterprise GHG Engine] Gracefully shutting down server...');
  const done = () => dbService.close().finally(() => {
    console.log('[IINVTY Enterprise GHG Engine] HTTP server closed. Process exiting.');
    process.exit(0);
  });
  if (server) server.close(() => { void done(); });
  else void done();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
