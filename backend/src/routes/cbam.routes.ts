import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { cbamService } from '../services/cbam.service';

const router = Router();

const cbamSchema = z.object({
  sector: z.enum(['steel', 'aluminium', 'cement', 'fertilisers']),
  cnCode: z.string().min(4),
  goodsDescription: z.string().default('Manufactured goods category'),
  productionVolumeTonnes: z.number().positive('Production volume must be greater than 0'),
  scope1AttributedTco2e: z.number().min(0),
  scope2AttributedTco2e: z.number().min(0),
  carbonPricePaidEurPerTonne: z.number().min(0).optional(),
  reportingQuarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  reportingYear: z.number().int().min(2023).max(2035),
  installationName: z.string().optional(),
  countryCode: z.string().optional(),
  unLocode: z.string().optional(),
});

// POST /api/v1/cbam/calculate
router.post('/calculate', (req: Request, res: Response) => {
  const result = cbamSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid CBAM calculation parameters.',
        details: result.error.format(),
      },
    });
    return;
  }

  const calculation = cbamService.calculateEmbeddedEmissions(result.data);
  res.status(200).json({
    success: true,
    data: calculation,
  });
});

export default router;
