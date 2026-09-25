/**
 * Report part 36: the calculation workbook.
 *
 * The PDF is not the engine. This exports the controlled calculation system as
 * numbered sheets — cover, document control, boundaries, source register, each
 * Scope 1 sub-category, Scope 2 under both methods, all fifteen Scope 3
 * categories, factors, GWP, quality, uncertainty, QA/QC, base year, exclusions,
 * summary, intensity, trends, targets, actions, evidence and the dashboard — so
 * a verifier can reproduce every figure in the report from one file.
 */
import * as XLSX from 'xlsx';
import { ActivityEntry } from '../../types/ghg';
import { SCOPE3_CATEGORIES } from '../build/aggregate';
import { GhgInventoryReport } from '../model/types';

type Row = Record<string, string | number | undefined>;

const entryRows = (entries: ActivityEntry[]): Row[] =>
  entries.map((entry) => ({
    'Record ID': entry.id,
    Month: entry.periodMonth ?? '',
    Facility: entry.facility,
    Source: entry.fuelOrSource,
    'Activity data': entry.amount,
    Unit: entry.unit,
    'Factor ID': entry.emissionFactor?.id ?? '',
    'Factor value': entry.customFactorOverride ?? entry.emissionFactor?.factorValue ?? '',
    'Factor unit': entry.emissionFactor?.unit ?? '',
    'Factor source': entry.emissionFactor?.source ?? '',
    'Factor year': entry.emissionFactor?.publicationYear ?? '',
    'Quality tier': entry.emissionFactor?.qualityTier ?? '',
    'Emissions tCO2e': entry.calculatedTco2e,
    'Data owner': entry.dataOwner ?? '',
    Evidence: entry.evidenceFile ?? '',
    Warning: entry.warning ?? '',
    'Last updated': entry.updatedAt,
  }));

/** Excel sheet names are capped at 31 characters. */
const sheetName = (name: string): string => name.slice(0, 31);

export function exportWorkbook(
  report: GhgInventoryReport,
  entries: { scope1: ActivityEntry[]; scope2: ActivityEntry[]; scope3: ActivityEntry[] },
  filename: string,
): void {
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: Row[]) => {
    const sheet = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No data recorded' }]);
    XLSX.utils.book_append_sheet(book, sheet, sheetName(name));
  };

  add('01_Cover', [
    { Field: 'Report', Value: report.cover.title },
    { Field: 'Company', Value: report.cover.companyName },
    { Field: 'Facility', Value: report.cover.facility },
    { Field: 'Reporting period', Value: report.cover.reportingPeriodLabel },
    { Field: 'Period start', Value: report.cover.periodStart },
    { Field: 'Period end', Value: report.cover.periodEnd },
    { Field: 'Frameworks', Value: report.cover.frameworks.join('; ') },
    { Field: 'Issue date', Value: report.cover.issueDate },
    { Field: 'Assurance readiness', Value: `${report.readiness.score}/100 — ${report.readiness.level}` },
  ]);

  const dc = report.documentControl;
  add('02_Document_Control', [
    { Field: 'Document number', Value: dc.documentNumber },
    { Field: 'Version', Value: dc.version },
    { Field: 'Effective date', Value: dc.effectiveDate },
    { Field: 'Prepared by', Value: dc.preparedBy },
    { Field: 'Reviewed by', Value: dc.reviewedBy },
    { Field: 'Approved by', Value: dc.approvedBy },
    { Field: 'Confidentiality', Value: dc.confidentiality },
    ...dc.revisionHistory.map((revision) => ({
      Field: `Revision ${revision.revision}`,
      Value: `${revision.date} — ${revision.description} (${revision.author})`,
    })),
  ]);

  add('03_Organizational_Boundary', [
    { Field: 'Consolidation approach', Value: report.organizationalBoundary.consolidationApproach },
    { Field: 'Rationale', Value: report.organizationalBoundary.approachRationale },
    ...report.organizationalBoundary.facilities.map((facility) => ({
      Field: facility.name,
      Value: `${facility.type}, ${facility.location}, ${facility.included ? 'included' : 'excluded'} — ${facility.note}`,
    })),
  ]);

  add('04_Operational_Boundary', report.operationalBoundary.sources.map((source) => ({
    'Source ID': source.sourceId, Source: source.source, Scope: source.scopeLabel,
    Category: source.categoryLabel, Facility: source.facility,
    Records: source.entryCount, 'tCO2e': source.tco2e,
  })));

  add('05_Emission_Source_Register', report.evidenceRegister.map((row) => ({
    ID: row.id, Source: row.source, 'Data type': row.dataType,
    Frequency: row.frequency, Evidence: row.evidence, Traceable: row.hasEvidence ? 'Yes' : 'No',
  })));

  add('06_Scope_1_Stationary', entryRows(report.scope1.stationary.entries));
  add('07_Scope_1_Mobile', entryRows(report.scope1.mobile.entries));
  add('08_Scope_1_Process', entryRows(report.scope1.process.entries));
  add('09_Scope_1_Fugitive', [
    ...entryRows(report.scope1.fugitive.entries),
    ...report.scope1.refrigerants.map((row) => ({
      'Record ID': 'REFRIG', Source: row.equipment, Unit: 'kg',
      'Factor source': row.refrigerant, 'Factor value': row.gwp,
      'Activity data': row.lossKg, 'Emissions tCO2e': row.tco2e, Warning: row.method,
    })),
  ]);

  add('10_Scope_2_Electricity', entryRows(report.scope2.entries));
  add('11_Scope_2_Location', [{ Method: 'Location-based', 'tCO2e': report.scope2.locationBased }]);
  add('12_Scope_2_Market', [
    { Method: 'Market-based', 'tCO2e': report.scope2.marketBased },
    { Method: 'Contractual instruments', 'tCO2e': report.scope2.contractualInstruments.join('; ') || 'None recorded' },
    { Method: 'Guidance version', 'tCO2e': report.scope2.guidanceVersion },
  ]);

  SCOPE3_CATEGORIES.forEach((category, index) => {
    const assessment = report.scope3.assessment[index];
    const categoryEntries = entries.scope3.filter((entry) => entry.category === category.key);
    add(`${13 + index}_Scope_3_Cat_${String(category.number).padStart(2, '0')}`, [
      { Field: 'Category', Value: category.label },
      { Field: 'Materiality', Value: assessment.materiality },
      { Field: 'Status', Value: assessment.inclusion },
      { Field: 'tCO2e', Value: assessment.tco2e },
      { Field: 'Basis', Value: assessment.justification },
      ...entryRows(categoryEntries) as Row[],
    ]);
  });

  add('29_Emission_Factors', report.factorRegister.map((factor) => ({
    'Factor ID': factor.id, Activity: factor.activity, Value: factor.factorValue,
    Unit: factor.unit, Source: factor.source, Year: factor.publicationYear,
    'Age (years)': factor.ageYears < 0 ? 'unknown' : factor.ageYears,
    Tier: factor.qualityTier, 'GWP set': factor.gwpSet, 'Used by records': factor.usedByEntries,
  })));

  add('30_GWP', [
    { Field: 'GWP basis', Value: report.methodology.gwpBasis },
    { Field: 'Note', Value: report.methodology.gwpNote },
  ]);

  add('31_Data_Quality', report.dataQuality.map((row) => ({
    Source: row.source, Accuracy: row.accuracy, Completeness: row.completeness,
    Reliability: row.reliability, Overall: row.overall, Basis: row.basis,
  })));

  add('32_Uncertainty', report.uncertainty.map((row) => ({
    Band: row.band, 'Data type': row.dataType, Sources: row.sources.join('; '),
    'tCO2e': row.tco2e, 'Share %': row.shareOfTotal,
  })));

  add('33_QA_QC', report.qaqc.map((check) => ({
    ID: check.id, Check: check.check, Result: check.outcome, Detail: check.detail,
  })));

  add('34_Base_Year', [
    { Field: 'Base year', Value: report.baseYear.baseYear },
    { Field: 'Base year emissions', Value: report.baseYear.baseYearEmissions ?? 'Not recorded' },
    { Field: 'Threshold %', Value: report.baseYear.recalculationThresholdPercent },
    { Field: 'Policy', Value: report.baseYear.policyStatement },
    ...report.baseYear.triggers.map((trigger, index) => ({ Field: `Trigger ${index + 1}`, Value: trigger })),
  ]);

  add('35_Exclusions', report.exclusions.map((row) => ({
    Source: row.source, Reason: row.reason, Significance: row.estimatedSignificance,
    'Improvement action': row.improvementAction, Target: row.targetCompletion,
  })));

  add('36_GHG_Summary', report.emissionsSummary.map((row) => ({
    Category: row.category, 'tCO2e': row.tco2e, 'Share %': row.shareOfTotal,
  })));

  add('37_Intensity', report.intensity.indicators.map((indicator) => ({
    Indicator: indicator.label, Value: indicator.value ?? indicator.missingReason, Unit: indicator.unit,
  })));

  add('38_Trends', report.trends.rows.map((row) => ({
    Year: row.year, 'Scope 1': row.scope1, 'Scope 2 location': row.scope2Location,
    'Scope 3': row.scope3, 'Total S1+2': row.totalScope12, Intensity: row.intensity ?? '',
  })));

  add('39_Reduction_Targets', report.targets.targets.map((target) => ({
    Target: target.description, 'Base year': target.baseYear, 'Target year': target.targetYear,
    Scopes: target.scopesCovered, Baseline: target.baselineTco2e ?? '',
    'Target level': target.targetTco2e ?? '', Current: target.currentTco2e,
    Gap: target.gapTco2e ?? '', 'Required annual reduction': target.requiredAnnualReductionTco2e ?? '',
    Methodology: target.methodology,
  })));

  add('40_Mitigation_Actions', report.mitigation.map((row) => ({
    Source: row.source, 'Current tCO2e': row.currentTco2e, Action: row.action,
    'Estimated reduction': row.estimatedReductionTco2e ?? '',
    Responsibility: row.responsibility, 'Target year': row.targetYear,
  })));

  add('41_Evidence_Register', report.evidenceRegister.map((row) => ({
    ID: row.id, Source: row.source, 'Data type': row.dataType, Frequency: row.frequency,
    Evidence: row.evidence, Traceable: row.hasEvidence ? 'Yes' : 'No',
  })));

  add('42_Management_Dashboard', [
    { Metric: 'Scope 1', Value: report.scope1.total },
    { Metric: 'Scope 2 location-based', Value: report.scope2.locationBased },
    { Metric: 'Scope 2 market-based', Value: report.scope2.marketBased },
    { Metric: 'Scope 3', Value: report.scope3.total },
    { Metric: 'Total Scope 1 + 2', Value: report.scope1.total + report.scope2.locationBased },
    { Metric: 'Total Scope 1 + 2 + 3',
      Value: report.scope1.total + report.scope2.locationBased + report.scope3.total },
    ...report.executiveSummary.largestSources.map((source) => ({
      Metric: `Largest source ${source.rank}`, Value: `${source.source} — ${source.tco2e.toFixed(1)} tCO2e`,
    })),
    { Metric: 'Assurance readiness', Value: `${report.readiness.score}/100 — ${report.readiness.level}` },
  ]);

  // Monthly analysis sits with the dashboard rather than taking its own number,
  // because the format numbers sheets 01-42.
  add('43_Monthly_Analysis', report.monthly.rows.map((row) => ({
    Month: row.month, 'Scope 1': row.scope1, 'Scope 2': row.scope2, 'Scope 3': row.scope3,
    Total: row.total, Records: row.recordCount, 'Data present': row.missing ? 'No' : 'Yes',
  })));

  XLSX.writeFile(book, filename);
}
