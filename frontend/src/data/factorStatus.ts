/**
 * What stands behind each catalogue source: a published value, an IPCC method,
 * an automatic derivation, a figure only the supplier holds, a memo line, a
 * more specific row to use instead, or nothing - with the reason.
 *
 * A blank "no published value yet" beside a source told a reader nothing, and
 * for most of them it was not even true: the value was published and simply
 * not joined, or the source was never meant to have one. Every source now says
 * which of these it is. The published values themselves are not here: they
 * come from the engine (catalogue-map), so the figure shown is the figure used.
 */
import { CatalogueMap, CatalogueMapping } from '../services/catalogueMap';
import { CatalogueSource } from './catalogueData';
import { METHOD_NAME, METHOD_NOT_IMPLEMENTED, methodFor } from './methodSources';

export type FactorStatusKind =
  | 'published' | 'method' | 'auto' | 'supplier' | 'memo' | 'choose' | 'not_calculated';

export interface FactorStatus {
  kind: FactorStatusKind;
  /** One plain sentence for a reader. */
  text: string;
  /** For 'published': the engine's mapping in the source's own unit, if any. */
  mapping?: CatalogueMapping;
}

/** The engine works these out from the Scope 1 and 2 rows already recorded. */
const AUTO: Record<string, string> = {
  'cat3.wtt_fuels': 'Calculated automatically: each Scope 1 fuel row adds its DESNZ well-to-tank line.',
  'cat3.wtt_electricity': 'Calculated automatically from your electricity rows once you give an upstream factor and its source in Settings; India publishes none.',
  'cat3.td_losses': 'Calculated automatically from your electricity rows once you give your grid or utility loss rate and its source in Settings; the rate varies several-fold across India.',
  'cat3.wtt_td_losses': 'Calculated automatically with the T&D loss line, from the same rate and upstream factor.',
  'memo.biogenic_co2': 'Reported automatically: every biomass and biofuel row records its biogenic CO₂ here, outside the scopes.',
  'cat6.air_rf_uplift': 'Already included: every flight row uses the DESNZ factor with radiative forcing.',
};

/** Only the supplier or the company holds this figure. Enter it with its source. */
const SUPPLIER: Record<string, string> = {
  'elec.dg_backup_purchased': 'Ask the DG operator for kgCO₂e per kWh (diesel burned ÷ kWh supplied) and enter it with its source.',
  'cooling.chilled_water': 'No set publishes district cooling for India. Enter the supplier\'s kgCO₂e per GJ with its source.',
  'compressed_air.purchased': 'Depends on the supplier\'s compressors and power. Enter their kgCO₂e per m³ with its source.',
  'cat10.processing_sold': 'Depends on your customer\'s process. Use their figure, or the energy they use per tonne, with its source.',
  'cat11.use_indirect': 'Depends on how the product is used. Enter a factor per unit sold with its source.',
  'cat15.investments': 'PCAF attribution: your share of each investee\'s reported emissions. Enter the attributed tCO₂e with the investee\'s report as the source.',
};

/** Recorded beside the inventory, never inside a scope total. */
const MEMO: Record<string, string> = {
  'elec.selfgen_solar_onsite': 'No emissions to count: power you make and use yourself is not Scope 2. Recorded for the energy balance only.',
  'elec.selfgen_wind_onsite': 'No emissions to count: power you make and use yourself is not Scope 2. Recorded for the energy balance only.',
  'elec.exported': 'Never subtracted from a total. Recorded for the energy balance only.',
  'memo.offsets_retired': 'Reported separately and never netted off the inventory. Record the registry and serial numbers.',
  'process.co2_captured': 'Reported separately, never netted off Scope 1. Record the tonnes captured and where they were stored.',
  'memo.biogenic_co2_scope3': 'Reported separately where a supplier states it. No default exists.',
};

/** A generic source whose published values differ by material, gas or sector. */
const CHOOSE: Record<string, string> = {
  'cat1.material.plastic_pe': 'Use "Plastic — HDPE" or "Plastic — LDPE / LLDPE": the published values differ.',
  'cat1.material.packaging': 'Use the row for the material: board, plastic film, rigid plastic, glass, paper, steel or aluminium cans.',
  'cat1.spend_based': 'Use the purchase category row (steel, chemicals, IT services…) with the spend in USD or INR.',
  'cat2.spend_based': 'Use the capital goods row (machinery, buildings, vehicles, IT hardware) with the spend.',
  'cat4.spend_based': 'Use the transport spend row for the mode: road, rail, sea or air freight.',
  'cat6.spend_based': 'Use "Business travel spend — flights", or a distance-based travel row where the trips are known.',
  'cat11.sold_fuels': 'Record each fuel sold with its own fuel row: the factor depends on the fuel.',
  'cat12.incineration': 'Use "EOL — incineration with energy recovery"; DESNZ publishes no route without recovery.',
  'cat12.recycling': 'Use the recycling row for the material: metal, plastic, paper or glass.',
  'cat5.construction_debris': 'Use "Construction & demolition waste — recycled"; DESNZ publishes no landfill route for it.',
  'fugitive.pfc_etch': 'Use the row for the gas released: PFC-14 (CF₄), PFC-116 (C₂F₆), PFC-218 (C₃F₈), PFC-318, or NF₃.',
  'fugitive.hfc_foam': 'Use the row for the blowing agent: HFC-245fa, HFC-365mfc, HFC-152a, or R-134a.',
  'fugitive.hfc_aerosol': 'Use the row for the propellant: HFC-152a or R-134a (HFC-134a).',
  'memo.montreal_cfc': 'Use the row for the gas: CFC-11, CFC-12, Halon-1211 or Halon-1301.',
};

/** No defensible published value exists. Each says why, and what to do. */
export const NOT_CALCULATED_REASON: Record<string, string> = {
  'fuel.ammonia_fuel': 'Burning ammonia releases no CO₂, but its N₂O depends on the burner and IPCC publishes no default. Measure it, or enter the N₂O with its source.',
  'process.hydrogen_smr': 'Hydrogen production is not in IPCC 2006 (it was added in the 2019 Refinement). Record the natural gas fed to the reformer as a fuel row.',
  'process.phosphoric_acid': 'IPCC 2006 publishes no factor for phosphoric acid. Record any carbonate in the phosphate rock with the carbonates method.',
  'flare.process_vent': 'Depends on the vent gas composition. Record the fuel gas burned as a fuel row, or work out the CO₂ from its carbon content and enter it directly.',
  'vent.oil_gas': 'IPCC publishes venting per volume of oil or gas produced, not per m³ vented. Record the methane vented, in kg, as "Process vent — unflared methane".',
  'land.use_change': 'Needs carbon stocks before and after the change, which no default supplies. Follow the GHG Protocol Land Sector guidance and enter the result directly.',
  'land.removals_biochar': 'A removal must be measured and verified; no default exists. Report it separately and never net it off.',
  'cat4.pipeline': 'No ingested set publishes pipeline freight. Ask the operator for kgCO₂e per tonne-km.',
  'cat5.incineration': 'DESNZ\'s incineration value covers only transport to an energy-from-waste plant, so using it here would understate. Ask the contractor for the fossil carbon burned.',
  'cat5.hazardous': 'No ingested set publishes hazardous waste treatment; it depends on the treatment. Ask the treatment operator.',
  'cat5.sewage_sludge': 'DESNZ publishes water treatment per m³ of water, not per tonne of sludge. Record the wastewater with the wastewater method.',
  'cat12.reuse': 'No set publishes a reuse route. Product reused counts no end-of-life emissions to you.',
};

/** The mapping in the source's own unit, else the first one published. */
export function primaryMapping(
  map: CatalogueMap, source: CatalogueSource,
): CatalogueMapping | undefined {
  const mappings = map.get(source.activity_key);
  if (!mappings || mappings.length === 0) return undefined;
  const own = source.default_unit.toLowerCase();
  const sameUnit = mappings.find((m) => {
    const unit = m.unit.toLowerCase();
    return unit === own || (own === 't' && unit === 'tonnes') || (own === 'l' && unit === 'litres');
  });
  return sameUnit ?? mappings[0];
}

export function factorStatus(map: CatalogueMap, source: CatalogueSource): FactorStatus {
  const key = source.activity_key;
  const mapping = primaryMapping(map, source);
  if (mapping) return { kind: 'published', text: mapping.source, mapping };

  const method = methodFor(key);
  if (method) {
    return { kind: 'method', text: `Calculated on the IPCC Methods page: ${METHOD_NAME[method]}.` };
  }
  if (METHOD_NOT_IMPLEMENTED[key]) return { kind: 'not_calculated', text: METHOD_NOT_IMPLEMENTED[key] };
  if (AUTO[key]) return { kind: 'auto', text: AUTO[key] };
  if (SUPPLIER[key]) return { kind: 'supplier', text: SUPPLIER[key] };
  if (MEMO[key]) return { kind: 'memo', text: MEMO[key] };
  if (CHOOSE[key]) return { kind: 'choose', text: CHOOSE[key] };
  if (NOT_CALCULATED_REASON[key]) return { kind: 'not_calculated', text: NOT_CALCULATED_REASON[key] };
  return {
    kind: 'not_calculated',
    text: 'No published factor is joined to this source yet. Enter your own factor with its source.',
  };
}

/** Every key the tables above explain, for the coverage test. */
export const EXPLAINED_KEYS = new Set([
  ...Object.keys(AUTO), ...Object.keys(SUPPLIER), ...Object.keys(MEMO),
  ...Object.keys(CHOOSE), ...Object.keys(NOT_CALCULATED_REASON),
]);

/** The CO₂e per unit to show, under the inventory's GWP set. */
export function co2ePerUnit(mapping: CatalogueMapping, gwpSet: 'AR5' | 'AR6'): string | undefined {
  return (gwpSet === 'AR6' ? mapping.co2e_ar6 : mapping.co2e_ar5) ?? undefined;
}
