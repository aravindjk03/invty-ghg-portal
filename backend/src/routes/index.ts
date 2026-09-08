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
import { requireAuth } from '../middleware/requireAuth';

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

// Authentication — public by design (this is where you sign in).
router.use('/v1/auth', authRoutes);

// The factor register is reference data and stays readable without a session,
// so the client can render the catalogue on the sign-in screen.
router.use('/v1/factors', factorsRoutes);

// Lead capture is a public marketing endpoint.
router.use('/v1/leads', leadsRoutes);

// Everything below carries or produces inventory data and requires a session.
router.use('/v1/emissions', requireAuth, emissionsRoutes);
router.use('/v1/reports', requireAuth, reportsRoutes);
router.use('/v1/audit', requireAuth, auditRoutes);

// Parked modules: still mounted and protected, but not exposed in the UI.
router.use('/v1/cbam', requireAuth, cbamRoutes);
router.use('/v1/brsr', requireAuth, brsrRoutes);
router.use('/v1/suppliers', requireAuth, suppliersRoutes);
router.use('/v1/cems', requireAuth, cemsRoutes);

export default router;
