export type ScopeType = 'scope-1' | 'scope-2' | 'scope-3' | 'biogenic' | 'memo';

export type Scope1Category = 
  | 'stationary_combustion'
  | 'mobile_combustion'
  | 'process_emissions'
  | 'fugitive_emissions';

export type Scope2Category =
  | 'purchased_electricity_location'
  | 'purchased_electricity_market'
  | 'purchased_steam_heat';

export type Scope3CategoryNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

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
