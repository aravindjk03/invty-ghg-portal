import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { suppliersService } from '../services/suppliers.service';

const router = Router();

const createInvitationSchema = z.object({
  supplierName: z.string().min(2),
  supplierEmail: z.string().email(),
  scope3CategoryNumber: z.number().int().min(1).max(15),
  categoryName: z.string().min(2),
  requestedItemDescription: z.string().min(2),
  purchaseOrderRef: z.string().optional(),
});

const submitDataSchema = z.object({
  supplierName: z.string().min(2),
  supplierCompanyPanOrEin: z.string().min(4),
  reportingPeriod: z.string().min(2),
  providedQuantity: z.number().positive(),
  providedUnit: z.string().min(1),
  primaryEmissionFactor: z.number().positive(),
  factorUnit: z.string().min(1),
  factorDataSource: z.string().min(3),
  evidenceFileName: z.string().optional(),
});

// POST /api/v1/suppliers/invite - Create Magic Link
router.post('/invite', (req: Request, res: Response) => {
  const result = createInvitationSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier invitation details', details: result.error.format() },
    });
    return;
  }

  const invitation = suppliersService.createInvitation(result.data);
  res.status(201).json({
    success: true,
    data: invitation,
    magicLinkUrl: `/supplier-portal?token=${invitation.token}`,
  });
});

// GET /api/v1/suppliers/invitations - List all invitations (Enterprise Admin)
router.get('/invitations', (_req: Request, res: Response) => {
  const list = suppliersService.getAllInvitations();
  res.status(200).json({
    success: true,
    data: list,
  });
});

// GET /api/v1/suppliers/verify/:token - Public lookup for supplier form
router.get('/verify/:token', (req: Request, res: Response) => {
  const invitation = suppliersService.getInvitationByToken(req.params.token);
  if (!invitation) {
    res.status(404).json({
      success: false,
      error: { code: 'TOKEN_INVALID_OR_EXPIRED', message: 'This supplier magic link is either invalid or has expired.' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: invitation,
  });
});

// POST /api/v1/suppliers/submit/:token - Vendor submits primary data
router.post('/submit/:token', (req: Request, res: Response) => {
  const result = submitDataSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid supplier submission data', details: result.error.format() },
    });
    return;
  }

  const updated = suppliersService.submitSupplierData(req.params.token, result.data);
  if (!updated) {
    res.status(404).json({
      success: false,
      error: { code: 'SUBMISSION_FAILED', message: 'Magic link token expired or not found.' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: updated,
    message: 'Primary supplier activity submitted successfully. Pending enterprise verification.',
  });
});

// POST /api/v1/suppliers/approve/:id - Admin approves primary factor override
router.post('/approve/:id', (req: Request, res: Response) => {
  const approved = suppliersService.approveSubmission(req.params.id, req.body.auditorName);
  if (!approved) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Invitation record or submission not found.' },
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: approved,
    message: 'Supplier primary emission factor approved. Scope 3 data quality upgraded to Grade A.',
  });
});

export default router;
