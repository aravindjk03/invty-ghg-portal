/**
 * What is left of the browser's calculator.
 *
 * Emissions are calculated by ghg_core through the service: row values, scope
 * totals and the Scope 2 split all come from there, so nothing in the browser
 * can disagree with the report. What remains here are two presentation helpers
 * that describe the inventory rather than compute it.
 */
import Decimal from 'decimal.js';
import { parseIndianNumber } from './unitConverter';
import { ActivityEntry, QualityGrade } from '../types/ghg';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

/**
 * Bug Guard #8: Intensity guard prevents division by zero
 */
export function calculateIntensity(
  totalEmissions: Decimal | number,
  denominator: Decimal | number | null | undefined
): { value: number | null; formatted: string } {
  const decTotal = typeof totalEmissions === 'number' ? new Decimal(totalEmissions) : totalEmissions;
  const decDenom = parseIndianNumber(denominator);

  if (decDenom === null || decDenom.isZero()) {
    return { value: null, formatted: '—' };
  }

  const result = decTotal.dividedBy(decDenom);
  return {
    value: Number(result.toFixed(2)),
    formatted: result.toFixed(2),
  };
}

/**
 * Evaluates Data Quality Grade based on tiers
 */
export function calculateDataQualityGrade(entries: ActivityEntry[]): QualityGrade {
  if (!entries.length) return 'C';

  const scoreMap: Record<string, number> = {
    Primary: 5,
    Secondary: 4,
    Proxy: 3,
    Estimated: 2,
  };

  let totalScore = new Decimal(0);
  let count = 0;

  for (const entry of entries) {
    // Rows that compute to zero still count. A source whose factor has not been
    // ingested contributes nothing to the total but everything to the question
    // of how good this inventory is, so it is scored as Estimated.
    const hasFactor = (entry.customFactorOverride ?? entry.emissionFactor?.factorValue ?? 0) > 0;
    const tier = hasFactor ? (entry.emissionFactor?.qualityTier || 'Secondary') : 'Estimated';
    totalScore = totalScore.plus(new Decimal(scoreMap[tier] || 3));
    count++;
  }

  if (count === 0) return 'C';
  const avg = totalScore.dividedBy(new Decimal(count)).toNumber();

  if (avg >= 4.5) return 'A';
  if (avg >= 3.8) return 'B';
  if (avg >= 2.8) return 'C';
  if (avg >= 2.0) return 'D';
  return 'E';
}

