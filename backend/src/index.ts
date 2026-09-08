import express from 'express';
import morgan from 'morgan';
import { env } from './config/env';
import { helmetMiddleware, corsMiddleware, requestSanitizer } from './middleware/security';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import apiRoutes from './routes';

const app = express();

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

// Start server
const server = app.listen(env.PORT, () => {
  console.log(`=========================================`);
  console.log(`[INVTY Enterprise GHG Engine] Server Started`);
  console.log(`   Port:        ${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   CORS:        ${env.CORS_ORIGIN}`);
  console.log(`=========================================`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[INVTY Enterprise GHG Engine] Gracefully shutting down server...');
  server.close(() => {
    console.log('[INVTY Enterprise GHG Engine] HTTP server closed. Process exiting.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
