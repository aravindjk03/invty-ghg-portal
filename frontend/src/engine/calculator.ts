import Decimal from 'decimal.js';
import { parseIndianNumber } from './unitConverter';
import { ActivityEntry, ScopeSummary, QualityGrade } from '../types/ghg';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });

export interface CalculatedRowResult {
  calculatedTco2e: number;
  decimalTco2e: Decimal;
  warning?: string;
  isNegativeAllowed?: boolean;
}

/**
 * Bug Guard #1: Emissions arithmetic using Decimal.
 * Bug Guard #4: Null if amount is empty or invalid.
 */
export function calculateRowEmissions(
  amount: number | string | null | undefined,
  factorValue: number,
  fuelOrSource = '',
  unit = ''
): CalculatedRowResult {
  const decAmount = parseIndianNumber(amount);
  if (decAmount === null || decAmount.isZero()) {
    return { calculatedTco2e: 0, decimalTco2e: new Decimal(0) };
  }

  const isCo2Capture = fuelOrSource.toLowerCase().includes('co2_captured') || fuelOrSource.toLowerCase().includes('captured');
  const decFactor = new Decimal(factorValue);

  // tCO2e = (amount * factorValue) / 1000
  let tco2e = decAmount.times(decFactor).dividedBy(new Decimal(1000));

  if (isCo2Capture && tco2e.isPositive()) {
    // CCU / CCS is a deduction
    tco2e = tco2e.negated();
  }

  let warning: string | undefined;
  const numAmount = decAmount.toNumber();

  if (fuelOrSource.toLowerCase().includes('diesel') && numAmount > 40000 && unit.toUpperCase() === 'L') {
    warning = 'This is 8× typical diesel use for a plant this size — please check the unit.';
  } else if (fuelOrSource.toLowerCase().includes('refrigerant') && numAmount > 500 && unit.toLowerCase() === 'kg') {
    warning = 'High refrigerant recharge volume detected — verify if catastrophic leak report was filed.';
  }

  return {
    calculatedTco2e: Number(tco2e.toFixed(2)),
    decimalTco2e: tco2e,
    warning,
    isNegativeAllowed: isCo2Capture,
  };
}

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
    if (entry.calculatedTco2e !== 0) {
      const tier = entry.emissionFactor?.qualityTier || 'Secondary';
      totalScore = totalScore.plus(new Decimal(scoreMap[tier] || 3));
      count++;
    }
  }

  if (count === 0) return 'C';
  const avg = totalScore.dividedBy(new Decimal(count)).toNumber();

  if (avg >= 4.5) return 'A';
  if (avg >= 3.8) return 'B';
  if (avg >= 2.8) return 'C';
  if (avg >= 2.0) return 'D';
  return 'E';
}

/**
 * Bug Guard #10: Auto-derive Category 3 (WTT and T&D) from Scope 1 & 2 without circular storage.
 */
export function deriveCategory3Emissions(
  scope1Entries: ActivityEntry[],
  scope2LocationTco2e: Decimal
): Decimal {
  // 1. WTT fuels: approx 20% of Scope 1 combustion
  let scope1Combustion = new Decimal(0);
  for (const e of scope1Entries) {
    if (e.category === 'stationary_combustion' || e.category === 'mobile_combustion') {
      scope1Combustion = scope1Combustion.plus(new Decimal(e.calculatedTco2e || 0));
    }
  }
  const wttFuels = scope1Combustion.times(new Decimal(0.18)); // ~18% WTT factor

  // 2. WTT electricity: ~12% of Scope 2
  const wttElec = scope2LocationTco2e.times(new Decimal(0.12));

  // 3. Indian T&D losses: CEA specifies ~19% average transmission loss
  const tdLosses = scope2LocationTco2e.times(new Decimal(0.19));

  return wttFuels.plus(wttElec).plus(tdLosses);
}

/**
 * Computes full inventory summary across Scope 1, Scope 2, Scope 3, and memo items.
 * Bug Guard #9: Scope 2 location and market are NEVER summed together.
 */
export function summarizeInventory(
  scope1Entries: ActivityEntry[],
  scope2Entries: ActivityEntry[],
  scope3Entries: ActivityEntry[],
  scope2ReportingPreference: 'location' | 'market' = 'location'
): ScopeSummary {
  let s1Total = new Decimal(0);
  let s2LocTotal = new Decimal(0);
  let s2MktTotal = new Decimal(0);
  let s3Total = new Decimal(0);
  let biogenicTotal = new Decimal(0);

  // 1. Scope 1
  for (const row of scope1Entries) {
    if (row.scope === 'biogenic') {
      biogenicTotal = biogenicTotal.plus(new Decimal(row.calculatedTco2e || 0));
    } else {
      s1Total = s1Total.plus(new Decimal(row.calculatedTco2e || 0));
    }
  }

  // 2. Scope 2: Distinguish location-based vs market-based
  for (const row of scope2Entries) {
    const isMarket = row.category?.toLowerCase().includes('market') || row.fuelOrSource?.toLowerCase().includes('market');
    if (isMarket) {
      s2MktTotal = s2MktTotal.plus(new Decimal(row.calculatedTco2e || 0));
    } else {
      s2LocTotal = s2LocTotal.plus(new Decimal(row.calculatedTco2e || 0));
    }
  }

  // If no market entries, default market to location or renewable-adjusted
  if (s2MktTotal.isZero() && !s2LocTotal.isZero()) {
    s2MktTotal = s2LocTotal;
  }

  // 3. Scope 3 manual entries + auto-derived Category 3
  for (const row of scope3Entries) {
    s3Total = s3Total.plus(new Decimal(row.calculatedTco2e || 0));
  }
  // Add auto-derived Cat 3
  const derivedCat3 = deriveCategory3Emissions(scope1Entries, s2LocTotal);
  s3Total = s3Total.plus(derivedCat3);

  // Bug Guard #9: Grand Total includes EXACTLY ONE Scope 2 view (default: location)
  const s2Headline = scope2ReportingPreference === 'market' ? s2MktTotal : s2LocTotal;
  const grandTotal = s1Total.plus(s2Headline).plus(s3Total);

  const allEntries = [...scope1Entries, ...scope2Entries, ...scope3Entries];
  const grade = calculateDataQualityGrade(allEntries);

  // Count active Scope 3 categories
  const s3CatSet = new Set(scope3Entries.map((e) => e.category));
  s3CatSet.add('cat3'); // auto-derived

  return {
    scope1: Number(s1Total.toFixed(2)),
    scope2Location: Number(s2LocTotal.toFixed(2)),
    scope2Market: Number(s2MktTotal.toFixed(2)),
    scope3: Number(s3Total.toFixed(2)),
    biogenicMemo: Number(biogenicTotal.toFixed(2)),
    totalEmissions: Number(grandTotal.toFixed(2)),
    dataQualityGrade: grade,
    coverage: {
      scopesCompleted: (s1Total.gt(0) ? 1 : 0) + (s2LocTotal.gt(0) ? 1 : 0) + (s3Total.gt(0) ? 1 : 0),
      totalScopes: 3,
      scope3CategoriesIncluded: s3CatSet.size,
      totalScope3Categories: 15,
    },
  };
}
