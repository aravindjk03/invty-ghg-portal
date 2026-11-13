import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { auditService } from '../services/audit.service';
import { bumpUsage } from '../services/ops.service';

const router = Router();

const recordBlockSchema = z.object({
  action: z.enum(['CREATE_ENTRY', 'UPDATE_ENTRY', 'DELETE_ENTRY', 'FACTOR_OVERRIDE', 'SUPPLIER_OVERRIDE']),
  entityId: z.string().min(1).max(200),
  payloadSummary: z.string().min(3).max(500),
  // No `actor`. It used to be accepted from the body, so any signed-in user
  // could record a change as "External Auditor". It is the session's account.
});

// GET /api/v1/audit/ledger - Get full SHA-256 block ledger
router.get('/ledger', (req: Request, res: Response) => {
  const blocks = auditService.getLedger(req.user!.id);
  res.status(200).json({
    success: true,
    count: blocks.length,
    data: blocks,
  });
});

// GET /api/v1/audit/verify - Auditor one-click cryptographic chain integrity verification
router.get('/verify', (req: Request, res: Response) => {
  const report = auditService.verifyChainIntegrity(req.user!.id);
  res.status(200).json({
    success: true,
    data: report,
  });
});

// POST /api/v1/audit/record - Append a new signed block to ledger
router.post('/record', (req: Request, res: Response) => {
  const result = recordBlockSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid block payload', details: result.error.format() },
    });
    return;
  }

  const block = auditService.recordBlock(
    req.user!.id,
    req.user!.email,
    result.data.action,
    result.data.entityId,
    result.data.payloadSummary,
  );

  bumpUsage(req.user!.id, 'audit_entry');
  res.status(201).json({
    success: true,
    data: block,
  });
});

export default router;
