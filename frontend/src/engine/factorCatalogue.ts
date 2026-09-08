import { EmissionFactor, ScopeType } from '../types/ghg';
import { CATALOGUE_SOURCES } from '../data/catalogueData';

// Map catalogue entries to EmissionFactor objects
export const DEFAULT_FACTORS: EmissionFactor[] = CATALOGUE_SOURCES.map((source) => ({
  id: source.activity_key,
  fuelOrActivity: source.display_name,
  scope: (source.scope === '1'
    ? 'scope-1'
    : source.scope === '2'
    ? 'scope-2'
    : source.scope === '3'
    ? 'scope-3'
    : 'memo') as EmissionFactor['scope'],
  category: source.category_name,
  ghgCategory: source.ghg_category,
  allowedUnits: source.allowed_units,
  factorValue: source.factorValue,
  unit: source.default_unit,
  source: source.factor_source,
  publicationYear: source.publicationYear,
  qualityTier: source.qualityTier,
  notes: source.notes,
}));


/**
 * The app addresses categories by its own snake_case keys ('mobile_combustion',
 * 'cat6_business_travel'), while the emission-factor catalogue is keyed by the
 * GHG Protocol category number ('1.2', '3.6'). This table is the bridge; without
 * it the two vocabularies never match and every picker silently falls back to
 * "everything in this scope".
 */
export const CATEGORY_TO_GHG_CODE: Record<string, string> = {
  // Scope 1
  stationary_combustion: '1.1',
  mobile_combustion: '1.2',
  process_emissions: '1.3',
  fugitive_emissions: '1.4',
  agricultural_emissions: '1.5',

  // Scope 2
  purchased_electricity: '2.1',
  market_instruments: '2.1',
  purchased_steam_heat_cooling: '2.2',

  // Scope 3 — the fifteen GHG Protocol value-chain categories
  cat1_purchased_goods: '3.1',
  cat2_capital_goods: '3.2',
  cat3_fuel_energy: '3.3',
  cat4_upstream_transport: '3.4',
  cat5_waste_operations: '3.5',
  cat6_business_travel: '3.6',
  cat7_employee_commuting: '3.7',
  cat8_upstream_leased: '3.8',
  cat9_downstream_transport: '3.9',
  cat10_processing_sold: '3.10',
  cat11_use_sold_products: '3.11',
  cat12_end_of_life: '3.12',
  cat13_downstream_leased: '3.13',
  cat14_franchises: '3.14',
  cat15_investments: '3.15',

  // Out-of-scope memo items
  memo_energy_balance: 'memo',
  memo_biogenic: 'memo',
  memo_montreal: 'memo',
};

/**
 * Contractual instruments that make a Scope 2 market-based figure meaningful.
 * A row using any of these is evidence of a real market-based position rather
 * than a location-based proxy.
 */
export const MARKET_INSTRUMENT_FACTOR_IDS = new Set([
  'elec.ppa_renewable',
  'elec.green_tariff',
  'elec.irec',
  'elec.supplier_specific',
  'elec.grid.market_residual',
]);

export function isMarketInstrument(factorId: string): boolean {
  return MARKET_INSTRUMENT_FACTOR_IDS.has(factorId);
}

/**
 * Out-of-scope memo factors. These are reported alongside the inventory and are
 * never added into a scope total: biogenic CO2 is accounted separately under the
 * GHG Protocol, and Montreal Protocol gases sit outside the Kyoto basket.
 */
export function isMemoFactor(factor: Pick<EmissionFactor, 'scope' | 'category'>): boolean {
  return factor.scope === 'memo' || factor.scope === 'biogenic';
}

export function isBiogenicFactor(factor: Pick<EmissionFactor, 'category'>): boolean {
  return /biogenic/i.test(factor.category || '');
}

/**
 * Some app categories are narrower than the GHG category they sit in, so the
 * code alone would offer sources that do not belong there — the clearest case
 * being Scope 2 market instruments, where every location-based grid factor
 * shares category 2.1 and would otherwise be filed as a contractual instrument.
 */
const CATEGORY_REFINEMENTS: Record<string, (f: EmissionFactor) => boolean> = {
  market_instruments: (f) => isMarketInstrument(f.id),
  purchased_electricity: (f) => !isMarketInstrument(f.id),
  memo_biogenic: (f) => /biogenic/i.test(f.category),
  memo_montreal: (f) => /montreal/i.test(f.category),
  memo_energy_balance: (f) => /energy balance/i.test(f.category),
};

const byRelevance = (a: EmissionFactor, b: EmissionFactor) => {
  // Surface higher-confidence factors first; the picker is long enough already.
  const tierRank = { Primary: 0, Secondary: 1, Proxy: 2, Estimated: 3 } as const;
  const rank = tierRank[a.qualityTier] - tierRank[b.qualityTier];
  return rank !== 0 ? rank : a.fuelOrActivity.localeCompare(b.fuelOrActivity);
};

/**
 * Emission factors valid for one accounting category.
 *
 * Falls back progressively rather than returning an empty picker: an exact GHG
 * category match, then anything in the same scope, then the whole catalogue.
 */
export function getFactorsForCategory(
  category: string | undefined,
  scope: ScopeType | undefined,
  catalogue: EmissionFactor[] = DEFAULT_FACTORS
): EmissionFactor[] {
  const code = category ? CATEGORY_TO_GHG_CODE[category] : undefined;

  if (code) {
    const refine = category ? CATEGORY_REFINEMENTS[category] : undefined;
    const exact = catalogue.filter(
      (f) => f.ghgCategory === code && (!refine || refine(f))
    );
    if (exact.length > 0) return exact.sort(byRelevance);
  }

  if (scope) {
    const inScope = catalogue.filter((f) => f.scope === scope);
    if (inScope.length > 0) return inScope.sort(byRelevance);
  }

  return [...catalogue].sort(byRelevance);
}

/** The factor a freshly added row in this category should start on. */
export function getDefaultFactorForCategory(
  category: string | undefined,
  scope: ScopeType | undefined,
  catalogue: EmissionFactor[] = DEFAULT_FACTORS
): EmissionFactor {
  return getFactorsForCategory(category, scope, catalogue)[0] ?? catalogue[0];
}

/** True when the factor is a legitimate choice for the category. */
export function isFactorValidForCategory(
  factor: EmissionFactor,
  category: string | undefined
): boolean {
  const code = category ? CATEGORY_TO_GHG_CODE[category] : undefined;
  if (!code) return true;
  const refine = category ? CATEGORY_REFINEMENTS[category] : undefined;
  return factor.ghgCategory === code && (!refine || refine(factor));
}
