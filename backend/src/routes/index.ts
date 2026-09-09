import { Router, Request, Response } from 'express';
import factorsRoutes from './factors.routes';
import emissionsRoutes from './emissions.routes';
import reportsRoutes from './reports.routes';
import leadsRoutes from './leads.routes';
import cbamRoutes from './cbam.routes';
import brsrRoutes from './brsr.routes';
import suppliersRoutes from './suppliers.routes';
import cemsRoutes from './cems.routes';
import auditRoutes from './audit.routes';
import authRoutes from './auth.routes';

const router = Router();

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'invty-ghg-backend-api',
  });
});

// API versioning v1
router.use('/v1/auth', authRoutes);
router.use('/v1/factors', factorsRoutes);
router.use('/v1/emissions', emissionsRoutes);
router.use('/v1/reports', reportsRoutes);
router.use('/v1/leads', leadsRoutes);
router.use('/v1/cbam', cbamRoutes);
router.use('/v1/brsr', brsrRoutes);
router.use('/v1/suppliers', suppliersRoutes);
router.use('/v1/cems', cemsRoutes);
router.use('/v1/audit', auditRoutes);

export default router;
