import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { CalculationService } from '../services/calculation.service';
import { FactorsService } from '../services/factors.service';
import { ScenarioService } from '../services/scenario.service';

export const calculateRowSchema = z.object({
  fuelOrSource: z.string().min(1),
  factorId: z.string().min(1),
  amount: z.number().nonnegative(),
  unit: z.string().min(1),
  facility: z.string().optional().default('Main Plant - Jamshedpur'),
});

export const scenarioSchema = z.object({
  baselineScope1: z.number().nonnegative(),
  baselineScope2: z.number().nonnegative(),
  baselineScope3: z.number().nonnegative(),
  renewableElectricityPercent: z.number().min(0).max(100),
  dieselReductionPercent: z.number().min(0).max(50),
  switchFleetToElectric: z.boolean(),
});

export class EmissionsController {
  /**
   * Retired. Emissions are calculated by ghg_core, which resolves the factor per
   * gas, converts the quantity into the unit the factor is published per, and
   * applies the reporting GWP set. This endpoint did none of that, so keeping it
   * alive would mean two answers for one row.
   */
  public static calculateRow(_req: Request, res: Response): void {
    res.status(410).json({
      success: false,
      error: {
        code: 'ENDPOINT_RETIRED',
        message:
          'Row emissions are calculated by the engine. POST the record to '
          + '/v1/inventory/calculate on the calculation service instead.',
      },
      timestamp: new Date().toISOString(),
    });
  }


  public static simulateScenario(req: Request, res: Response, next: NextFunction): void {
    try {
      const {
        baselineScope1,
        baselineScope2,
        baselineScope3,
        renewableElectricityPercent,
        dieselReductionPercent,
        switchFleetToElectric,
      } = req.body;

      const result = ScenarioService.simulateScenario(
        baselineScope1,
        baselineScope2,
        baselineScope3,
        {
          renewableElectricityPercent,
          dieselReductionPercent,
          switchFleetToElectric,
        }
      );

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
}
