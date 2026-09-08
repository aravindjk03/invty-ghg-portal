export type ScopeType = 'scope-1' | 'scope-2' | 'scope-3' | 'biogenic' | 'memo';

export type Scope1Category = 
  | 'stationary_combustion'
  | 'mobile_combustion'
  | 'process_emissions'
  | 'fugitive_emissions'
  | 'agricultural_emissions';

export type Scope2Category =
  | 'purchased_electricity'
  | 'purchased_steam_heat_cooling'
  | 'market_instruments';

export type Scope3Category =
  | 'cat1_purchased_goods'
  | 'cat2_capital_goods'
  | 'cat3_fuel_energy'
  | 'cat4_upstream_transport'
  | 'cat5_waste_operations'
  | 'cat6_business_travel'
  | 'cat7_employee_commuting'
  | 'cat8_upstream_leased'
  | 'cat9_downstream_transport'
  | 'cat10_processing_sold'
  | 'cat11_use_sold_products'
  | 'cat12_end_of_life'
  | 'cat13_downstream_leased'
  | 'cat14_franchises'
  | 'cat15_investments';

export type DataQualityTier = 'Primary' | 'Secondary' | 'Proxy' | 'Estimated';
export type QualityGrade = 'A' | 'B' | 'C' | 'D' | 'E';

export interface EmissionFactor {
  id: string;
  fuelOrActivity: string;
  scope: ScopeType;
  category: string;
  /** GHG Protocol category number, e.g. '1.2' mobile combustion, '3.6' business travel. */
  ghgCategory: string;
  factorValue: number; // kgCO2e per unit
  unit: string;
  /** Pipe-separated units the factor may be entered in, e.g. 'kg|t|lb'. */
  allowedUnits?: string;
  source: string; // e.g. "DESNZ 2026", "CEA 2024", "IPCC AR6"
  publicationYear: number;
  qualityTier: DataQualityTier;
  gwpSet?: string;
  notes?: string;
}

export interface ActivityEntry {
  id: string;
  facility: string;
  scope: ScopeType;
  category: string;
  fuelOrSource: string;
  amount: number;
  unit: string;
  emissionFactor: EmissionFactor;
  calculatedTco2e: number;
  warning?: string;
  notes?: string;
  evidenceFile?: string;
  customFactorOverride?: number;
  updatedAt: string;
}

export interface ScopeSummary {
  scope1: number;
  scope2Location: number;
  scope2Market: number;
  /**
   * How the market-based figure was arrived at. 'instruments' means at least one
   * contractual instrument (PPA, green tariff, REC/I-REC, supplier-specific or
   * residual-mix rate) backs it; 'location-proxy' means none exist and the
   * location-based figure is standing in, which must be disclosed rather than
   * presented as a genuine dual-reported number.
   */
  scope2MarketBasis: 'instruments' | 'location-proxy';
  scope3: number;
  biogenicMemo: number;
  totalEmissions: number;
  dataQualityGrade: QualityGrade;
  coverage: {
    scopesCompleted: number;
    totalScopes: number;
    scope3CategoriesIncluded: number;
    totalScope3Categories: number;
  };
}

export interface WhatIfScenario {
  renewableElectricityPercent: number; // 0 - 100
  dieselReductionPercent: number;      // 0 - 50
  switchFleetToElectric: boolean;     // true/false
}

export interface ScenarioResult {
  baselineTotal: number;
  newTotal: number;
  deltaTco2e: number;
  deltaPercentage: number;
  scope1New: number;
  scope2New: number;
  scope3New: number;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  duration?: number;
}

export type DataEntryMode = 'guided' | 'csv' | 'quick';
