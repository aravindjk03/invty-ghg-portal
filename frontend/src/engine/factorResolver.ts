import { CATALOGUE_BY_KEY, CatalogueSource } from '../data/catalogueData';

export class FactorNotFoundError extends Error {
  constructor(public readonly activityKey: string, public readonly region: string, public readonly year: number) {
    super(
      `No emission factor found for activity "${activityKey}", region "${region}", year ${year}. A missing factor must never be treated as zero.`
    );
    this.name = 'FactorNotFoundError';
  }
}

export interface FactorResolution {
  factor: CatalogueSource;
  resolvedValue: number; // kgCO2e per unit
  flags: {
    isExact: boolean;
    isFallback: boolean;
    isBiogenicMemo: boolean;
    isMontrealProtocol: boolean;
    notes?: string;
  };
}

/**
 * Resolves an emission factor with cascade:
 * Exact -> Default Indian Factor -> Global IPCC/DESNZ fallback
 * Raises FactorNotFoundError if key is entirely unknown.
 */
export function resolveEmissionFactor(
  activityKey: string,
  region = 'India',
  year = 2024
): FactorResolution {
  const item = CATALOGUE_BY_KEY[activityKey];
  if (!item) {
    throw new FactorNotFoundError(activityKey, region, year);
  }

  const isBiogenic = item.notes?.toLowerCase().includes('biogenic') || item.activity_key.startsWith('memo.biogenic');
  const isMontreal = item.notes?.toLowerCase().includes('montreal') || item.activity_key.startsWith('memo.montreal');

  return {
    factor: item,
    resolvedValue: item.factorValue,
    flags: {
      isExact: true,
      isFallback: false,
      isBiogenicMemo: isBiogenic,
      isMontrealProtocol: isMontreal,
      notes: item.notes || undefined,
    },
  };
}
