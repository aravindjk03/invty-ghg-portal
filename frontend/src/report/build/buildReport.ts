/**
 * Assembles the whole GHG inventory report from the live inventory and the
 * report metadata. One call, one immutable object, which the section
 * components then render.
 */
import { ActivityEntry, ScopeSummary } from '../../types/ghg';
import { ReportMeta } from '../model/reportMeta';
import { GhgInventoryReport, MethodSourceRow } from '../model/types';
import {
  buildEmissionsSummary, buildIntensity, buildScopeOne, buildScopeThree, buildScopeTwo,
  buildTrends, rankSources,
} from './aggregate';
import { buildMonthly } from './monthly';
import { buildAnnexures, buildEvidenceRegister, buildFactorRegister, buildSourceRegister } from './registers';
import { buildHierarchy, buildReviewerFlags } from './review';
import { assessReadiness, buildDataQuality, buildExclusions, buildUncertainty, runQaQc } from './quality';

export interface ReportInput {
  companyName: string;
  reportingPeriod: string;
  boundaryApproach: string;
  scope1Entries: ActivityEntry[];
  scope2Entries: ActivityEntry[];
  scope3Entries: ActivityEntry[];
  summary: ScopeSummary;
  /** The Scope 1 sources calculated as IPCC equations, already run by the engine. */
  methodSources?: MethodSourceRow[];
  meta: ReportMeta;
  frameworks: string[];
  now?: Date;
}

const NOT_RECORDED = 'Not recorded';
const fallback = (value: string | undefined, placeholder = NOT_RECORDED): string =>
  value && value.trim() ? value.trim() : placeholder;

export function buildReport(input: ReportInput): GhgInventoryReport {
  const { companyName, reportingPeriod, boundaryApproach, summary, meta, frameworks } = input;
  const now = input.now ?? new Date();
  const reportingYear = Number(reportingPeriod.match(/\d{4}/)?.[0]) || now.getFullYear();
  const allEntries = [...input.scope1Entries, ...input.scope2Entries, ...input.scope3Entries];

  const methodSources = input.methodSources ?? [];
  const scope1 = buildScopeOne(input.scope1Entries, meta.refrigerants, methodSources);
  const scope2 = buildScopeTwo(input.scope2Entries, summary.scope2Location, summary.scope2Market, meta);
  const scope3 = buildScopeThree(input.scope3Entries);

  const totalScope12 = scope1.total + scope2.locationBased;
  const totalAll = totalScope12 + scope3.total;

  const evidenceRegister = buildEvidenceRegister(allEntries);
  const factorRegister = buildFactorRegister(allEntries, reportingYear);
  const qaqc = runQaQc(allEntries, evidenceRegister, reportingYear, meta);
  const readiness = assessReadiness(qaqc, evidenceRegister, scope3.assessment, meta);

  const exclusions = buildExclusions(scope3.assessment, [
    { label: 'Stationary combustion', missing: scope1.stationary.entries.length === 0 },
    { label: 'Mobile combustion', missing: scope1.mobile.entries.length === 0 },
    { label: 'Process emissions', missing: scope1.process.entries.length === 0 },
    { label: 'Fugitive emissions', missing: scope1.fugitive.entries.length === 0 },
  ], meta, methodSources);

  const facilitiesInInventory = [...new Set(allEntries.map((entry) => entry.facility).filter(Boolean))];
  const listed = new Set(meta.facilities.map((facility) => facility.name));

  const intensity = buildIntensity(totalScope12, totalAll, meta);

  const report: GhgInventoryReport = {
    cover: {
      title: 'Greenhouse Gas (GHG) Emissions Inventory Report',
      companyName,
      facility: fallback(meta.facility, 'All facilities within the organizational boundary'),
      reportingPeriodLabel: reportingPeriod,
      periodStart: fallback(meta.periodStart),
      periodEnd: fallback(meta.periodEnd),
      frameworks,
      issueDate: now.toISOString().slice(0, 10),
    },

    documentControl: {
      documentTitle: 'GHG Emissions Inventory Report',
      documentNumber: fallback(meta.documentNumber),
      version: fallback(meta.version),
      reportingYear: reportingPeriod,
      effectiveDate: fallback(meta.effectiveDate),
      preparedBy: fallback(meta.preparedBy),
      reviewedBy: fallback(meta.reviewedBy),
      approvedBy: fallback(meta.approvedBy),
      confidentiality: fallback(meta.confidentiality, 'Internal / Controlled'),
      revisionHistory: meta.revisionHistory,
    },

    executiveSummary: {
      metrics: [
        { label: 'Scope 1', value: totalFormat(scope1.total), unit: 'tCO2e' },
        { label: 'Scope 2 — Location-based', value: totalFormat(scope2.locationBased), unit: 'tCO2e' },
        { label: 'Scope 2 — Market-based', value: totalFormat(scope2.marketBased), unit: 'tCO2e' },
        { label: 'Scope 3', value: totalFormat(scope3.total), unit: 'tCO2e' },
        { label: 'Total Scope 1 + 2 (location-based)', value: totalFormat(totalScope12), unit: 'tCO2e' },
        { label: 'Total Scope 1 + 2 + 3', value: totalFormat(totalAll), unit: 'tCO2e' },
        {
          label: 'Production output',
          value: meta.productionOutput ? totalFormat(meta.productionOutput) : '—',
          unit: meta.productionUnit,
          missingReason: meta.productionOutput ? undefined : 'Not recorded',
        },
        {
          label: 'GHG intensity (Scope 1 + 2)',
          value: intensity.indicators[0].value !== undefined
            ? intensity.indicators[0].value.toFixed(3) : '—',
          unit: intensity.indicators[0].unit,
          missingReason: intensity.indicators[0].missingReason,
        },
        {
          label: 'Renewable electricity share',
          value: meta.renewableSharePercent !== undefined ? `${meta.renewableSharePercent}` : '—',
          unit: '% of purchased electricity',
          missingReason: meta.renewableSharePercent !== undefined ? undefined : 'Not recorded',
        },
        {
          label: 'Scope 3 categories assessed',
          value: `${scope3.categoriesAssessed} of 15`,
          unit: 'categories',
          missingReason: scope3.categoriesAssessed < 15
            ? `${15 - scope3.categoriesAssessed} categories have no materiality decision` : undefined,
        },
      ],
      largestSources: rankSources(allEntries, totalAll),
      narrative: buildNarrative(scope1.total, scope2.locationBased, scope3.total, totalAll, readiness.level),
    },

    objective: {
      objective:
        `The objective of this inventory is to quantify, document and report the greenhouse gas emissions ` +
        `associated with the operations and relevant value-chain activities of ${companyName} for ${reportingPeriod}.`,
      purposes: [
        'Corporate carbon accounting and internal carbon management',
        'ESG and sustainability reporting, including BRSR where applicable',
        'Customer and supply-chain disclosure requests',
        'Development and tracking of GHG reduction targets',
        'Preparation for independent verification under ISO 14064-3',
      ],
      periodStart: fallback(meta.periodStart),
      periodEnd: fallback(meta.periodEnd),
      baseYear: fallback(meta.baseYear),
      baseYearRationale: fallback(meta.baseYearRationale,
        'No base year rationale recorded. A base year needs a documented methodology and a recalculation policy.'),
      principles: [
        { name: 'Relevance', statement: 'The inventory reflects the GHG emissions of the organisation and supports decision-making by internal and external users.' },
        { name: 'Completeness', statement: 'All material emission sources within the selected boundaries are included; any exclusion is documented with its justification.' },
        { name: 'Consistency', statement: 'Methodologies, boundaries and factors are applied consistently between periods, and any change is documented.' },
        { name: 'Transparency', statement: 'Assumptions, exclusions, emission factors, methodologies and data sources are disclosed and traceable.' },
        { name: 'Accuracy', statement: 'Quantification is sufficiently accurate for the intended use, and uncertainty is reduced as far as practicable.' },
      ],
    },

    organizationalBoundary: {
      consolidationApproach: boundaryApproach,
      approachRationale: fallback(meta.approachRationale,
        'No rationale recorded. State why this consolidation approach was selected, and how joint ventures, leased assets and subsidiaries are treated.'),
      facilities: meta.facilities,
      unlistedFacilities: facilitiesInInventory.filter((facility) => !listed.has(facility)),
    },

    operationalBoundary: { sources: buildSourceRegister(allEntries) },

    scope1,
    scope2,
    scope3,

    methodology: {
      dataFlow: ['Raw data', 'Data validation', 'Normalisation', 'Emission factor mapping',
        'GHG calculation by gas', 'GWP conversion to CO2e', 'Scope and category assignment',
        'QA/QC', 'Consolidation', 'Intensity and KPI', 'Reporting'],
      formulas: [
        { label: 'Activity-based emissions', formula: 'CO2e = Activity data × Emission factor' },
        { label: 'Multi-gas conversion', formula: 'CO2e = CO2 + (CH4 × GWP_CH4) + (N2O × GWP_N2O) + Σ(HFC × GWP_HFC)' },
        { label: 'Purchased electricity', formula: 'Scope 2 = Electricity consumption (kWh) × Electricity emission factor' },
        { label: 'Intensity', formula: 'GHG intensity = Total GHG emissions ÷ Production output' },
      ],
      gwpBasis: fallback(meta.gwpBasis),
      gwpNote: meta.gwpBasis
        ? 'All non-CO2 gases are converted to CO2-equivalent using the stated basis. A change in GWP basis changes the inventory even when activity data is unchanged.'
        : 'No GWP basis has been recorded. State the assessment report and time horizon used (for example IPCC AR6, 100-year) — the inventory cannot be reproduced without it.',
      factorHierarchy: [
        'Supplier-specific or site-measured factor',
        'National regulator factor for the country of operation (for example CEA for Indian grid electricity)',
        'National inventory or government factor (for example DEFRA/DESNZ, US EPA)',
        'International authoritative factor (for example IPCC default)',
        'Generic database or EEIO factor, used only as a screening proxy',
      ],
    },

    evidenceRegister,
    factorRegister,
    emissionsSummary: buildEmissionsSummary(scope1, scope2, scope3),
    intensity,
    trends: buildTrends(reportingPeriod, scope1.total, scope2.locationBased, scope3.total, meta),

    baseYear: {
      baseYear: fallback(meta.baseYear),
      baseYearEmissions: meta.baseYearEmissions,
      recalculationThresholdPercent: meta.recalculationThresholdPercent,
      triggers: ['Acquisition, divestment or merger affecting the boundary',
        'Facility closure or commissioning', 'Organisational restructuring',
        'A change in calculation methodology, factor set or GWP basis',
        'Discovery of a significant error in previously reported data',
        'Any change that materially affects comparability with the base year'],
      policyStatement:
        `The base year is recalculated when a trigger changes base-year Scope 1 + 2 emissions by ` +
        `${meta.recalculationThresholdPercent}% or more, cumulatively. Each recalculation is documented ` +
        `in Annexure M with the reason, the affected sources and the restated figures.`,
    },

    exclusions,
    dataQuality: buildDataQuality(allEntries, evidenceRegister),
    uncertainty: buildUncertainty(allEntries),
    qaqc,
    readiness,

    mitigation: meta.mitigations.map((mitigation) => ({
      source: mitigation.source,
      currentTco2e: sumForSource(allEntries, mitigation.source),
      action: mitigation.action,
      estimatedReductionTco2e: mitigation.estimatedReductionTco2e,
      responsibility: mitigation.responsibility,
      targetYear: mitigation.targetYear,
    })),

    targets: {
      targets: meta.targets.map((target) => {
        const baseline = target.baselineTco2e;
        const targetTco2e = baseline !== undefined
          ? baseline * (1 - target.reductionPercent / 100) : undefined;
        const remainingYears = Math.max(1, Number(target.targetYear.match(/\d{4}/)?.[0] ?? 0) - now.getFullYear());
        return {
          description: target.description,
          baseYear: target.baseYear,
          targetYear: target.targetYear,
          scopesCovered: target.scopesCovered,
          baselineTco2e: baseline,
          targetTco2e,
          currentTco2e: totalScope12,
          reductionPercent: target.reductionPercent,
          methodology: fallback(target.methodology,
            'No target methodology recorded. State the basis (for example SBTi absolute contraction) rather than an arbitrary percentage.'),
          gapTco2e: targetTco2e !== undefined ? totalScope12 - targetTco2e : undefined,
          requiredAnnualReductionTco2e: targetTco2e !== undefined
            ? Math.max(0, totalScope12 - targetTco2e) / remainingYears : undefined,
        };
      }),
    },

    monthly: buildMonthly(allEntries, meta.periodStart, meta.periodEnd),
    reviewerFlags: [],
    buildHierarchy: [],

    annexures: buildAnnexures({
      boundary: Boolean(meta.approachRationale),
      facilities: meta.facilities.length > 0,
      sources: allEntries.length > 0,
      activity: allEntries.length > 0,
      factors: factorRegister.length > 0,
      workbook: false,
      scope3: scope3.categoriesAssessed > 0,
      quality: allEntries.length > 0,
      uncertainty: allEntries.length > 0,
      exclusions: exclusions.length > 0,
      qaqc: qaqc.length > 0,
      evidence: evidenceRegister.length > 0,
      baseYear: Boolean(meta.baseYear),
      mitigation: meta.mitigations.length > 0,
      definitions: true,
    }),

    definitions: [
      { term: 'tCO2e', meaning: 'Tonnes of carbon dioxide equivalent, after conversion of each gas by its global warming potential.' },
      { term: 'GWP', meaning: 'Global warming potential: the warming effect of one unit of a gas relative to CO2 over a stated time horizon.' },
      { term: 'Scope 1', meaning: 'Direct emissions from sources owned or controlled by the organisation.' },
      { term: 'Scope 2', meaning: 'Indirect emissions from purchased electricity, steam, heat and cooling.' },
      { term: 'Scope 3', meaning: 'Other indirect emissions in the value chain, across fifteen defined categories.' },
      { term: 'Location-based', meaning: 'Scope 2 method using average emission factors for the grid where consumption occurs.' },
      { term: 'Market-based', meaning: 'Scope 2 method reflecting contractual instruments the organisation has purchased.' },
      { term: 'Activity data', meaning: 'The quantity of fuel, electricity, material, distance or spend that drives an emission.' },
      { term: 'Emission factor', meaning: 'The published coefficient converting activity data into emissions.' },
      { term: 'Base year', meaning: 'The reference year against which emissions performance is tracked.' },
      { term: 'Materiality', meaning: 'Whether an omission or misstatement could influence the decisions of report users.' },
      { term: 'Verification', meaning: 'Independent assessment that the reported inventory is free from material misstatement.' },
    ],

    standards: [
      { name: 'ISO 14064-1:2018', appliesTo: 'Organisation-level quantification and reporting of GHG emissions and removals.' },
      { name: 'GHG Protocol Corporate Accounting and Reporting Standard', appliesTo: 'Boundaries, Scope 1 and Scope 2 accounting, and reporting principles.' },
      { name: 'GHG Protocol Scope 2 Guidance', appliesTo: 'Location-based and market-based accounting for purchased energy.' },
      { name: 'GHG Protocol Corporate Value Chain (Scope 3) Standard', appliesTo: 'The fifteen Scope 3 categories and their screening.' },
      { name: 'IPCC Assessment Report (as stated in the GWP basis)', appliesTo: 'Global warming potentials used for CO2e conversion.' },
      { name: 'National and regulator factor sets (for example CEA for Indian grid electricity)', appliesTo: 'Geographically applicable emission factors.' },
    ],
  };

  // Parts 38-39 assess the finished report, so they are computed last.
  report.reviewerFlags = buildReviewerFlags(report);
  report.buildHierarchy = buildHierarchy(report);
  return report;
}

const totalFormat = (value: number): string =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

const sumForSource = (entries: ActivityEntry[], source: string): number =>
  entries
    .filter((entry) => (entry.fuelOrSource || entry.category).toLowerCase().includes(source.toLowerCase()))
    .reduce((total, entry) => total + (Number(entry.calculatedTco2e) || 0), 0);

function buildNarrative(
  scope1: number, scope2: number, scope3: number, total: number, level: string,
): string[] {
  const parts: string[] = [];
  const shares: [string, number][] = [['Scope 1', scope1], ['Scope 2', scope2], ['Scope 3', scope3]];
  const largest = shares.sort((a, b) => b[1] - a[1])[0];
  if (total > 0) {
    parts.push(
      `${largest[0]} represents the largest share of the inventory at ` +
      `${((largest[1] / total) * 100).toFixed(1)}% of total reported emissions ` +
      `(${largest[1].toLocaleString('en-IN', { maximumFractionDigits: 1 })} tCO2e).`);
  }
  parts.push(
    level === 'Verification ready'
      ? 'The inventory meets the internal readiness criteria: every reported figure traces to evidence, the QA/QC checks pass, and all fifteen Scope 3 categories carry a documented decision.'
      : 'This inventory is not yet verification ready. Part 30 lists what an assurance provider would raise first, and Part 26 records every source excluded or not yet screened.');
  return parts;
}
