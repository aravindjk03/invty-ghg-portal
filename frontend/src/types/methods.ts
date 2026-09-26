/**
 * The IPCC methods contract.
 *
 * Six sources in the inventory are equations, not a factor per unit of
 * activity. The browser does not run any of them: it sends the inputs and
 * renders what comes back, including the working and the reason a figure could
 * not be produced. Figures cross the wire as strings so no precision is lost to
 * JavaScript numbers before they are displayed.
 */
import { z } from 'zod';
import { GwpSetName } from './inventory';

export const METHOD_KEYS = [
  'managed_soils',
  'lime_and_urea',
  'enteric_fermentation',
  'manure_management',
  'wastewater',
  'solid_waste',
] as const;
export type MethodKey = (typeof METHOD_KEYS)[number];

const OptionSchema = z.object({ value: z.string(), label: z.string() });
export type MethodOption = z.infer<typeof OptionSchema>;

/** The choices a form may offer, read from the ingested IPCC tables. */
const OptionsSchema = z.record(
  z.union([z.array(OptionSchema), z.record(z.string())]),
).default({});

export const MethodInfoSchema = z.object({
  key: z.string(),
  name: z.string(),
  scope: z.string(),
  gases: z.array(z.string()),
  source: z.string(),
  why_not_a_factor: z.string(),
  needs: z.array(z.string()),
  options: OptionsSchema,
});
export type MethodInfo = z.infer<typeof MethodInfoSchema>;

export const MethodResultSchema = z.object({
  method: z.string(),
  gwp_set: z.string(),
  gwp_source: z.string(),
  source: z.string(),
  gas_masses_kg: z.record(z.string()),
  co2e_kg: z.string(),
  co2e_by_gas: z.record(z.string()),
  working: z.record(z.string()),
  notes: z.array(z.string()),
});
export type MethodResult = z.infer<typeof MethodResultSchema>;

/** One livestock group on a manure calculation. */
export interface ManureGroupInput {
  species: string;
  head: number;
  economy?: 'developed' | 'developing';
}

/** One livestock category's nitrogen going to one manure management system. */
export interface ManureStreamInput {
  category: string;
  head: number;
  system: string;
  typical_animal_mass_kg?: number | null;
  share?: number;
  nitrogen_excreted_kg_per_head?: number | null;
  volatilisation_percent?: number | null;
  leaching_percent?: number | null;
  total_loss_percent?: number | null;
}

export interface WastewaterPathwayInput {
  system: string;
  share_of_load: number;
  methane_recovered_kg?: number;
}

export interface WasteStreamInput {
  component: string;
  site_type: string;
  /** The disposal history: a landfill cannot be estimated from one year. */
  tonnes_by_year: Record<string, number>;
  doc?: number | null;
  doc_f?: number | null;
  k?: number | null;
  half_life_years?: number | null;
  covered_with_oxidising_material?: boolean;
  industrial?: boolean;
}

export type ManagedSoilsInput = {
  method: 'managed_soils';
  synthetic_fertiliser_n: number;
  organic_amendment_n: number;
  grazing_deposition_n: number;
  crop_residue_n: number;
  mineralised_n: number;
  flooded_rice_n: number;
  grazing_is_cattle_poultry_pigs: boolean;
  leaching_occurs: boolean;
};

export type LimeAndUreaInput = {
  method: 'lime_and_urea';
  limestone: number;
  dolomite: number;
  urea: number;
  urea_fraction_of_solution: number;
  mass_unit: 'tonne' | 'kg';
};

export type EntericInput = {
  method: 'enteric_fermentation';
  dairy_cattle: number;
  other_cattle: number;
  other_animals: Record<string, number>;
  cattle_region: string;
  economy: 'developed' | 'developing';
};

export type ManureInput = {
  method: 'manure_management';
  groups: ManureGroupInput[];
  streams: ManureStreamInput[];
  region: string;
  temperature_c: number;
  excretion_region?: string | null;
};

export type WastewaterInput = {
  method: 'wastewater';
  organic_load?: number | null;
  load_basis: 'BOD' | 'COD';
  population?: number | null;
  bod_per_person_g_day?: number | null;
  industrial_correction: number;
  pathways: WastewaterPathwayInput[];
  sludge_removed_kg: number;
  protein_kg_per_person_year?: number | null;
  economy: 'developed' | 'developing';
  industrial_discharges_to_sewer: boolean;
  sludge_nitrogen_kg: number;
  nitrogen_discharged_kg?: number | null;
};

export type SolidWasteInput = {
  method: 'solid_waste';
  streams: WasteStreamInput[];
  inventory_year: number;
  climate_zone: string;
  recovered_ch4_kg: number;
};

export type MethodInput =
  | ManagedSoilsInput
  | LimeAndUreaInput
  | EntericInput
  | ManureInput
  | WastewaterInput
  | SolidWasteInput;

/**
 * A saved method calculation in the inventory.
 *
 * Only the INPUTS are stored. The result is recalculated by the engine every
 * time, which is what lets the whole inventory switch between AR5 and AR6
 * without a stale figure surviving the change.
 */
export interface MethodEntry {
  id: string;
  method: MethodKey;
  label: string;
  facility: string;
  input: MethodInput;
  /** Kept out of the totals while it is still being filled in. */
  included: boolean;
}

export interface MethodEntryResult {
  entryId: string;
  result?: MethodResult;
  error?: string;
}

export const emptyInput = (method: MethodKey, reportingYear: number): MethodInput => {
  switch (method) {
    case 'managed_soils':
      return {
        method, synthetic_fertiliser_n: 0, organic_amendment_n: 0, grazing_deposition_n: 0,
        crop_residue_n: 0, mineralised_n: 0, flooded_rice_n: 0,
        grazing_is_cattle_poultry_pigs: true, leaching_occurs: true,
      };
    case 'lime_and_urea':
      return {
        method, limestone: 0, dolomite: 0, urea: 0,
        urea_fraction_of_solution: 1, mass_unit: 'tonne',
      };
    case 'enteric_fermentation':
      return {
        method, dairy_cattle: 0, other_cattle: 0, other_animals: {},
        cattle_region: 'indian_subcontinent', economy: 'developing',
      };
    case 'manure_management':
      return {
        method, groups: [], streams: [], region: 'indian_subcontinent',
        temperature_c: 26, excretion_region: 'asia',
      };
    case 'wastewater':
      return {
        method, load_basis: 'BOD', industrial_correction: 1, pathways: [],
        sludge_removed_kg: 0, economy: 'developing',
        industrial_discharges_to_sewer: true, sludge_nitrogen_kg: 0,
      };
    case 'solid_waste':
      return {
        method, streams: [], inventory_year: reportingYear,
        climate_zone: 'tropical_moist_wet', recovered_ch4_kg: 0,
      };
    default: {
      const exhaustive: never = method;
      throw new Error(`No blank input for ${exhaustive}`);
    }
  }
};

export const methodTonnes = (result?: MethodResult): number =>
  (result ? Number(result.co2e_kg) / 1000 : 0);

export interface MethodRunOptions {
  gwpSet: GwpSetName;
}
