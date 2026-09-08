import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || err.status || 500;
  const isProd = env.NODE_ENV === 'production';

  console.error(`[ERROR] [${new Date().toISOString()}]`, {
    message: err.message,
    stack: isProd ? undefined : err.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: isProd && statusCode === 500 
        ? 'An unexpected server error occurred.' 
        : err.message || 'Unknown error occurred.',
      ...(isProd ? {} : { stack: err.stack }),
    },
    timestamp: new Date().toISOString(),
  });
};
