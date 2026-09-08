import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CalculationService } from '../services/calculation.service';
import { ActivityEntry } from '../types/ghg.types';

export const reportGenSchema = z.object({
  companyName: z.string().min(1).default('Acme Steel Pvt Ltd'),
  reportingPeriod: z.string().min(1).default('FY 2025–26'),
  framework: z.string().default('GHG Protocol'),
  reportType: z.string().default('Screening'),
  entries: z.array(z.any()).default([]),
});

export class ReportsController {
  public static generateReportMetadata(req: Request, res: Response, next: NextFunction): void {
    try {
      const { companyName, reportingPeriod, framework, reportType, entries } = req.body;
      const summary = CalculationService.summarizeInventory(entries as ActivityEntry[]);

      const reportId = `INVTY-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

      const isScreening = String(reportType).toLowerCase().includes('screen');

      res.status(200).json({
        success: true,
        data: {
          reportId,
          companyName,
          reportingPeriod,
          framework,
          reportType: isScreening ? 'Screening' : 'Full',
          summary,
          generatedAt: new Date().toISOString(),
          watermarkRequired: isScreening,
          defaultWatermarkOpacity: isScreening ? 0.08 : 0.05,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
}
