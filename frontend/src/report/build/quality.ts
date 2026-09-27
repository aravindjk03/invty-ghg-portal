/**
 * What separates an inventory from a verifiable one: data quality, uncertainty,
 * QA/QC checks, the exclusion register and a readiness score
 * (report parts 26-30).
 *
 * The QA/QC checks run automatically over the recorded entries. They are the
 * questions an assurance provider asks first — can this number be traced, is
 * the factor current, is the unit consistent, is anything missing — and they
 * report honestly, including "cannot be checked from the data held".
 */
import { ActivityEntry } from '../../types/ghg';
import {
  DataQualityRow, EvidenceRow, ExclusionRow, MethodSourceRow, QaQcCheck, QualityRating,
  Scope3CategoryAssessment, UncertaintyRow, VerificationReadiness,
} from '../model/types';
import { ReportMeta, missingMetaFields } from '../model/reportMeta';
import { scopeLabel, sum } from './aggregate';

const TIER_QUALITY: Record<string, QualityRating> = {
  Primary: 'High', Secondary: 'Medium', Proxy: 'Low', Estimated: 'Low',
};

const TIER_BAND: Record<string, UncertaintyRow['band']> = {
  Primary: 'High certainty', Secondary: 'Moderate certainty',
  Proxy: 'Lower certainty', Estimated: 'Lower certainty',
};

const TIER_BASIS: Record<string, string> = {
  Primary: 'Measured or metered data from the organisation’s own records.',
  Secondary: 'Purchase, invoice or register data converted with a published factor.',
  Proxy: 'A stand-in dataset used because activity-specific data was unavailable.',
  Estimated: 'Estimated or supplier-declared value; not independently measured.',
};

// ── 27. Data quality ─────────────────────────────────────────────────────────

export function buildDataQuality(entries: ActivityEntry[], evidence: EvidenceRow[]): DataQualityRow[] {
  const evidenceBySource = new Map(evidence.map((row) => [row.source, row.hasEvidence]));
  const groups = new Map<string, ActivityEntry[]>();
  entries.forEach((entry) => {
    const key = `${entry.fuelOrSource || entry.category} (${scopeLabel(entry.scope)})`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  return [...groups.entries()].map(([source, group]) => {
    const tier = group[0]?.emissionFactor?.qualityTier ?? 'Estimated';
    const accuracy = TIER_QUALITY[tier] ?? 'Low';
    const hasEvidence = evidenceBySource.get(source) ?? false;
    const complete = group.every((entry) => entry.amount > 0 && Boolean(entry.unit));
    const completeness: QualityRating = complete ? (hasEvidence ? 'High' : 'Medium') : 'Low';
    const reliability: QualityRating = hasEvidence ? accuracy : lower(accuracy);
    return {
      source,
      accuracy,
      completeness,
      reliability,
      overall: worst([accuracy, completeness, reliability]),
      basis: TIER_BASIS[tier] ?? TIER_BASIS.Estimated,
    };
  });
}

const ORDER: QualityRating[] = ['Low', 'Medium', 'High'];
const lower = (rating: QualityRating): QualityRating => ORDER[Math.max(0, ORDER.indexOf(rating) - 1)];
const worst = (ratings: QualityRating[]): QualityRating =>
  ratings.reduce((a, b) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b));

// ── 28. Uncertainty ──────────────────────────────────────────────────────────

export function buildUncertainty(entries: ActivityEntry[]): UncertaintyRow[] {
  const total = sum(entries);
  const bands = new Map<UncertaintyRow['band'], { sources: Set<string>; tco2e: number; types: Set<string> }>();

  entries.forEach((entry) => {
    const tier = entry.emissionFactor?.qualityTier ?? 'Estimated';
    const band = TIER_BAND[tier] ?? 'Lower certainty';
    const current = bands.get(band) ?? { sources: new Set<string>(), tco2e: 0, types: new Set<string>() };
    current.sources.add(entry.fuelOrSource || entry.category);
    current.types.add(tier);
    current.tco2e += Number(entry.calculatedTco2e) || 0;
    bands.set(band, current);
  });

  const describe: Record<string, string> = {
    'High certainty': 'Measured data',
    'Moderate certainty': 'Calculated from transaction records',
    'Lower certainty': 'Estimated or proxy data',
  };

  return (['High certainty', 'Moderate certainty', 'Lower certainty'] as const)
    .filter((band) => bands.has(band))
    .map((band) => {
      const value = bands.get(band)!;
      return {
        band,
        dataType: describe[band],
        sources: [...value.sources],
        tco2e: value.tco2e,
        shareOfTotal: total > 0 ? (value.tco2e / total) * 100 : 0,
      };
    });
}

// ── 26. Exclusions ───────────────────────────────────────────────────────────

export function buildExclusions(
  scope3: Scope3CategoryAssessment[], scopeOneGaps: { label: string; missing: boolean }[],
  meta: ReportMeta, methods: MethodSourceRow[] = [],
): ExclusionRow[] {
  const rows: ExclusionRow[] = meta.exclusions.map((exclusion) => ({
    source: exclusion.source,
    excluded: true,
    reason: exclusion.reason,
    estimatedSignificance: exclusion.estimatedSignificance,
    improvementAction: exclusion.improvementAction,
    targetCompletion: exclusion.targetCompletion,
  }));

  scopeOneGaps.filter((gap) => gap.missing).forEach((gap) => {
    rows.push({
      source: `Scope 1 — ${gap.label}`,
      excluded: true,
      reason: 'No activity data recorded and no exclusion decision documented.',
      estimatedSignificance: 'Unknown — not screened',
      improvementAction: 'Screen the source: confirm it does not exist in the boundary, or collect activity data.',
      targetCompletion: 'Before the inventory is submitted for assurance',
    });
  });

  // A method source the engine refused is a finding, not an absence: the site
  // has the source, and the report has to say it could not be quantified.
  methods.filter((row) => row.refusedReason).forEach((row) => {
    rows.push({
      source: `Scope 1 — ${row.label} (${row.method})`,
      excluded: true,
      reason: row.refusedReason as string,
      estimatedSignificance: 'Unknown — the source exists but could not be quantified',
      improvementAction: 'Complete the inputs the method needs, or record why the source cannot be estimated.',
      targetCompletion: 'Before the inventory is submitted for assurance',
    });
  });

  scope3.filter((category) => category.inclusion === 'not_assessed').forEach((category) => {
    rows.push({
      source: `Scope 3 Cat ${category.number} — ${category.label}`,
      excluded: true,
      reason: 'Category not assessed for materiality.',
      estimatedSignificance: 'Unknown — not screened',
      improvementAction: 'Record a materiality screening decision with its basis.',
      targetCompletion: 'Before the inventory is submitted for assurance',
    });
  });

  return rows;
}

// ── 29. QA/QC ────────────────────────────────────────────────────────────────

export function runQaQc(
  entries: ActivityEntry[], evidence: EvidenceRow[], reportingYear: number, meta: ReportMeta,
): QaQcCheck[] {
  const checks: QaQcCheck[] = [];
  const add = (id: string, check: string, outcome: QaQcCheck['outcome'], detail: string) =>
    checks.push({ id, check, outcome, detail });

  // Traceability
  const withoutEvidence = evidence.filter((row) => !row.hasEvidence);
  add('QC-01', 'Every reported figure traces to a source document',
    withoutEvidence.length === 0 ? 'pass' : 'fail',
    withoutEvidence.length === 0
      ? `All ${evidence.length} sources have supporting evidence attached.`
      : `${withoutEvidence.length} of ${evidence.length} sources have no attached evidence: ${withoutEvidence.slice(0, 4).map((r) => r.source).join('; ')}${withoutEvidence.length > 4 ? '…' : ''}`);

  // Units and amounts
  const badAmounts = entries.filter((entry) => !(Number(entry.amount) > 0));
  add('QC-02', 'Activity data is present and positive',
    badAmounts.length === 0 ? 'pass' : 'attention',
    badAmounts.length === 0 ? `All ${entries.length} records carry a positive quantity.`
      : `${badAmounts.length} record(s) have a zero or missing quantity.`);

  const missingUnits = entries.filter((entry) => !entry.unit);
  add('QC-03', 'Units are recorded on every record',
    missingUnits.length === 0 ? 'pass' : 'fail',
    missingUnits.length === 0 ? 'Every record carries a unit.'
      : `${missingUnits.length} record(s) have no unit.`);

  // Factor currency and provenance
  const factorAges = entries
    .map((entry) => entry.emissionFactor?.publicationYear)
    .filter((year): year is number => typeof year === 'number' && year > 0);
  const stale = factorAges.filter((year) => reportingYear - year > 3).length;
  add('QC-04', 'Emission factors are current for the reporting year',
    factorAges.length === 0 ? 'not_possible' : stale === 0 ? 'pass' : 'attention',
    factorAges.length === 0 ? 'No factor publication years recorded, so currency cannot be checked.'
      : stale === 0 ? 'All factors were published within three years of the reporting year.'
        : `${stale} record(s) use a factor more than three years old. Confirm no newer published version applies.`);

  const noSource = entries.filter((entry) => !entry.emissionFactor?.source);
  add('QC-05', 'Every emission factor cites its source',
    noSource.length === 0 ? 'pass' : 'fail',
    noSource.length === 0 ? 'Every factor names a published source.'
      : `${noSource.length} record(s) use a factor with no cited source.`);

  // Overrides
  const overrides = entries.filter((entry) => entry.customFactorOverride !== undefined);
  add('QC-06', 'Manual factor overrides are justified',
    overrides.length === 0 ? 'pass' : 'attention',
    overrides.length === 0 ? 'No factor was overridden manually.'
      : `${overrides.length} record(s) override the registry factor. Each override needs a documented reason.`);

  // Duplicates
  const seen = new Map<string, number>();
  entries.forEach((entry) => {
    const key = `${entry.facility}|${entry.fuelOrSource}|${entry.amount}|${entry.unit}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  const duplicates = [...seen.values()].filter((count) => count > 1).length;
  add('QC-07', 'No duplicated activity records',
    duplicates === 0 ? 'pass' : 'attention',
    duplicates === 0 ? 'No identical facility, source, quantity and unit combinations found.'
      : `${duplicates} group(s) of identical records found. Confirm they are genuinely separate events.`);

  // Warnings raised by the calculation engine
  const warned = entries.filter((entry) => Boolean(entry.warning));
  add('QC-08', 'Engine warnings resolved',
    warned.length === 0 ? 'pass' : 'attention',
    warned.length === 0 ? 'The calculation engine raised no warnings.'
      : `${warned.length} record(s) carry an unresolved warning.`);

  // Reconciliation, which this inventory cannot do on its own
  add('QC-09', 'Fuel reconciliation: opening stock + purchases − closing stock ≈ consumption',
    'not_possible',
    'Stock movement is not recorded in the inventory, so consumption cannot be reconciled against purchases. Record opening and closing stock per fuel to enable this check.');

  add('QC-10', 'Energy data reconciled with finance records',
    'not_possible',
    'Invoice values are not held in the inventory. Reconcile electricity and fuel quantities against the finance ledger before assurance.');

  // Period completeness
  add('QC-11', 'Reporting period is defined',
    meta.periodStart && meta.periodEnd ? 'pass' : 'fail',
    meta.periodStart && meta.periodEnd
      ? `Period recorded as ${meta.periodStart} to ${meta.periodEnd}.`
      : 'Start and end dates of the reporting period have not been recorded.');

  // A factor with no ingested value contributes nothing and must not be reported
  // as though it were quantified.
  const unvalued = entries.filter((entry) =>
    entry.customFactorOverride === undefined
    && !((entry.emissionFactor?.factorValue ?? 0) > 0));
  add('QC-15', 'Every factor used has an ingested published value',
    entries.length === 0 ? 'not_possible' : unvalued.length === 0 ? 'pass' : 'fail',
    entries.length === 0 ? 'No records held.'
      : unvalued.length === 0 ? 'Every record uses a factor with a published value.'
        : `${unvalued.length} record(s) use a source whose factor has not been ingested: `
          + `${[...new Set(unvalued.map((entry) => entry.fuelOrSource))].slice(0, 4).join('; ')}`
          + `. They contribute 0 tCO2e until a value and its source are entered.`);

  const dated = entries.filter((entry) => Boolean(entry.periodMonth));
  add('QC-13', 'Records carry the month they belong to',
    entries.length === 0 ? 'not_possible' : dated.length === entries.length ? 'pass' : 'attention',
    entries.length === 0 ? 'No records held.'
      : dated.length === entries.length
        ? 'Every record carries a month, so seasonality and missing months can be checked.'
        : `${entries.length - dated.length} of ${entries.length} records carry no month. Monthly analysis (Part 21) cannot see them.`);

  add('QC-14', 'Fugitive emissions state their calculation method',
    meta.refrigerants.length === 0
      ? (entries.some((entry) => entry.category === 'fugitive_emissions') ? 'fail' : 'not_possible')
      : meta.refrigerants.every((row) => Boolean(row.method)) ? 'pass' : 'fail',
    meta.refrigerants.length === 0
      ? (entries.some((entry) => entry.category === 'fugitive_emissions')
        ? 'Fugitive emissions are reported with no equipment register and no stated method.'
        : 'No refrigerant equipment recorded, so the method cannot be checked.')
      : meta.refrigerants.every((row) => Boolean(row.method))
        ? `All ${meta.refrigerants.length} equipment items state a calculation method.`
        : 'One or more refrigerant items have no calculation method stated.');

  add('QC-12', 'GWP basis is stated',
    meta.gwpBasis ? 'pass' : 'fail',
    meta.gwpBasis ? `GWP basis: ${meta.gwpBasis}.`
      : 'No GWP basis recorded. Changing GWP values changes the inventory even when activity data does not.');

  return checks;
}

// ── 30 / 41. Readiness ───────────────────────────────────────────────────────

export function assessReadiness(
  checks: QaQcCheck[], evidence: EvidenceRow[], scope3: Scope3CategoryAssessment[],
  meta: ReportMeta,
): VerificationReadiness {
  const blockers: string[] = [];
  const strengths: string[] = [];

  const failed = checks.filter((check) => check.outcome === 'fail');
  failed.forEach((check) => blockers.push(`${check.id}: ${check.check}`));

  const missingMeta = missingMetaFields(meta);
  if (missingMeta.length > 0) blockers.push(`Report metadata missing: ${missingMeta.join(', ')}`);

  const unassessed = scope3.filter((category) => category.inclusion === 'not_assessed').length;
  if (unassessed > 0) blockers.push(`${unassessed} of 15 Scope 3 categories have no materiality decision`);

  const tracedShare = evidence.length > 0
    ? evidence.filter((row) => row.hasEvidence).length / evidence.length : 0;
  if (tracedShare === 1 && evidence.length > 0) strengths.push('Every source traces to a document');
  checks.filter((check) => check.outcome === 'pass').forEach((check) => strengths.push(check.check));

  // Score: evidence 40, QA/QC 30, Scope 3 assessment 20, metadata 10.
  const qaScore = checks.length > 0
    ? checks.filter((c) => c.outcome === 'pass').length / checks.filter((c) => c.outcome !== 'not_possible').length : 0;
  const scope3Score = (15 - unassessed) / 15;
  const metaScore = 1 - missingMeta.length / 12;
  const score = Math.round(
    tracedShare * 40 + (Number.isFinite(qaScore) ? qaScore : 0) * 30 + scope3Score * 20 + Math.max(0, metaScore) * 10);

  const level: VerificationReadiness['level'] =
    score >= 85 && blockers.length === 0 ? 'Verification ready'
      : score >= 50 ? 'Inventory report' : 'Inventory';

  return { score, level, blockers, strengths: strengths.slice(0, 6) };
}
