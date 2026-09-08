import { EmissionFactor, ScopeType } from '../types/ghg.types';
import catalogue from '../data/emission_source_catalogue.json';

interface CatalogueSource {
  activity_key: string;
  display_name: string;
  group: string;
  scope: string;
  ghg_category: string;
  category_name: string;
  default_unit: string;
  allowed_units: string;
  gases: string;
  factor_source: string;
  notes: string;
  factorValue: number;
  qualityTier: string;
  publicationYear: number;
}

function toScope(scope: string): ScopeType {
  switch (scope) {
    case '1':
      return 'scope-1';
    case '2':
      return 'scope-2';
    case '3':
      return 'scope-3';
    default:
      return 'memo';
  }
}

/**
 * The emission-factor register.
 *
 * This is the single source of truth for factors. It was previously a
 * hand-written list of 16 entries keyed 'EF-DSL-STATIONARY', while the client
 * shipped a 266-entry catalogue keyed 'fuel.diesel.stationary' — two registers
 * that shared neither identifiers nor values. The client now treats this
 * endpoint as authoritative and keeps a bundled snapshot only for offline use.
 */
export class FactorsService {
  private static factors: EmissionFactor[] = (catalogue as CatalogueSource[]).map((source) => ({
    id: source.activity_key,
    fuelOrActivity: source.display_name,
    scope: toScope(source.scope),
    category: source.category_name,
    ghgCategory: source.ghg_category,
    factorValue: source.factorValue,
    unit: source.default_unit,
    allowedUnits: source.allowed_units,
    source: source.factor_source,
    publicationYear: source.publicationYear,
    qualityTier: source.qualityTier as EmissionFactor['qualityTier'],
    notes: source.notes || undefined,
  }));

  public static getAllFactors(): EmissionFactor[] {
    return this.factors;
  }

  public static getFactorById(id: string): EmissionFactor | undefined {
    return this.factors.find((f) => f.id === id);
  }

  public static getFactorsByScope(scope: string): EmissionFactor[] {
    return this.factors.filter((f) => f.scope === scope);
  }

  /** Factors for one GHG Protocol category, e.g. '1.2' or '3.6'. */
  public static getFactorsByGhgCategory(ghgCategory: string): EmissionFactor[] {
    return this.factors.filter((f) => f.ghgCategory === ghgCategory);
  }

  public static query(filters: { scope?: string; ghgCategory?: string }): EmissionFactor[] {
    return this.factors.filter(
      (f) =>
        (!filters.scope || f.scope === filters.scope) &&
        (!filters.ghgCategory || f.ghgCategory === filters.ghgCategory)
    );
  }
}
