import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { auditService } from '../services/audit.service';

const router = Router();

const recordBlockSchema = z.object({
  action: z.enum(['CREATE_ENTRY', 'UPDATE_ENTRY', 'DELETE_ENTRY', 'FACTOR_OVERRIDE', 'SUPPLIER_OVERRIDE']),
  entityId: z.string().min(1),
  payloadSummary: z.string().min(3),
  actor: z.string().optional(),
});

// GET /api/v1/audit/ledger - Get full SHA-256 block ledger
router.get('/ledger', (_req: Request, res: Response) => {
  const blocks = auditService.getLedger();
  res.status(200).json({
    success: true,
    count: blocks.length,
    data: blocks,
  });
});

// GET /api/v1/audit/verify - Auditor one-click cryptographic chain integrity verification
router.get('/verify', (_req: Request, res: Response) => {
  const report = auditService.verifyChainIntegrity();
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
    result.data.action,
    result.data.entityId,
    result.data.payloadSummary,
    result.data.actor
  );

  res.status(201).json({
    success: true,
    data: block,
  });
});

export default router;
