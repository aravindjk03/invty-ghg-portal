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
  factorValue: number; // kgCO2e per unit
  unit: string;
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
  /** The same row under the market-based method, in tonnes. Scope 2 only:
   *  the Guidance reports one purchase of electricity twice, and a row that
   *  showed only one of the two figures would hide half of what it did. */
  marketTco2e?: number;
  /** Where that factor came from: a contract, a certificate, a supplier's EPD.
   *  The engine refuses a supplied factor without it, because an unsourced
   *  number is indistinguishable from an invented one. */
  customFactorSource?: string;
  /** YYYY-MM. Enables monthly analysis and the missing-month QA/QC check. */
  periodMonth?: string;
  /**
   * The activity key in the published factor library (DESNZ, CEA). When set,
   * ghg_core calculates this row gas by gas under the chosen GWP set; without
   * it the row cannot be calculated from published data.
   */
  engineActivityKey?: string;
  /** The factor the engine actually used, and where it came from. The
   *  catalogue ships a value of its own for the picker; printing THAT in a
   *  report puts a number beside a total it did not produce. */
  engineFactorValue?: number;
  engineFactorSource?: string;
  engineFactorUnit?: string;
  /** True when the user picked that factor themselves rather than letting the
   *  catalogue map attach it. A choice they made is never overwritten; one the
   *  map made is re-checked, so a row saved before a mapping was corrected
   *  does not keep calculating against the old factor for ever. */
  factorChosenByUser?: boolean;
  /** Region the factor applies to, e.g. IN or UK. */
  engineRegion?: string;
  /** Who owns this data in the organisation; shown in the evidence register. */
  dataOwner?: string;
  updatedAt: string;
}

export interface ScopeSummary {
  scope1: number;
  scope2Location: number;
  scope2Market: number;
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
