import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { brsrService } from '../services/brsr.service';

const router = Router();

const brsrSchema = z.object({
  financialYear: z.string().default('FY 2024-25'),
  turnoverInCroresINR: z.number().positive('Turnover must be greater than 0'),
  physicalOutputTonnes: z.number().positive('Physical output must be greater than 0'),
  outputMetricName: z.string().default('Tonnes of finished product'),
  scope1TotalTco2e: z.number().min(0),
  scope2LocationTco2e: z.number().min(0),
  scope2MarketTco2e: z.number().min(0),
  scope3TotalTco2e: z.number().min(0),
  companyName: z.string().optional(),
  cinNumber: z.string().optional(),
  assuranceType: z.enum(['Reasonable Assurance', 'Limited Assurance', 'Internal Audit Only']),
  assuranceAgency: z.string().optional(),
});

// POST /api/v1/brsr/calculate
router.post('/calculate', (req: Request, res: Response) => {
  const result = brsrSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid SEBI BRSR Core calculation parameters.',
        details: result.error.format(),
      },
    });
    return;
  }

  const report = brsrService.calculateBRSRCore(result.data);
  res.status(200).json({
    success: true,
    data: report,
  });
});

export default router;
