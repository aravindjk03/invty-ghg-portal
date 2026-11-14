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
import entitlementsRoutes from './entitlements.routes';
import opsRoutes from './ops.routes';
import { requireAuth } from '../middleware/requireAuth';
import { opsGate } from '../middleware/opsGate';
import { bumpUsage, UsageMetric } from '../services/ops.service';

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
router.use('/v1/entitlements', entitlementsRoutes);

// The factor register is reference data and stays readable without a session,
// so the client can render the catalogue on the sign-in screen.
router.use('/v1/factors', factorsRoutes);

// Lead capture is a public marketing endpoint.
router.use('/v1/leads', leadsRoutes);

// Everything below carries or produces inventory data and requires a session.
router.use('/v1/emissions', requireAuth, emissionsRoutes);
router.use('/v1/reports', requireAuth, reportsRoutes);
router.use('/v1/audit', requireAuth, auditRoutes);

// The operations console, for the internal developer and cyber team. Every
// route inside names the staff roles allowed; nothing here is for customers.
// opsGate first: from the wrong site or network the console API looks like any
// unknown route, before the token is even read.
router.use('/v1/ops', opsGate, requireAuth, opsRoutes);

/**
 * How often a signed-in account used a feature that runs in the browser
 * (calculations happen there, not on this server). Only a metric name from
 * this list and a small count are accepted - never content or figures.
 */
const REPORTABLE: UsageMetric[] = ['calculation', 'method_calculation', 'rows_saved', 'report_export'];
router.post('/v1/usage', requireAuth, (req: Request, res: Response) => {
  const metric = String(req.body?.metric ?? '') as UsageMetric;
  const count = Math.min(Math.max(Math.floor(Number(req.body?.count ?? 1)) || 1, 1), 50);
  if (!REPORTABLE.includes(metric)) {
    res.status(400).json({ success: false, error: { code: 'UNKNOWN_METRIC', message: 'Unknown usage metric.' } });
    return;
  }
  bumpUsage(req.user!.id, metric, count);
  res.status(204).end();
});

// Parked modules. The UI does not route to any of them, so by default the API
// does not serve them either: an endpoint nobody can reach from the product is
// attack surface with no user. They also keep their state in process memory
// and CEMS starts with simulated readings, neither of which belongs in front
// of a customer. Set ENABLE_PARKED_MODULES=true to work on them.
if (process.env.ENABLE_PARKED_MODULES === 'true') {
  router.use('/v1/cbam', requireAuth, cbamRoutes);
  router.use('/v1/brsr', requireAuth, brsrRoutes);
  router.use('/v1/suppliers', requireAuth, suppliersRoutes);
  router.use('/v1/cems', requireAuth, cemsRoutes);
}

export default router;
