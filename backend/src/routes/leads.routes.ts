import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { leadsService } from '../services/leads.service';

const router = Router();

const createLeadSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  workEmail: z.string().email('Valid business email is required'),
  companyName: z.string().min(2, 'Company name is required'),
  sector: z.string().min(2, 'Industry sector is required'),
  phone: z.string().optional(),
  primaryNeed: z.string().default('general'),
  referralSource: z.string().default('portfolio'),
  annualTurnoverOrProduction: z.string().optional(),
  inventoryStats: z
    .object({
      totalTco2e: z.number(),
      scope1: z.number(),
      scope2: z.number(),
      scope3: z.number(),
      qualityGrade: z.string(),
    })
    .optional(),
});

// POST /api/v1/leads - Ingest customer lead from Enterprise Lead Gate
router.post('/', (req: Request, res: Response) => {
  const parseResult = createLeadSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid lead form data provided.',
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const clientIp = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress || 'direct';
  const lead = leadsService.createLead(parseResult.data, clientIp);

  res.status(201).json({
    success: true,
    leadId: lead.id,
    message: 'Enterprise profile registered successfully. Verification report unblocked.',
  });
});

// GET /api/v1/leads - View captured leads (Admin / CRM integration)
router.get('/', (_req: Request, res: Response) => {
  const leads = leadsService.getAllLeads();
  const stats = leadsService.getLeadStats();

  res.status(200).json({
    success: true,
    stats,
    leads,
  });
});

export default router;
