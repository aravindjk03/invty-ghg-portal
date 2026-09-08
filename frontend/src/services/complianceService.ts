import { request } from './api';

/**
 * Client for the compliance endpoints.
 *
 * Every call resolves to `{ data, source }` rather than throwing: the server is
 * authoritative when reachable, and the caller keeps its local computation as
 * the offline path. `source` lets the UI say which one produced the figures,
 * which matters when the output is a regulatory filing.
 */
export type ResultSource = 'api' | 'local';

export interface ServedResult<T> {
  data: T;
  source: ResultSource;
}

async function withFallback<T>(call: () => Promise<T>, fallback: () => T): Promise<ServedResult<T>> {
  try {
    return { data: await call(), source: 'api' };
  } catch {
    return { data: fallback(), source: 'local' };
  }
}

// ---------------------------------------------------------------- CBAM

export interface CbamRequest {
  sector: 'steel' | 'aluminium' | 'cement' | 'fertilisers';
  cnCode: string;
  goodsDescription: string;
  productionVolumeTonnes: number;
  scope1AttributedTco2e: number;
  scope2AttributedTco2e: number;
  carbonPricePaidEurPerTonne?: number;
  reportingQuarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  reportingYear: number;
  installationName?: string;
  countryCode?: string;
  unLocode?: string;
}

export interface CbamResult {
  cnCode: string;
  goodsDescription: string;
  productionVolumeTonnes: number;
  directEmbeddedSpecific: number;
  indirectEmbeddedSpecific: number;
  totalEmbeddedSpecific: number;
  totalEmbeddedEmissions: number;
  euBenchmarkSpecific: number;
  benchmarkDeltaPercentage: number;
  isBenchmarkBreached: boolean;
  effectiveCarbonPricePaidEur: number;
  estimatedCbamCertificatesRequired: number;
  estimatedCertificatesCostEur: number;
  xmlPreview: string;
}

// ---------------------------------------------------------------- BRSR

export interface BrsrRequest {
  financialYear: string;
  turnoverInCroresINR: number;
  physicalOutputTonnes: number;
  outputMetricName: string;
  scope1TotalTco2e: number;
  scope2LocationTco2e: number;
  scope2MarketTco2e: number;
  scope3TotalTco2e: number;
  companyName?: string;
  cinNumber?: string;
  assuranceType: 'Reasonable Assurance' | 'Limited Assurance' | 'Internal Audit Only';
  assuranceAgency?: string;
}

// ---------------------------------------------------------------- CEMS

export interface CemsStackSummary {
  stackId: string;
  stackName: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------- Audit

export interface AuditBlock {
  index: number;
  timestamp: string;
  action: string;
  entityId: string;
  payloadSummary: string;
  actor?: string;
  previousHash: string;
  hash: string;
}

export interface ChainIntegrityReport {
  isValid: boolean;
  totalBlocks: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------- Suppliers

export interface SupplierInvitation {
  id: string;
  token: string;
  supplierName: string;
  supplierEmail: string;
  scope3CategoryNumber: number;
  categoryName: string;
  requestedItemDescription: string;
  status: string;
  [key: string]: unknown;
}

export const complianceService = {
  calculateCbam(payload: CbamRequest, fallback: () => CbamResult) {
    return withFallback(
      () => request<CbamResult>('/cbam/calculate', { method: 'POST', body: JSON.stringify(payload) }),
      fallback
    );
  },

  calculateBrsr<T>(payload: BrsrRequest, fallback: () => T) {
    return withFallback(
      () => request<T>('/brsr/calculate', { method: 'POST', body: JSON.stringify(payload) }),
      fallback
    );
  },

  getCemsSummary<T>(fuelBurnTonnes: number, fallback: () => T) {
    return withFallback(
      () => request<T>(`/cems/summary?fuelBurn=${encodeURIComponent(fuelBurnTonnes)}`),
      fallback
    );
  },

  getAuditLedger(fallback: () => AuditBlock[]) {
    return withFallback(() => request<AuditBlock[]>('/audit/ledger'), fallback);
  },

  verifyAuditChain(fallback: () => ChainIntegrityReport) {
    return withFallback(() => request<ChainIntegrityReport>('/audit/verify'), fallback);
  },

  recordAuditBlock(payload: {
    action: 'CREATE_ENTRY' | 'UPDATE_ENTRY' | 'DELETE_ENTRY' | 'FACTOR_OVERRIDE' | 'SUPPLIER_OVERRIDE';
    entityId: string;
    payloadSummary: string;
    actor?: string;
  }) {
    return request<AuditBlock>('/audit/record', { method: 'POST', body: JSON.stringify(payload) });
  },

  getSupplierInvitations(fallback: () => SupplierInvitation[]) {
    return withFallback(() => request<SupplierInvitation[]>('/suppliers/invitations'), fallback);
  },

  createSupplierInvitation(payload: {
    supplierName: string;
    supplierEmail: string;
    scope3CategoryNumber: number;
    categoryName: string;
    requestedItemDescription: string;
    purchaseOrderRef?: string;
  }) {
    return request<SupplierInvitation>('/suppliers/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
