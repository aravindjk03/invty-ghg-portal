import { Request, Response, NextFunction } from 'express';
import { FactorsService } from '../services/factors.service';

export class FactorsController {
  public static getAll(req: Request, res: Response, next: NextFunction): void {
    try {
      const { scope, ghgCategory } = req.query;
      const factors = FactorsService.query({
        scope: scope ? String(scope) : undefined,
        ghgCategory: ghgCategory ? String(ghgCategory) : undefined,
      });

      res.status(200).json({
        success: true,
        data: factors,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }

  public static getById(req: Request, res: Response, next: NextFunction): void {
    try {
      const { id } = req.params;
      const factor = FactorsService.getFactorById(id);

      if (!factor) {
        res.status(404).json({
          success: false,
          error: {
            code: 'FACTOR_NOT_FOUND',
            message: `Emission factor '${id}' was not found.`,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: factor,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
}
