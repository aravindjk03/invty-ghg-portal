import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { cemsService } from '../services/cems.service';

const router = Router();

const cemsIngestSchema = z.object({
  stackId: z.string().min(1),
  stackName: z.string().min(1),
  flueGasVelocityMs: z.number().nonnegative(),
  volumetricFlowNm3h: z.number().nonnegative(),
  temperatureCelsius: z.number(),
  o2Percentage: z.number().min(0).max(100),
  co2Percentage: z.number().min(0).max(100),
  coMgNm3: z.number().nonnegative(),
  so2MgNm3: z.number().nonnegative(),
  noxMgNm3: z.number().nonnegative(),
  pmMgNm3: z.number().nonnegative(),
  timestamp: z.string().optional(),
});

// POST /api/v1/cems/telemetry - Ingest IoT reading from stack analyzer
router.post('/telemetry', (req: Request, res: Response) => {
  const result = cemsIngestSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid CEMS sensor payload', details: result.error.format() },
    });
    return;
  }

  const record = cemsService.ingestTelemetry(result.data);
  res.status(201).json({
    success: true,
    data: record,
  });
});

// GET /api/v1/cems/telemetry - Query telemetry stream
router.get('/telemetry', (req: Request, res: Response) => {
  const stackId = req.query.stackId as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const readings = cemsService.getRecentTelemetry(stackId, limit);

  res.status(200).json({
    success: true,
    count: readings.length,
    data: readings,
  });
});

// GET /api/v1/cems/summary - Stacks operating overview & mass balance reconciliation
router.get('/summary', (req: Request, res: Response) => {
  const fuelBurn = req.query.fuelBurn ? parseFloat(req.query.fuelBurn as string) : 165.47;
  const summaries = cemsService.getStackSummaries(fuelBurn);

  res.status(200).json({
    success: true,
    data: summaries,
  });
});

export default router;
