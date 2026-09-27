/**
 * Which emission sources may be selected where.
 *
 * A Scope 1 stationary combustion row may only offer fuels burned in fixed
 * equipment. It must not offer refrigerants, grid electricity or business
 * travel. Offering the whole library on every row is how an inventory ends up
 * with an activity in the wrong scope, which is the first thing an assurance
 * provider looks for.
 *
 * The catalogue stores a human category name ("Stationary combustion"); an
 * activity row stores a key ('stationary_combustion'). This module is the one
 * place those two vocabularies meet.
 */
import { CATALOGUE_SOURCES, CatalogueSource } from './catalogueData';
import { EmissionFactor, ScopeType } from '../types/ghg';

/** Entry category key -> the catalogue category names that belong to it. */
export const CATEGORY_TO_CATALOGUE: Record<string, string[]> = {
  // Scope 1
  stationary_combustion: ['Stationary combustion'],
  mobile_combustion: ['Mobile combustion'],
  process_emissions: ['Process emissions'],
  fugitive_emissions: ['Fugitive emissions', 'Montreal Protocol gas'],
  agricultural_emissions: ['Agriculture', 'Land use'],

  // Scope 2
  purchased_electricity: ['Purchased electricity'],
  purchased_steam_heat_cooling: ['Purchased steam, heat and cooling'],
  market_instruments: ['Purchased electricity'],

  // Scope 3, by category number
  cat1_purchased_goods: ['Purchased goods and services'],
  cat2_capital_goods: ['Capital goods'],
  cat3_fuel_energy: ['Fuel- and energy-related activities'],
  cat4_upstream_transport: ['Upstream transportation and distribution'],
  cat5_waste_operations: ['Waste generated in operations'],
  cat6_business_travel: ['Business travel'],
  cat7_employee_commuting: ['Employee commuting'],
  cat8_upstream_leased: ['Upstream leased assets'],
  cat9_downstream_transport: ['Downstream transportation'],
  cat10_processing_sold: ['Processing of sold products'],
  cat11_use_sold_products: ['Use of sold products'],
  cat12_end_of_life: ['End-of-life treatment of sold products'],
  cat13_downstream_leased: ['Downstream leased assets'],
  cat14_franchises: ['Franchises'],
  cat15_investments: ['Investments'],
};

const SCOPE_OF_ENTRY: Record<string, string> = {
  'scope-1': '1', 'scope-2': '2', 'scope-3': '3', biogenic: 'memo', memo: 'memo',
};

export const toEmissionFactor = (source: CatalogueSource): EmissionFactor => ({
  id: source.activity_key,
  fuelOrActivity: source.display_name,
  scope: (source.scope === '1' ? 'scope-1' : source.scope === '2' ? 'scope-2'
    : source.scope === '3' ? 'scope-3' : 'biogenic') as ScopeType,
  category: source.category_name,
  factorValue: source.factorValue,
  unit: source.default_unit,
  source: source.factor_source,
  publicationYear: source.publicationYear,
  qualityTier: source.qualityTier,
  notes: source.notes,
});

/**
 * The sources a row in this scope and category may use. Falls back to the whole
 * scope only when the category is unknown, so a new category never silently
 * shows an empty list.
 */
export function sourcesFor(scope: string, category: string): CatalogueSource[] {
  const wantedScope = SCOPE_OF_ENTRY[scope] ?? scope;
  const names = CATEGORY_TO_CATALOGUE[category];
  const inScope = CATALOGUE_SOURCES.filter((source) => source.scope === wantedScope);
  if (!names) return inScope;
  const matching = inScope.filter((source) => names.includes(source.category_name));
  return matching.length > 0 ? matching : inScope;
}

export const factorsFor = (scope: string, category: string): EmissionFactor[] =>
  sourcesFor(scope, category).map(toEmissionFactor);

/** Sources grouped by their catalogue group, for <optgroup> in a picker. */
export function groupedSourcesFor(scope: string, category: string): [string, CatalogueSource[]][] {
  const groups = new Map<string, CatalogueSource[]>();
  sourcesFor(scope, category).forEach((source) => {
    const key = source.group || 'Other';
    groups.set(key, [...(groups.get(key) ?? []), source]);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Units this source may be recorded in, from the catalogue's allowed_units. */
export function unitsFor(activityKey: string): string[] {
  const source = CATALOGUE_SOURCES.find((item) => item.activity_key === activityKey);
  if (!source) return [];
  const allowed = (source.allowed_units || source.default_unit || '')
    .split('|').map((unit) => unit.trim()).filter(Boolean);
  return allowed.length > 0 ? allowed : [source.default_unit].filter(Boolean);
}

export const isVerified = (activityKey: string): boolean =>
  CATALOGUE_SOURCES.find((item) => item.activity_key === activityKey)?.verified ?? false;

/** How much of the library carries a published value, for the factor library view. */
export function catalogueCoverage(): { total: number; verified: number; byScope: Record<string, { total: number; verified: number }> } {
  const byScope: Record<string, { total: number; verified: number }> = {};
  CATALOGUE_SOURCES.forEach((source) => {
    const bucket = byScope[source.scope] ?? { total: 0, verified: 0 };
    bucket.total += 1;
    if (source.verified) bucket.verified += 1;
    byScope[source.scope] = bucket;
  });
  return {
    total: CATALOGUE_SOURCES.length,
    verified: CATALOGUE_SOURCES.filter((source) => source.verified).length,
    byScope,
  };
}
