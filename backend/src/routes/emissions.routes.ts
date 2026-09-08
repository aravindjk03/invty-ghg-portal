import { Router } from 'express';
import { EmissionsController, calculateRowSchema, scenarioSchema } from '../controllers/emissions.controller';
import { validateRequest } from '../middleware/validate';
import { strictRateLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post(
  '/calculate-row',
  validateRequest(calculateRowSchema),
  EmissionsController.calculateRow
);

router.post(
  '/scenario',
  strictRateLimiter,
  validateRequest(scenarioSchema),
  EmissionsController.simulateScenario
);

export default router;
