import { EmissionFactor } from '../types/ghg.types';

export class FactorsService {
  private static factors: EmissionFactor[] = [
    // Scope 1: Stationary Combustion
    {
      id: 'EF-DSL-STATIONARY',
      fuelOrActivity: 'Diesel (Stationary)',
      scope: 'scope-1',
      category: 'stationary_combustion',
      factorValue: 2.6865, // kgCO2e/L
      unit: 'L',
      source: 'DESNZ 2026 / MoPNG',
      publicationYear: 2026,
      qualityTier: 'Primary',
      notes: 'For captive power generation (DG sets) and plant heating',
    },
    {
      id: 'EF-NG-STATIONARY',
      fuelOrActivity: 'Natural Gas',
      scope: 'scope-1',
      category: 'stationary_combustion',
      factorValue: 2.0282, // kgCO2e/m3
      unit: 'm³',
      source: 'DESNZ 2026',
      publicationYear: 2026,
      qualityTier: 'Primary',
      notes: 'Piped natural gas for re-heating furnaces',
    },
    {
      id: 'EF-LPG-STATIONARY',
      fuelOrActivity: 'LPG',
      scope: 'scope-1',
      category: 'stationary_combustion',
      factorValue: 2.9431, // kgCO2e/kg
      unit: 'kg',
      source: 'DESNZ 2026',
      publicationYear: 2026,
      qualityTier: 'Primary',
      notes: 'Industrial grade LPG in lancing and cutting',
    },
    {
      id: 'EF-COAL-STATIONARY',
      fuelOrActivity: 'Coking Coal',
      scope: 'scope-1',
      category: 'stationary_combustion',
      factorValue: 2450.0, // kgCO2e/tonne
      unit: 'tonne',
      source: 'IPCC AR6 / CEA',
      publicationYear: 2025,
      qualityTier: 'Primary',
      notes: 'Direct reduction and blast furnace combustion',
    },

    // Scope 1: Mobile Combustion
    {
      id: 'EF-DSL-FLEET',
      fuelOrActivity: 'Fleet Diesel (Heavy Duty)',
      scope: 'scope-1',
      category: 'mobile_combustion',
      factorValue: 2.6865, // kgCO2e/L
      unit: 'L',
      source: 'DESNZ 2026',
      publicationYear: 2026,
      qualityTier: 'Primary',
      notes: 'Owned haulage trucks and slag transporters',
    },
    {
      id: 'EF-DSL-FORKLIFT',
      fuelOrActivity: 'Yard Diesel (Forklifts & Loaders)',
      scope: 'scope-1',
      category: 'mobile_combustion',
      factorValue: 2.6865, // kgCO2e/L
      unit: 'L',
      source: 'DESNZ 2026',
      publicationYear: 2026,
      qualityTier: 'Primary',
      notes: 'Internal plant raw material movement',
    },

    // Scope 1: Process Emissions
    {
      id: 'EF-EAF-LIME',
      fuelOrActivity: 'Limestone Flux Calcination',
      scope: 'scope-1',
      category: 'process_emissions',
      factorValue: 440.0, // kgCO2e/tonne
      unit: 'tonne',
      source: 'IPCC AR6 Metals',
      publicationYear: 2025,
      qualityTier: 'Primary',
      notes: 'Chemical calcination in Electric Arc Furnace',
    },
    {
      id: 'EF-EAF-ELECTRODE',
      fuelOrActivity: 'Graphite Electrode Oxidation',
      scope: 'scope-1',
      category: 'process_emissions',
      factorValue: 3667.0, // kgCO2e/tonne
      unit: 'tonne',
      source: 'IPCC AR6',
      publicationYear: 2025,
      qualityTier: 'Secondary',
      notes: 'Consumption of carbon electrodes in melting',
    },

    // Scope 1: Fugitive Emissions
    {
      id: 'EF-REF-R134A',
      fuelOrActivity: 'HFC-134a (Control Room Chiller)',
      scope: 'scope-1',
      category: 'fugitive_emissions',
      factorValue: 1430.0, // kgCO2e/kg (GWP AR5)
      unit: 'kg',
      source: 'IPCC AR5 GWP',
      publicationYear: 2024,
      qualityTier: 'Primary',
      notes: 'Control room and instrumentation air conditioning recharge',
    },
    {
      id: 'EF-REF-R22',
      fuelOrActivity: 'R-22 (ODS Refrigerant - Memo Only)',
      scope: 'biogenic',
      category: 'fugitive_emissions',
      factorValue: 1810.0, // kgCO2e/kg
      unit: 'kg',
      source: 'Montreal Protocol / IPCC',
      publicationYear: 2024,
      qualityTier: 'Primary',
      notes: 'Montreal Protocol gas: reported outside Scopes 1-3 as biogenic/memo item',
    },

    // Scope 2: Electricity
    {
      id: 'EF-ELEC-CEA-GRID',
      fuelOrActivity: 'Indian National Grid Electricity (Location-based)',
      scope: 'scope-2',
      category: 'purchased_electricity_location',
      factorValue: 0.716, // kgCO2e/kWh
      unit: 'kWh',
      source: 'CEA CO2 Baseline Database v19',
      publicationYear: 2024,
      qualityTier: 'Secondary',
      notes: 'Weighted average emission factor for Indian regional grid',
    },
    {
      id: 'EF-ELEC-PPA-RE',
      fuelOrActivity: 'Solar PPA (Market-based)',
      scope: 'scope-2',
      category: 'purchased_electricity_market',
      factorValue: 0.0, // Zero emissions
      unit: 'kWh',
      source: 'GHG Protocol Scope 2 Guidance',
      publicationYear: 2026,
      qualityTier: 'Primary',
      notes: 'Certified Open Access Solar PPA with surrendered Green Attributes',
    },

    // Scope 3: Value Chain
    {
      id: 'EF-S3-CAT1-SCRAP',
      fuelOrActivity: 'Purchased Heavy Melting Scrap',
      scope: 'scope-3',
      category: 'purchased_goods_cat1',
      factorValue: 380.0, // kgCO2e/tonne
      unit: 'tonne',
      source: 'World Steel Association 2025',
      publicationYear: 2025,
      qualityTier: 'Proxy',
      notes: 'Recycled steel feedstock upstream cradle-to-gate',
    },
    {
      id: 'EF-S3-CAT3-FERRO',
      fuelOrActivity: 'Ferro-alloys (Silico-Manganese)',
      scope: 'scope-3',
      category: 'purchased_goods_cat1',
      factorValue: 1850.0, // kgCO2e/tonne
      unit: 'tonne',
      source: 'Ecoinvent 3.10',
      publicationYear: 2024,
      qualityTier: 'Proxy',
      notes: 'Alloying elements upstream production',
    },
    {
      id: 'EF-S3-CAT3-TND',
      fuelOrActivity: 'Electricity T&D Losses (India)',
      scope: 'scope-3',
      category: 'fuel_energy_cat3',
      factorValue: 0.143, // kgCO2e/kWh
      unit: 'kWh',
      source: 'CEA / DESNZ 2026',
      publicationYear: 2026,
      qualityTier: 'Secondary',
      notes: 'Transmission and distribution losses on purchased electricity',
    },
    {
      id: 'EF-S3-CAT6-TRAVEL',
      fuelOrActivity: 'Executive Air Travel (Domestic)',
      scope: 'scope-3',
      category: 'business_travel_cat6',
      factorValue: 0.134, // kgCO2e/passenger-km
      unit: 'p-km',
      source: 'DESNZ 2026',
      publicationYear: 2026,
      qualityTier: 'Secondary',
      notes: 'Domestic economy flights with radiative forcing multiplier',
    },
  ];

  public static getAllFactors(): EmissionFactor[] {
    return this.factors;
  }

  public static getFactorById(id: string): EmissionFactor | undefined {
    return this.factors.find((f) => f.id === id);
  }

  public static getFactorsByScope(scope: string): EmissionFactor[] {
    return this.factors.filter((f) => f.scope === scope);
  }
}
