/**
 * Report parts 38-39: the reviewer's red flags, and the build hierarchy.
 *
 * Part 38 lists the statements an expert reviewer would question. Each one is
 * tested against this report, so the document shows whether it commits the
 * weakness or answers it — before an assurance provider does the same.
 */
import { GhgInventoryReport, ReviewerFlag } from '../model/types';

export function buildReviewerFlags(report: Omit<GhgInventoryReport,
'reviewerFlags' | 'buildHierarchy' | 'annexures'>): ReviewerFlag[] {
  const boundaryShown = report.organizationalBoundary.facilities.length > 0;
  const factorsCited = report.factorRegister.length > 0
    && report.factorRegister.every((factor) => factor.source !== 'Not recorded');
  const scope3Assessed = report.scope3.categoriesAssessed === 15;
  const refrigerantMethod = report.scope1.refrigerants.length > 0
    ? report.scope1.refrigerants.every((row) => Boolean(row.method))
    : report.scope1.fugitive.entries.length === 0;
  const scope2Documented = report.scope2.marketBased >= report.scope2.locationBased
    || report.scope2.contractualInstruments.length > 0;
  const exclusionsDocumented = report.exclusions.every(
    (row) => !row.reason.startsWith('No activity data recorded and no exclusion decision'));
  const gwpStated = report.methodology.gwpBasis !== 'Not recorded';
  const evidenceComplete = report.evidenceRegister.length > 0
    && report.evidenceRegister.every((row) => row.hasEvidence);

  return [
    {
      statement: '"Total carbon footprint = X tonnes" without showing the boundary',
      present: !boundaryShown,
      evidence: boundaryShown
        ? `Part 8 lists ${report.organizationalBoundary.facilities.length} facilities and the consolidation approach.`
        : 'No facility list has been recorded, so the totals are reported without a documented boundary.',
    },
    {
      statement: '"Electricity emission factor = 0.82" without citing the source or version',
      present: !factorsCited,
      evidence: factorsCited
        ? 'Every factor in Part 18 carries a source and publication year.'
        : 'One or more factors in Part 18 have no cited source.',
    },
    {
      statement: '"Scope 3 calculated based on assumptions" without methodology',
      present: report.scope3.total > 0 && !scope3Assessed,
      evidence: scope3Assessed
        ? 'All fifteen categories carry a documented decision in Part 15.'
        : `${15 - report.scope3.categoriesAssessed} categories have no screening decision recorded.`,
    },
    {
      statement: '"Refrigerant emissions = refrigerant purchased" without a calculation basis',
      present: !refrigerantMethod,
      evidence: refrigerantMethod
        ? 'The calculation method is stated for each refrigerant item in Part 13.'
        : 'Fugitive emissions are reported without stating the calculation method used.',
    },
    {
      statement: '"Zero emissions because renewable energy was purchased" without the Scope 2 treatment',
      present: !scope2Documented,
      evidence: scope2Documented
        ? 'Part 14 reports both methods and names the contractual instruments.'
        : 'The market-based figure is lower than location-based, with no instrument documented.',
    },
    {
      statement: '"Scope 3 not applicable" with no category-by-category assessment',
      present: !scope3Assessed,
      evidence: scope3Assessed
        ? 'Part 15 assesses each of the fifteen categories individually.'
        : 'Categories are listed as not assessed rather than judged applicable or not.',
    },
    {
      statement: '"Data unavailable" without an estimation or exclusion methodology',
      present: !exclusionsDocumented,
      evidence: exclusionsDocumented
        ? 'Every exclusion in Part 26 carries a reason, a significance estimate and an improvement action.'
        : 'One or more sources are absent with no documented exclusion decision.',
    },
    {
      statement: 'CO2e reported without stating the GWP basis',
      present: !gwpStated,
      evidence: gwpStated
        ? `Part 19 states the GWP basis: ${report.methodology.gwpBasis}.`
        : 'No GWP basis is recorded, so the CO2e conversion cannot be reproduced.',
    },
    {
      statement: 'Figures that cannot be traced back to an original record',
      present: !evidenceComplete,
      evidence: evidenceComplete
        ? 'Every source in Part 17 has an attached document.'
        : `${report.evidenceRegister.filter((row) => !row.hasEvidence).length} source(s) have no evidence attached.`,
    },
  ];
}

/** Part 39: the order in which the inventory is built, and where this one stands. */
export function buildHierarchy(report: Omit<GhgInventoryReport,
'reviewerFlags' | 'buildHierarchy' | 'annexures'>): { level: number; name: string; question: string; status: string }[] {
  const done = (condition: boolean, whenDone: string, whenNot: string) => (condition ? whenDone : whenNot);
  const traced = report.evidenceRegister.filter((row) => row.hasEvidence).length;

  return [
    { level: 1, name: 'Boundary', question: 'Which organisation and facilities are covered?',
      status: done(report.organizationalBoundary.facilities.length > 0,
        `${report.organizationalBoundary.facilities.length} facilities listed`, 'No facility list recorded') },
    { level: 2, name: 'Source identification', question: 'What emits greenhouse gases?',
      status: `${report.operationalBoundary.sources.length} sources in the register` },
    { level: 3, name: 'Activity data', question: 'How much fuel, electricity, material or travel occurred?',
      status: `${report.evidenceRegister.length} data streams collected` },
    { level: 4, name: 'Emission factors', question: 'Which published factors apply?',
      status: `${report.factorRegister.length} factors in use` },
    { level: 5, name: 'Calculation', question: 'Convert activity into emissions by gas.',
      status: 'Engine applies activity data × factor in exact arithmetic' },
    { level: 6, name: 'CO2e conversion', question: 'Apply the documented GWP basis.',
      status: done(report.methodology.gwpBasis !== 'Not recorded',
        report.methodology.gwpBasis, 'GWP basis not recorded') },
    { level: 7, name: 'QA/QC', question: 'Can the numbers be trusted?',
      status: `${report.qaqc.filter((check) => check.outcome === 'pass').length} of ${report.qaqc.length} checks pass` },
    { level: 8, name: 'Consolidation', question: 'Scope 1 + Scope 2 + Scope 3.',
      status: `${(report.scope1.total + report.scope2.locationBased + report.scope3.total).toFixed(1)} tCO2e reported` },
    { level: 9, name: 'Analysis', question: 'Why did emissions change?',
      status: done(report.trends.available, 'Trend comparison available', 'Only one period held; no trend yet') },
    { level: 10, name: 'Action', question: 'What will reduce emissions?',
      status: done(report.mitigation.length > 0,
        `${report.mitigation.length} reduction measures recorded`, 'No reduction measures recorded') },
    { level: 11, name: 'Assurance', question: 'Can an independent verifier reproduce the inventory?',
      status: `${traced} of ${report.evidenceRegister.length} sources traceable — ${report.readiness.level}` },
  ];
}
