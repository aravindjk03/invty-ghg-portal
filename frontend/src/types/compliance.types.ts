// Compliance, IoT, and Audit Trail Type Definitions

// -------------------------------------------------------------
// 1. EU CBAM (Carbon Border Adjustment Mechanism)
// -------------------------------------------------------------
export type CBAMSector = 'steel' | 'aluminium' | 'cement' | 'fertilisers';

export interface CBAMGood {
  cnCode: string;
  name: string;
  sector: CBAMSector;
  defaultBenchmarkDirect: number; // tCO2e / t product
  defaultBenchmarkIndirect: number; // tCO2e / t product
}

export interface CBAMInstallation {
  installationName: string;
  countryCode: string; // e.g. "IN"
  unLocode: string; // e.g. "INJAI"
  coordinates: string; // e.g. "22.8046 N, 86.2029 E"
  operatorName: string;
  technologyRoute: string; // e.g. "BF-BOF", "EAF", "DRI", "Rotary Kiln"
}

export interface CBAMCalculationInput {
  sector: CBAMSector;
  cnCode: string;
  productionVolumeTonnes: number;
  scope1AttributedTco2e: number;
  scope2AttributedTco2e: number;
  carbonPricePaidInOriginEurPerTonne?: number; // Carbon tax / domestic ETS paid
  reportingPeriodQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  reportingYear: number;
}

export interface CBAMCalculationResult {
  cnCode: string;
  productionVolumeTonnes: number;
  directEmbeddedSpecific: number; // tCO2e / tonne product
  indirectEmbeddedSpecific: number; // tCO2e / tonne product
  totalEmbeddedSpecific: number; // tCO2e / tonne product
  totalEmbeddedEmissions: number; // tCO2e total
  euBenchmarkSpecific: number; // benchmark tCO2e / tonne
  benchmarkDeltaPercentage: number; // % above or below benchmark
  isBenchmarkBreached: boolean;
  effectiveCarbonPricePaidEur: number;
  estimatedCbamCertificatesRequired: number;
  xmlPreview: string;
}

// -------------------------------------------------------------
// 2. SEBI BRSR Core (Principle 6 GHG Disclosures)
// -------------------------------------------------------------
export interface BRSRCoreInput {
  financialYear: string; // e.g. "FY 2024-25"
  turnoverInCroresINR: number;
  physicalOutputTonnes: number;
  outputMetricName: string; // e.g. "Crude Steel", "Cement Clinker"
  scope1TotalTco2e: number;
  scope2LocationTco2e: number;
  scope2MarketTco2e: number;
  scope3TotalTco2e: number;
  assuranceType: 'Reasonable Assurance' | 'Limited Assurance' | 'Internal Audit Only';
  assuranceAgency?: string; // e.g. "DNV", "TUV SUD", "EY"
}

export interface BRSRCoreResult {
  financialYear: string;
  turnoverInCroresINR: number;
  physicalOutputTonnes: number;
  scope1: number;
  scope2Location: number;
  scope2Market: number;
  scope3: number;
  grossEmissionsLocation: number;
  grossEmissionsMarket: number;
  turnoverIntensityLocation: number; // tCO2e / Crore INR
  turnoverIntensityMarket: number; // tCO2e / Crore INR
  productionIntensityLocation: number; // tCO2e / physical unit
  productionIntensityMarket: number; // tCO2e / physical unit
  assuranceStatus: string;
  xbrlXmlPreview: string;
  sebiComplianceStatus: 'Fully Compliant' | 'Pending Value Chain Scope 3' | 'Under Review';
}

// -------------------------------------------------------------
// 3. CEMS (Continuous Emission Monitoring Systems) IoT Ingestion
// -------------------------------------------------------------
export interface CEMSReading {
  id: string;
  stackId: string;
  stackName: string;
  timestamp: string;
  flueGasVelocityMs: number; // m/s
  volumetricFlowNm3h: number; // Nm3/hr
  temperatureCelsius: number;
  o2Percentage: number; // %
  co2Percentage: number; // %
  coMgNm3: number; // mg/Nm3
  so2MgNm3: number; // mg/Nm3
  noxMgNm3: number; // mg/Nm3
  pmMgNm3: number; // Particulate Matter mg/Nm3
  calculatedCo2MassRateTonnePerHour: number; // tCO2/hr
  status: 'NORMAL' | 'SPIKE_WARNING' | 'FLATLINE_ERROR' | 'O2_DRIFT';
  anomalyNote?: string;
}

export interface CEMSStackSummary {
  stackId: string;
  stackName: string;
  totalOperatingHours: number;
  cumulativeCo2Tco2e: number;
  averageFlowNm3h: number;
  activeAlerts: number;
  fuelMassBalanceDeviationPercent: number; // Comparison with Scope 1 fuel logs
}

// -------------------------------------------------------------
// 4. Scope 3 Supplier Engagement ("Magic Links")
// -------------------------------------------------------------
export interface SupplierInvitation {
  id: string;
  token: string;
  supplierName: string;
  supplierEmail: string;
  scope3CategoryNumber: number; // 1 through 15
  categoryName: string;
  requestedItemDescription: string;
  purchaseOrderRef?: string;
  status: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  expiresAt: string;
  createdAt: string;
  submission?: SupplierSubmission;
}

export interface SupplierSubmission {
  supplierName: string;
  supplierCompanyPanOrEin: string;
  reportingPeriod: string;
  providedQuantity: number;
  providedUnit: string;
  primaryEmissionFactor: number;
  factorUnit: string;
  factorDataSource: string; // e.g. "Product Carbon Footprint ISO 14067", "Supplier EPD"
  calculatedTco2e: number;
  evidenceFileName?: string;
  submittedAt: string;
  verifiedBy?: string;
}

// -------------------------------------------------------------
// 5. Cryptographic SHA-256 Audit Trail (ISO 14064-3)
// -------------------------------------------------------------
export interface AuditBlock {
  blockIndex: number;
  timestamp: string;
  action: 'GENESIS' | 'CREATE_ENTRY' | 'UPDATE_ENTRY' | 'DELETE_ENTRY' | 'FACTOR_OVERRIDE' | 'SUPPLIER_OVERRIDE';
  entityId: string;
  actor: string; // e.g. "System Auto-Ingest", "user@company.com", "External Auditor"
  payloadSummary: string;
  previousBlockHash: string;
  blockHash: string; // SHA-256(blockIndex + timestamp + action + entityId + payload + previousBlockHash)
}

export interface AuditVerificationReport {
  isChainValid: boolean;
  totalBlocks: number;
  genesisTimestamp: string;
  lastBlockTimestamp: string;
  lastBlockHash: string;
  tamperedBlockIndex?: number;
  deterministicRecalculationPassed: boolean;
  deltaTco2eFromEngine: number;
  isoStandard: 'ISO 14064-3:2019';
  verifiedAt: string;
}
