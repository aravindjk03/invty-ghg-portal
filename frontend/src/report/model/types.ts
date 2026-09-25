/**
 * The shape of a verification-ready GHG inventory report.
 *
 * One type per part of the report, in the order the report presents them, so a
 * reader can follow the document and the code side by side. Nothing in here is
 * computed: `build/` fills these from the live inventory, and a field that the
 * organisation has not recorded stays empty so the report can say so instead of
 * inventing a figure.
 *
 * References: GHG Protocol Corporate Standard, Scope 2 Guidance, Corporate Value
 * Chain (Scope 3) Standard, ISO 14064-1:2018.
 */
import { ActivityEntry, Scope3Category } from '../../types/ghg';

// ── 1-3. Cover and document control ──────────────────────────────────────────

export interface CoverPage {
  title: string;
  companyName: string;
  facility: string;
  reportingPeriodLabel: string;
  periodStart: string;
  periodEnd: string;
  frameworks: string[];
  issueDate: string;
}

export interface DocumentControl {
  documentTitle: string;
  documentNumber: string;
  version: string;
  reportingYear: string;
  effectiveDate: string;
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  confidentiality: string;
  revisionHistory: RevisionEntry[];
}

export interface RevisionEntry {
  revision: string;
  date: string;
  description: string;
  author: string;
}

// ── 4. Executive summary ─────────────────────────────────────────────────────

export interface ExecutiveSummary {
  metrics: SummaryMetric[];
  largestSources: RankedSource[];
  narrative: string[];
}

export interface SummaryMetric {
  label: string;
  value: string;
  unit: string;
  /** Empty when the organisation has not recorded what this metric needs. */
  missingReason?: string;
}

export interface RankedSource {
  rank: number;
  source: string;
  scopeLabel: string;
  tco2e: number;
  shareOfTotal: number;
}

// ── 5-7. Objective, period, principles ───────────────────────────────────────

export interface ObjectiveAndScope {
  objective: string;
  purposes: string[];
  periodStart: string;
  periodEnd: string;
  baseYear: string;
  baseYearRationale: string;
  principles: { name: string; statement: string }[];
}

// ── 8-9. Boundaries ──────────────────────────────────────────────────────────

export interface OrganizationalBoundary {
  consolidationApproach: string;
  approachRationale: string;
  facilities: FacilityRecord[];
  /** Facilities named in the inventory that are absent from the facility list. */
  unlistedFacilities: string[];
}

export interface FacilityRecord {
  name: string;
  type: string;
  location: string;
  included: boolean;
  note: string;
  /** Parent entity, so the boundary can be drawn as a tree (report part 8). */
  parent?: string;
}

export interface OperationalBoundary {
  sources: SourceRegisterRow[];
}

export interface SourceRegisterRow {
  sourceId: string;
  source: string;
  scopeLabel: string;
  categoryLabel: string;
  facility: string;
  entryCount: number;
  tco2e: number;
}

// ── 10-15. The inventory itself ──────────────────────────────────────────────

export interface CategoryBlock {
  key: string;
  label: string;
  tco2e: number;
  shareOfScope: number;
  entries: ActivityEntry[];
  /** Set when the category is expected for this kind of site but has no data. */
  gapNote?: string;
}

/** Report part 13: one row per refrigerant-holding equipment item. */
export interface RefrigerantRow {
  equipment: string;
  refrigerant: string;
  gwp?: number;
  initialChargeKg?: number;
  rechargeKg?: number;
  recoveredKg?: number;
  lossKg?: number;
  tco2e?: number;
  method: string;
}

/** Report part 21: one row per calendar month of the reporting period. */
export interface MonthlyRow {
  month: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  recordCount: number;
  missing: boolean;
}

export interface MonthlySection {
  rows: MonthlyRow[];
  available: boolean;
  missingMonths: string[];
  observations: string[];
}

/** Report part 38: the statements a reviewer would challenge, tested against this report. */
export interface ReviewerFlag {
  statement: string;
  present: boolean;
  evidence: string;
}

export interface ScopeOneSection {
  total: number;
  stationary: CategoryBlock;
  mobile: CategoryBlock;
  process: CategoryBlock;
  fugitive: CategoryBlock;
  other: CategoryBlock[];
  fugitiveMethodNote: string;
  refrigerants: RefrigerantRow[];
}

export interface ScopeTwoSection {
  locationBased: number;
  marketBased: number;
  methodNote: string;
  guidanceVersion: string;
  contractualInstruments: string[];
  entries: ActivityEntry[];
}

export type Scope3Inclusion = 'included' | 'excluded_not_applicable' | 'excluded_no_data' | 'not_assessed';

export interface Scope3CategoryAssessment {
  number: number;
  key: Scope3Category;
  label: string;
  materiality: 'material' | 'low' | 'not_applicable' | 'not_assessed';
  inclusion: Scope3Inclusion;
  tco2e: number;
  /** Why it is in or out. "Not available" is never treated as "not applicable". */
  justification: string;
}

export interface ScopeThreeSection {
  total: number;
  assessment: Scope3CategoryAssessment[];
  categoriesIncluded: number;
  categoriesAssessed: number;
}

// ── 16-20. Methodology and registers ─────────────────────────────────────────

export interface MethodologySection {
  dataFlow: string[];
  formulas: { label: string; formula: string }[];
  gwpBasis: string;
  gwpNote: string;
  factorHierarchy: string[];
}

export interface EvidenceRow {
  id: string;
  source: string;
  dataType: string;
  frequency: string;
  evidence: string;
  hasEvidence: boolean;
}

export interface EmissionFactorRow {
  id: string;
  activity: string;
  factorValue: number;
  unit: string;
  source: string;
  publicationYear: number;
  qualityTier: string;
  gwpSet: string;
  ageYears: number;
  usedByEntries: number;
}

// ── 21-24. Analysis ──────────────────────────────────────────────────────────

export interface IntensitySection {
  indicators: IntensityIndicator[];
  productionOutput?: number;
  productionUnit: string;
  revenueCrore?: number;
}

export interface IntensityIndicator {
  label: string;
  value?: number;
  unit: string;
  missingReason?: string;
}

export interface TrendSection {
  rows: TrendRow[];
  commentary: string[];
  available: boolean;
}

export interface TrendRow {
  year: string;
  scope1: number;
  scope2Location: number;
  scope3: number;
  totalScope12: number;
  intensity?: number;
}

export interface EmissionsSummaryRow {
  category: string;
  tco2e: number;
  shareOfTotal: number;
  isSubtotal?: boolean;
}

// ── 25-30. Credibility ───────────────────────────────────────────────────────

export interface BaseYearSection {
  baseYear: string;
  baseYearEmissions?: number;
  recalculationThresholdPercent: number;
  triggers: string[];
  policyStatement: string;
}

export interface ExclusionRow {
  source: string;
  excluded: boolean;
  reason: string;
  estimatedSignificance: string;
  improvementAction: string;
  targetCompletion: string;
}

export interface DataQualityRow {
  source: string;
  accuracy: QualityRating;
  completeness: QualityRating;
  reliability: QualityRating;
  overall: QualityRating;
  basis: string;
}

export type QualityRating = 'High' | 'Medium' | 'Low';

export interface UncertaintyRow {
  band: 'High certainty' | 'Moderate certainty' | 'Lower certainty';
  dataType: string;
  sources: string[];
  tco2e: number;
  shareOfTotal: number;
}

export type CheckOutcome = 'pass' | 'attention' | 'fail' | 'not_possible';

export interface QaQcCheck {
  id: string;
  check: string;
  outcome: CheckOutcome;
  detail: string;
}

export interface VerificationReadiness {
  /** 0-100. How much of a verification-ready inventory is actually present. */
  score: number;
  level: 'Inventory' | 'Inventory report' | 'Verification ready';
  blockers: string[];
  strengths: string[];
}

// ── 31-33. Action ────────────────────────────────────────────────────────────

export interface MitigationRow {
  source: string;
  currentTco2e: number;
  action: string;
  estimatedReductionTco2e?: number;
  responsibility: string;
  targetYear: string;
}

export interface TargetSection {
  targets: GhgTarget[];
}

export interface GhgTarget {
  description: string;
  baseYear: string;
  targetYear: string;
  scopesCovered: string;
  baselineTco2e?: number;
  targetTco2e?: number;
  currentTco2e: number;
  reductionPercent: number;
  methodology: string;
  gapTco2e?: number;
  requiredAnnualReductionTco2e?: number;
}

// ── 35. Annexures ────────────────────────────────────────────────────────────

export interface Annexure {
  letter: string;
  title: string;
  /** Which report part holds the content, so the annexure never duplicates it. */
  contentRef: string;
  populated: boolean;
}

// ── The whole document ───────────────────────────────────────────────────────

export interface GhgInventoryReport {
  cover: CoverPage;
  documentControl: DocumentControl;
  executiveSummary: ExecutiveSummary;
  objective: ObjectiveAndScope;
  organizationalBoundary: OrganizationalBoundary;
  operationalBoundary: OperationalBoundary;
  scope1: ScopeOneSection;
  scope2: ScopeTwoSection;
  scope3: ScopeThreeSection;
  methodology: MethodologySection;
  evidenceRegister: EvidenceRow[];
  factorRegister: EmissionFactorRow[];
  emissionsSummary: EmissionsSummaryRow[];
  intensity: IntensitySection;
  trends: TrendSection;
  baseYear: BaseYearSection;
  exclusions: ExclusionRow[];
  dataQuality: DataQualityRow[];
  uncertainty: UncertaintyRow[];
  qaqc: QaQcCheck[];
  readiness: VerificationReadiness;
  mitigation: MitigationRow[];
  targets: TargetSection;
  monthly: MonthlySection;
  reviewerFlags: ReviewerFlag[];
  buildHierarchy: { level: number; name: string; question: string; status: string }[];
  annexures: Annexure[];
  definitions: { term: string; meaning: string }[];
  standards: { name: string; appliesTo: string }[];
}
