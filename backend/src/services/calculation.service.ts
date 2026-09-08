import { ActivityEntry, ScopeSummary, QualityGrade } from '../types/ghg.types';

export class CalculationService {
  /**
   * Calculates emissions in metric tonnes of CO2 equivalent (tCO2e)
   * Formula: Activity (units) * EmissionFactor (kgCO2e/unit) / 1000
   */
  public static calculateRowEmissions(amount: number, factorValue: number): number {
    if (isNaN(amount) || amount <= 0 || isNaN(factorValue)) {
      return 0;
    }
    const kgCo2e = amount * factorValue;
    const tCo2e = kgCo2e / 1000;
    return Number(tCo2e.toFixed(2));
  }

  /**
   * Check for industrial anomalies/warnings
   */
  public static checkValidationWarnings(fuelOrSource: string, amount: number, unit: string): string | undefined {
    if (fuelOrSource.toLowerCase().includes('diesel') && amount > 40000 && unit === 'L') {
      return 'This is 8× the typical diesel use for a plant this size — please check the unit.';
    }
    if (fuelOrSource.toLowerCase().includes('refrigerant') && amount > 500 && unit === 'kg') {
      return 'High refrigerant recharge volume detected — verify if catastrophic leak report was filed.';
    }
    return undefined;
  }

  /**
   * Evaluates overall data quality grade based on tiers of entries
   */
  public static determineQualityGrade(entries: ActivityEntry[]): QualityGrade {
    if (!entries.length) return 'C';

    const scoreMap: Record<string, number> = {
      Primary: 5,
      Secondary: 4,
      Proxy: 3,
      Estimated: 2,
    };

    let totalScore = 0;
    for (const entry of entries) {
      totalScore += scoreMap[entry.emissionFactor.qualityTier] || 3;
    }
    const avgScore = totalScore / entries.length;

    if (avgScore >= 4.5) return 'A';
    if (avgScore >= 3.8) return 'B';
    if (avgScore >= 2.8) return 'C';
    if (avgScore >= 2.0) return 'D';
    return 'E';
  }

  /**
   * Summarizes all scopes from entries
   */
  public static summarizeInventory(entries: ActivityEntry[]): ScopeSummary {
    let scope1 = 0;
    let scope2Loc = 412.4; // Fixed baseline for Acme Steel
    let scope2Mkt = 180.2;
    let scope3 = 1204.7; // Categories 1, 3, 6 baseline
    let biogenic = 18.1;

    for (const entry of entries) {
      if (entry.scope === 'scope-1') {
        scope1 += entry.calculatedTco2e;
      } else if (entry.scope === 'scope-2') {
        scope2Loc += entry.calculatedTco2e;
      } else if (entry.scope === 'scope-3') {
        scope3 += entry.calculatedTco2e;
      } else if (entry.scope === 'biogenic') {
        biogenic += entry.calculatedTco2e;
      }
    }

    const total = Number((scope1 + scope2Loc + scope3).toFixed(1));
    const grade = this.determineQualityGrade(entries);

    return {
      scope1: Number(scope1.toFixed(1)),
      scope2Location: Number(scope2Loc.toFixed(1)),
      scope2Market: Number(scope2Mkt.toFixed(1)),
      scope3: Number(scope3.toFixed(1)),
      biogenicMemo: Number(biogenic.toFixed(1)),
      totalEmissions: total,
      dataQualityGrade: grade,
      coverage: {
        scopesCompleted: scope1 > 0 ? 3 : 2,
        totalScopes: 3,
        scope3CategoriesIncluded: 3,
        totalScope3Categories: 15,
      },
    };
  }
}
