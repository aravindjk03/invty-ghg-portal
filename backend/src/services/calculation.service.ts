import { ActivityEntry, QualityGrade } from '../types/ghg.types';

/**
 * What the API still computes for itself.
 *
 * Emissions, scope totals and the Scope 2 split come from ghg_core through the
 * calculation service. A second implementation here would drift from it, and
 * this one had no unit conversion and no gas resolution at all.
 */
export class CalculationService {




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


}
