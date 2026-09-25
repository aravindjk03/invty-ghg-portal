/**
 * The facts a verifier needs that the inventory itself does not hold: document
 * control, the facility list, the base year, production output and targets.
 *
 * Every field starts EMPTY on purpose. The report says "not recorded" for
 * anything the organisation has not entered, because a plausible-looking
 * default in a GHG report is worse than a blank: it cannot be traced to
 * evidence, and an assurance provider will treat it as a misstatement.
 */
import { FacilityRecord, RefrigerantRow, RevisionEntry } from './types';

const STORAGE_KEY = 'INVTY_GHG_REPORT_META_V1';

export interface ReportMeta {
  // Document control (report part 3)
  documentNumber: string;
  version: string;
  effectiveDate: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  confidentiality: string;
  revisionHistory: RevisionEntry[];

  // Reporting period (part 6) — the label lives in the inventory itself
  periodStart: string;
  periodEnd: string;

  // Boundary (parts 8-9)
  facility: string;
  approachRationale: string;
  facilities: FacilityRecord[];

  // Scope 1 fugitive (part 13)
  refrigerants: RefrigerantRow[];

  // Scope 2 (part 14)
  scope2GuidanceVersion: string;
  contractualInstruments: string[];
  /** Share of electricity from contractual renewable instruments, 0-100. */
  renewableSharePercent?: number;

  // GWP basis (part 19)
  gwpBasis: string;

  // Base year (parts 6, 25)
  baseYear: string;
  baseYearEmissions?: number;
  baseYearRationale: string;
  recalculationThresholdPercent: number;

  // Normalisation (parts 22, 33)
  productionOutput?: number;
  productionUnit: string;
  revenueCrore?: number;

  // Trends (part 24) — prior years, entered once, never recalculated here
  priorYears: PriorYearRow[];

  // Targets and actions (parts 31-32)
  targets: TargetInput[];
  mitigations: MitigationInput[];

  // Exclusions the organisation has decided (part 26)
  exclusions: ExclusionInput[];
}

export interface PriorYearRow {
  year: string;
  scope1: number;
  scope2Location: number;
  scope3: number;
  productionOutput?: number;
}

export interface TargetInput {
  description: string;
  baseYear: string;
  targetYear: string;
  scopesCovered: string;
  baselineTco2e?: number;
  reductionPercent: number;
  methodology: string;
}

export interface MitigationInput {
  source: string;
  action: string;
  estimatedReductionTco2e?: number;
  responsibility: string;
  targetYear: string;
}

export interface ExclusionInput {
  source: string;
  reason: string;
  estimatedSignificance: string;
  improvementAction: string;
  targetCompletion: string;
}

export const EMPTY_REPORT_META: ReportMeta = {
  documentNumber: '',
  version: '',
  effectiveDate: '',
  preparedBy: '',
  reviewedBy: '',
  approvedBy: '',
  confidentiality: 'Internal / Controlled',
  revisionHistory: [],

  periodStart: '',
  periodEnd: '',

  facility: '',
  approachRationale: '',
  facilities: [],

  refrigerants: [],
  scope2GuidanceVersion: 'GHG Protocol Scope 2 Guidance (2015), as published',
  contractualInstruments: [],
  renewableSharePercent: undefined,

  gwpBasis: '',

  baseYear: '',
  baseYearEmissions: undefined,
  baseYearRationale: '',
  recalculationThresholdPercent: 5,

  productionOutput: undefined,
  productionUnit: 'tonnes of finished product',
  revenueCrore: undefined,

  priorYears: [],
  targets: [],
  mitigations: [],
  exclusions: [],
};

export function loadReportMeta(): ReportMeta {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_REPORT_META;
    return { ...EMPTY_REPORT_META, ...(JSON.parse(raw) as Partial<ReportMeta>) };
  } catch {
    return EMPTY_REPORT_META;
  }
}

export function saveReportMeta(meta: ReportMeta): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Storage can be unavailable (private window, blocked site data). The report
    // still renders from whatever is in memory.
  }
}

/** Fields that must be filled before the report can claim to be verification ready. */
export const REQUIRED_FOR_VERIFICATION: { field: keyof ReportMeta; label: string }[] = [
  { field: 'documentNumber', label: 'Document number' },
  { field: 'version', label: 'Document version' },
  { field: 'preparedBy', label: 'Prepared by' },
  { field: 'reviewedBy', label: 'Reviewed by' },
  { field: 'approvedBy', label: 'Approved by' },
  { field: 'periodStart', label: 'Reporting period start' },
  { field: 'periodEnd', label: 'Reporting period end' },
  { field: 'facilities', label: 'Facility list' },
  { field: 'approachRationale', label: 'Consolidation approach rationale' },
  { field: 'gwpBasis', label: 'GWP basis' },
  { field: 'baseYear', label: 'Base year' },
  { field: 'productionOutput', label: 'Production output for intensity' },
];

export function missingMetaFields(meta: ReportMeta): string[] {
  return REQUIRED_FOR_VERIFICATION.filter(({ field }) => {
    const value = meta[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || String(value).trim() === '';
  }).map(({ label }) => label);
}
