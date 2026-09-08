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
  public static calculateRow(req: Request, res: Response, next: NextFunction): void {
    try {
      const { fuelOrSource, factorId, amount, unit, facility } = req.body;
      const factor = FactorsService.getFactorById(factorId);

      if (!factor) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FACTOR_NOT_FOUND',
            message: `Emission factor '${factorId}' does not exist.`,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const calculatedTco2e = CalculationService.calculateRowEmissions(amount, factor.factorValue);
      const warning = CalculationService.checkValidationWarnings(fuelOrSource, amount, unit);

      res.status(200).json({
        success: true,
        data: {
          facility,
          fuelOrSource,
          amount,
          unit,
          emissionFactor: factor,
          calculatedTco2e,
          warning,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
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
