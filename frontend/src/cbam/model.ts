/**
 * CBAM calculator inputs and results.
 *
 * Every number the user types is kept as a string so it reaches decimal.js
 * exactly as entered. Nothing here has a default emission value: the only
 * values the calculator supplies itself come from the Commission's tables in
 * ./data/cbamData.json (see scripts/ingest_cbam.py).
 */

export type Sector = 'cement' | 'fertilisers' | 'aluminium' | 'hydrogen' | 'iron_steel' | 'electricity';

export type Role = 'exporter' | 'importer';

/** One line of directly attributable emissions (DirEm*) of a production process. */
export interface EmissionLine {
  id: string;
  label: string;
  /** 'calc': activity × emission factor × oxidation factor. 'measured': tonnes CO2e entered directly. */
  kind: 'calc' | 'measured';
  activity?: string;
  activityUnit?: string;
  /** t CO2e per unit of activity. */
  emissionFactor?: string;
  /** Fraction, 1 when not applicable. */
  oxidationFactor?: string;
  tco2e?: string;
  /** Where the factor or the measurement comes from. Required for the report. */
  source: string;
}

/** A good leaving a production process. */
export interface Product {
  id: string;
  cn: string;
  name: string;
  /** Tonnes produced in the reporting period. */
  tonnes: string;
  /**
   * Functional units per tonne of this product. 1 for most goods; the clinker
   * content for cement (Guidance No. 3, section 4.3.3); the nitrogen content for
   * fertilisers.
   */
  functionalUnitsPerTonne: string;
  /** CBAM benchmark production route indicator, e.g. '(C)'. Needed only where the benchmark table has several. */
  route?: string;
}

/** A precursor consumed in a production process. */
export interface PrecursorUse {
  id: string;
  cn: string;
  name: string;
  /** Tonnes consumed in the reporting period (M_i), including losses. */
  tonnes: string;
  origin: 'own_process' | 'supplier_actual' | 'default' | 'eu';
  /** own_process: the process and product that make it. */
  ownProcessId?: string;
  ownProductId?: string;
  /** supplier_actual: values from the supplier's verified emissions report. */
  supplierName?: string;
  supplierSeeDirect?: string;
  supplierSeeIndirect?: string;
  supplierSefa?: string;
  /** default: country of production, or null when unknown (Annex IV then applies). */
  country?: string | null;
  route?: string;
}

export interface Process {
  id: string;
  name: string;
  products: Product[];
  direct: EmissionLine[];
  /** Measurable heat imported: TJ and t CO2/TJ (Guidance No. 3, Em_H,imp = Q_imp · EF_heat). */
  heatImportTJ?: string;
  heatImportEF?: string;
  heatExportTJ?: string;
  heatExportEF?: string;
  heatSource?: string;
  /** Waste gases: energy content (V · NCV) in TJ, and the natural gas factor in t CO2/TJ. */
  wasteGasImportTJ?: string;
  wasteGasExportTJ?: string;
  naturalGasEF?: string;
  naturalGasEFSource?: string;
  /** Emissions equivalent to electricity produced inside the process, t CO2e (Section D, Annex II of the Methodology Act). */
  electricityProducedTco2e?: string;
  /** Electricity consumed, MWh, and its emission factor in t CO2e/MWh. */
  electricityMWh?: string;
  electricityEF?: string;
  electricitySource?: string;
  precursors: PrecursorUse[];
}

export interface Installation {
  name: string;
  operator: string;
  country: string;
  unlocode: string;
  address: string;
  /** Production year (the reporting period). */
  year: number;
}

export interface ExporterInput {
  installation: Installation;
  processes: Process[];
  /** Cross-sectoral correction factor override (see parameters.cscf). */
  cscfOverride?: string;
}

/** One imported consignment line for an EU declarant. */
export interface ImportLine {
  id: string;
  cn: string;
  name: string;
  country: string | null;
  tonnes: string;
  /** e.g. 'Q3' for 2026 quarterly pricing. */
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  basis: 'default' | 'actual';
  route?: string;
  /** actual: from the operator's verified emissions report. */
  seeDirect?: string;
  seeIndirect?: string;
  sefa?: string;
  /** Specific embedded carbon price paid, € per tonne of good, with evidence. */
  carbonPricePaidPerTonne?: string;
  operatorName?: string;
}

export interface ImporterInput {
  declarant: string;
  year: number;
  lines: ImportLine[];
  /** € per certificate by quarter; the Commission's published prices fill these where available. */
  certificatePrice: Partial<Record<'Q1' | 'Q2' | 'Q3' | 'Q4', string>>;
  /** Reference price used to convert carbon price paid into certificates (RP_CBAM). */
  referencePrice?: string;
  cscfOverride?: string;
}

/** Where a default value came from, for the report's source list. */
export interface DefaultUsed {
  cn: string;
  matchedCn: string;
  table: string;
  direct: string | null;
  indirect: string | null;
  total: string;
  markUp: string;
  year: number;
  totalWithMarkUp: string;
  route: string;
  note?: string;
}

export interface Note {
  level: 'info' | 'warning' | 'error';
  text: string;
}
