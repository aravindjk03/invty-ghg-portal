/**
 * Aggregation for the inventory sections: scope totals, category blocks, the
 * Scope 3 fifteen-category assessment, intensity and trends.
 *
 * Every figure here is summed from the entries the user actually recorded. A
 * category with no entries produces a zero and a gap note, never a placeholder.
 */
import { ActivityEntry, Scope3Category } from '../../types/ghg';
import {
  CategoryBlock, EmissionsSummaryRow, IntensitySection, MethodSourceRow, RankedSource,
  RefrigerantRow,
  Scope3CategoryAssessment, Scope3Inclusion, ScopeOneSection, ScopeThreeSection,
  ScopeTwoSection, TrendRow, TrendSection,
} from '../model/types';
import { ReportMeta } from '../model/reportMeta';

export const sum = (entries: ActivityEntry[]): number =>
  entries.reduce((total, entry) => total + (Number(entry.calculatedTco2e) || 0), 0);

const share = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);

const byCategory = (entries: ActivityEntry[], category: string): ActivityEntry[] =>
  entries.filter((entry) => entry.category === category);

function block(
  key: string, label: string, entries: ActivityEntry[], scopeTotal: number, gapNote?: string,
): CategoryBlock {
  const tco2e = sum(entries);
  return {
    key,
    label,
    tco2e,
    shareOfScope: share(tco2e, scopeTotal),
    entries,
    gapNote: entries.length === 0 ? gapNote : undefined,
  };
}

// ── Scope 1 (report parts 10-13) ─────────────────────────────────────────────

const SCOPE1_KNOWN = ['stationary_combustion', 'mobile_combustion', 'process_emissions',
  'fugitive_emissions'];

export function buildScopeOne(
  entries: ActivityEntry[],
  refrigerants: RefrigerantRow[] = [],
  methods: MethodSourceRow[] = [],
): ScopeOneSection {
  // The methods are Scope 1 like everything else here; they are only separated
  // because they are equations rather than a factor per unit. A source the
  // engine refused contributes nothing and is listed in the exclusions.
  const methodsTotal = methods.reduce((running, row) => running + row.tco2e, 0);
  const total = sum(entries) + methodsTotal;
  const other = Array.from(new Set(entries.map((e) => e.category)))
    .filter((category) => !SCOPE1_KNOWN.includes(category))
    .map((category) => block(category, humanise(category), byCategory(entries, category), total));

  return {
    total,
    stationary: block('stationary_combustion', 'Stationary combustion',
      byCategory(entries, 'stationary_combustion'), total,
      'No stationary combustion recorded. Confirm whether boilers, furnaces, thermal oil heaters or standby generators exist at any facility in the boundary.'),
    mobile: block('mobile_combustion', 'Mobile combustion',
      byCategory(entries, 'mobile_combustion'), total,
      'No mobile combustion recorded. Confirm whether owned or controlled vehicles, forklifts or material-handling equipment consume fuel.'),
    process: block('process_emissions', 'Process emissions',
      byCategory(entries, 'process_emissions'), total,
      'No process emissions recorded. Process sources arise from chemical reactions rather than combustion; confirm the assessment rather than assuming none exist.'),
    fugitive: block('fugitive_emissions', 'Fugitive emissions',
      byCategory(entries, 'fugitive_emissions'), total,
      'No fugitive emissions recorded. Refrigerant losses from HVAC, chillers and cold storage, and SF6 from electrical equipment, are commonly missed.'),
    other,
    methods,
    methodsTotal,
    fugitiveMethodNote: refrigerants.length === 0 && byCategory(entries, 'fugitive_emissions').length > 0
      ? 'Fugitive emissions are reported without an equipment register. Record each item with its refrigerant, initial charge, recharge, recovery and the calculation method: refrigerant purchased is not automatically equal to refrigerant emitted.'
      : '',
    refrigerants,
  };
}

const humanise = (key: string): string =>
  key.replace(/^cat\d+_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ── Scope 2 (report part 14) ─────────────────────────────────────────────────

export function buildScopeTwo(
  entries: ActivityEntry[], locationBased: number, marketBased: number, meta: ReportMeta,
): ScopeTwoSection {
  const instruments = meta.contractualInstruments;
  const marketIsLower = marketBased < locationBased;
  return {
    locationBased,
    marketBased,
    guidanceVersion: meta.scope2GuidanceVersion,
    contractualInstruments: instruments,
    methodNote: marketIsLower && instruments.length === 0
      ? 'The market-based figure is lower than the location-based figure, but no contractual instrument has been documented. Record the instrument (PPA, green tariff, unbundled certificate), its vintage and the quality criteria it meets, or report the location-based figure only.'
      : 'Both methods are reported. The location-based figure uses grid-average factors; the market-based figure reflects documented contractual instruments where applicable.',
    entries,
  };
}

// ── Scope 3 (report part 15) ─────────────────────────────────────────────────

export const SCOPE3_CATEGORIES: { number: number; key: Scope3Category; label: string }[] = [
  { number: 1, key: 'cat1_purchased_goods', label: 'Purchased goods and services' },
  { number: 2, key: 'cat2_capital_goods', label: 'Capital goods' },
  { number: 3, key: 'cat3_fuel_energy', label: 'Fuel- and energy-related activities' },
  { number: 4, key: 'cat4_upstream_transport', label: 'Upstream transportation and distribution' },
  { number: 5, key: 'cat5_waste_operations', label: 'Waste generated in operations' },
  { number: 6, key: 'cat6_business_travel', label: 'Business travel' },
  { number: 7, key: 'cat7_employee_commuting', label: 'Employee commuting' },
  { number: 8, key: 'cat8_upstream_leased', label: 'Upstream leased assets' },
  { number: 9, key: 'cat9_downstream_transport', label: 'Downstream transportation and distribution' },
  { number: 10, key: 'cat10_processing_sold', label: 'Processing of sold products' },
  { number: 11, key: 'cat11_use_sold_products', label: 'Use of sold products' },
  { number: 12, key: 'cat12_end_of_life', label: 'End-of-life treatment of sold products' },
  { number: 13, key: 'cat13_downstream_leased', label: 'Downstream leased assets' },
  { number: 14, key: 'cat14_franchises', label: 'Franchises' },
  { number: 15, key: 'cat15_investments', label: 'Investments' },
];

export function buildScopeThree(entries: ActivityEntry[]): ScopeThreeSection {
  const assessment: Scope3CategoryAssessment[] = SCOPE3_CATEGORIES.map((category) => {
    const categoryEntries = byCategory(entries, category.key);
    const tco2e = sum(categoryEntries);
    const included = categoryEntries.length > 0;
    const inclusion: Scope3Inclusion = included ? 'included' : 'not_assessed';
    return {
      number: category.number,
      key: category.key,
      label: category.label,
      materiality: included ? 'material' : 'not_assessed',
      inclusion,
      tco2e,
      justification: included
        ? `Quantified from ${categoryEntries.length} activity record${categoryEntries.length === 1 ? '' : 's'}.`
        : 'Not assessed. Record a materiality screening decision: material and to be quantified, not applicable with a reason, or excluded with an improvement action. "Not available" is not the same as "not applicable".',
    };
  });

  return {
    total: sum(entries),
    assessment,
    categoriesIncluded: assessment.filter((c) => c.inclusion === 'included').length,
    categoriesAssessed: assessment.filter((c) => c.inclusion !== 'not_assessed').length,
  };
}

// ── Summary, ranking, intensity, trends (parts 4, 21-24) ─────────────────────

export function buildEmissionsSummary(
  scope1: ScopeOneSection, scope2: ScopeTwoSection, scope3: ScopeThreeSection,
): EmissionsSummaryRow[] {
  const total = scope1.total + scope2.locationBased + scope3.total;
  const row = (category: string, tco2e: number, isSubtotal = false): EmissionsSummaryRow =>
    ({ category, tco2e, shareOfTotal: share(tco2e, total), isSubtotal });

  const rows: EmissionsSummaryRow[] = [
    row('Scope 1 — Stationary combustion', scope1.stationary.tco2e),
    row('Scope 1 — Mobile combustion', scope1.mobile.tco2e),
    row('Scope 1 — Process', scope1.process.tco2e),
    row('Scope 1 — Fugitive', scope1.fugitive.tco2e),
    ...scope1.other.map((other) => row(`Scope 1 — ${other.label}`, other.tco2e)),
    row('Total Scope 1', scope1.total, true),
    row('Scope 2 — Location-based', scope2.locationBased, true),
    row('Scope 2 — Market-based', scope2.marketBased, true),
  ];

  scope3.assessment
    .filter((category) => category.tco2e > 0)
    .forEach((category) => rows.push(row(`Scope 3 — Cat ${category.number} ${category.label}`, category.tco2e)));

  rows.push(row('Total Scope 3', scope3.total, true));
  rows.push(row('Total Scope 1 + 2 (location-based)', scope1.total + scope2.locationBased, true));
  rows.push(row('Total Scope 1 + 2 + 3', total, true));
  return rows;
}

export function rankSources(entries: ActivityEntry[], total: number, top = 5): RankedSource[] {
  const grouped = new Map<string, { scopeLabel: string; tco2e: number }>();
  entries.forEach((entry) => {
    const key = entry.fuelOrSource || humanise(entry.category);
    const existing = grouped.get(key);
    const tco2e = (existing?.tco2e ?? 0) + (Number(entry.calculatedTco2e) || 0);
    grouped.set(key, { scopeLabel: scopeLabel(entry.scope), tco2e });
  });

  return [...grouped.entries()]
    .map(([source, value]) => ({ source, ...value }))
    .sort((a, b) => b.tco2e - a.tco2e)
    .slice(0, top)
    .map((item, index) => ({
      rank: index + 1,
      source: item.source,
      scopeLabel: item.scopeLabel,
      tco2e: item.tco2e,
      shareOfTotal: share(item.tco2e, total),
    }));
}

export const scopeLabel = (scope: string): string =>
  ({ 'scope-1': 'Scope 1', 'scope-2': 'Scope 2', 'scope-3': 'Scope 3',
    biogenic: 'Biogenic (memo)', memo: 'Memo' }[scope] ?? scope);

export function buildIntensity(
  totalScope12: number, totalAll: number, meta: ReportMeta,
): IntensitySection {
  const indicators = [
    {
      label: 'GHG intensity (Scope 1 + 2 per unit of production)',
      value: meta.productionOutput ? totalScope12 / meta.productionOutput : undefined,
      unit: `tCO2e / ${meta.productionUnit}`,
      missingReason: meta.productionOutput ? undefined
        : 'Production output for the reporting period has not been recorded.',
    },
    {
      label: 'GHG intensity (Scope 1 + 2 + 3 per unit of production)',
      value: meta.productionOutput ? totalAll / meta.productionOutput : undefined,
      unit: `tCO2e / ${meta.productionUnit}`,
      missingReason: meta.productionOutput ? undefined
        : 'Production output for the reporting period has not been recorded.',
    },
    {
      label: 'Revenue intensity (Scope 1 + 2)',
      value: meta.revenueCrore ? totalScope12 / meta.revenueCrore : undefined,
      unit: 'tCO2e / INR crore',
      missingReason: meta.revenueCrore ? undefined : 'Revenue for the reporting period has not been recorded.',
    },
  ];
  return {
    indicators,
    productionOutput: meta.productionOutput,
    productionUnit: meta.productionUnit,
    revenueCrore: meta.revenueCrore,
  };
}

export function buildTrends(
  currentYearLabel: string, scope1: number, scope2Location: number, scope3: number,
  meta: ReportMeta,
): TrendSection {
  const rows: TrendRow[] = meta.priorYears.map((year) => ({
    year: year.year,
    scope1: year.scope1,
    scope2Location: year.scope2Location,
    scope3: year.scope3,
    totalScope12: year.scope1 + year.scope2Location,
    intensity: year.productionOutput
      ? (year.scope1 + year.scope2Location) / year.productionOutput : undefined,
  }));

  rows.push({
    year: currentYearLabel,
    scope1,
    scope2Location,
    scope3,
    totalScope12: scope1 + scope2Location,
    intensity: meta.productionOutput ? (scope1 + scope2Location) / meta.productionOutput : undefined,
  });

  const commentary: string[] = [];
  if (rows.length >= 2) {
    const previous = rows[rows.length - 2];
    const current = rows[rows.length - 1];
    const delta = current.totalScope12 - previous.totalScope12;
    const percent = previous.totalScope12 > 0 ? (delta / previous.totalScope12) * 100 : 0;
    commentary.push(
      `Scope 1 + 2 ${delta >= 0 ? 'increased' : 'decreased'} by ${Math.abs(delta).toFixed(1)} tCO2e ` +
      `(${Math.abs(percent).toFixed(1)}%) against ${previous.year}. State the physical cause — production ` +
      'volume, fuel switching, renewable procurement, metering or methodology change — rather than the percentage alone.');
  }

  return { rows, commentary, available: meta.priorYears.length > 0 };
}
