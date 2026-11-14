import { Router } from 'express';
import { ReportsController, reportGenSchema } from '../controllers/reports.controller';
import { validateRequest } from '../middleware/validate';
import { bumpUsage } from '../services/ops.service';

const router = Router();

router.post(
  '/generate',
  validateRequest(reportGenSchema),
  (req, _res, next) => { bumpUsage(req.user?.id, 'report_export'); next(); },
  ReportsController.generateReportMetadata
);

export default router;
