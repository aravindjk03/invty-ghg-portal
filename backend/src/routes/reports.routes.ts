import { Router } from 'express';
import { ReportsController, reportGenSchema } from '../controllers/reports.controller';
import { validateRequest } from '../middleware/validate';

const router = Router();

router.post(
  '/generate',
  validateRequest(reportGenSchema),
  ReportsController.generateReportMetadata
);

export default router;
