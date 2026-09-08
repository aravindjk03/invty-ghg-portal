/**
 * Reporting sectors.
 *
 * The portal was written around integrated steel — sample data, guidance copy,
 * the BRSR output metric and the carbon-balance setting were all hardcoded to
 * it — even though the factor catalogue covers roughly twenty industries. This
 * registry is what makes the app usable by any of them.
 */
export type SectorId =
  | 'iron_steel'
  | 'cement_lime'
  | 'aluminium'
  | 'chemicals_fertiliser'
  | 'oil_gas'
  | 'pulp_paper'
  | 'glass_ceramics'
  | 'non_ferrous'
  | 'electronics'
  | 'mining'
  | 'power_utilities'
  | 'agriculture_food'
  | 'textiles'
  | 'pharma_healthcare'
  | 'transport_logistics'
  | 'waste_management'
  | 'construction_realestate'
  | 'services_it'
  | 'other';

export interface SectorProfile {
  id: SectorId;
  label: string;
  /** Default unit of production for intensity metrics (BRSR Core, CBAM). */
  outputMetric: string;
  /** Sector-relevant process factor keys, surfaced as guidance. */
  keyProcessFactors: string[];
  /** Shown on the Scope 1 workspace in place of the old steel-only panel. */
  guidance: string;
  /** Only integrated iron & steel has the carbon-balance / fuel-based choice. */
  hasIntegratedSteelMethod?: boolean;
  /** CBAM applies to these EU-regulated goods sectors only. */
  cbamSector?: 'steel' | 'aluminium' | 'cement' | 'fertilisers';
}

export const SECTORS: SectorProfile[] = [
  {
    id: 'iron_steel',
    label: 'Iron & Steel',
    outputMetric: 'Tonnes of crude / finished steel',
    keyProcessFactors: [
      'process.iron_steel_bf',
      'process.iron_steel_dri',
      'process.iron_steel_eaf_electrode',
      'process.limestone_flux',
      'process.ferroalloys',
    ],
    guidance:
      'In integrated and secondary steelmaking, process emissions from reductants, flux calcination and electrode consumption typically rival combustion. Choose either carbon mass balance or fuel-based accounting — never both, or blast furnace carbon is double counted.',
    hasIntegratedSteelMethod: true,
    cbamSector: 'steel',
  },
  {
    id: 'cement_lime',
    label: 'Cement & Lime',
    outputMetric: 'Tonnes of clinker / cement',
    keyProcessFactors: ['process.cement_clinker', 'process.lime_calcination', 'process.dolomite_calcination'],
    guidance:
      'Clinker calcination usually dominates the inventory and is independent of fuel choice. Report calcination separately from kiln fuel, and treat alternative fuels (RDF, tyre-derived) with their biogenic fraction split out as a memo item.',
    cbamSector: 'cement',
  },
  {
    id: 'aluminium',
    label: 'Aluminium',
    outputMetric: 'Tonnes of primary / recycled aluminium',
    keyProcessFactors: ['process.aluminium_anode', 'process.aluminium_pfc'],
    guidance:
      'Anode consumption and PFC releases from anode effects are the defining direct sources. Indirect emissions from electricity are typically several times larger than direct — the Scope 2 method choice materially changes the reported figure.',
    cbamSector: 'aluminium',
  },
  {
    id: 'chemicals_fertiliser',
    label: 'Chemicals & Fertiliser',
    outputMetric: 'Tonnes of product',
    keyProcessFactors: [
      'process.ammonia_production',
      'process.nitric_acid',
      'process.adipic_acid',
      'process.urea_production',
      'process.methanol_production',
      'process.hydrogen_smr',
    ],
    guidance:
      'Nitric and adipic acid plants emit N2O with a very high global warming potential, so abatement status changes the inventory dramatically. CO2 consumed in downstream urea synthesis should not be double counted against ammonia production.',
    cbamSector: 'fertilisers',
  },
  {
    id: 'oil_gas',
    label: 'Oil & Gas',
    outputMetric: 'Barrels of oil equivalent',
    keyProcessFactors: ['vent.oil_gas', 'flare.process_vent', 'process.hydrogen_smr'],
    guidance:
      'Flaring, venting and fugitive methane usually matter more than combustion. Report unflared methane separately from flared volumes, since the warming difference between released CH4 and combusted CO2 is large.',
  },
  {
    id: 'pulp_paper',
    label: 'Pulp & Paper',
    outputMetric: 'Tonnes of pulp / paper',
    keyProcessFactors: ['process.pulp_paper_lime_kiln'],
    guidance:
      'Biomass-derived CO2 from black liquor and bark firing is an out-of-scope memo item, not Scope 1. Only lime kiln makeup carbonate and fossil fuels enter the gross total.',
  },
  {
    id: 'glass_ceramics',
    label: 'Glass & Ceramics',
    outputMetric: 'Tonnes of product',
    keyProcessFactors: ['process.glass_carbonates', 'process.ceramics'],
    guidance:
      'Carbonate decomposition in the furnace batch is a direct process emission separate from firing fuel. Cullet or recycled content reduces it proportionally.',
  },
  {
    id: 'non_ferrous',
    label: 'Non-Ferrous Metals',
    outputMetric: 'Tonnes of metal produced',
    keyProcessFactors: [
      'process.lead_production',
      'process.zinc_production',
      'process.silicon_carbide',
      'process.titanium_dioxide',
      'fugitive.sf6_magnesium',
    ],
    guidance:
      'Reductant carbon and, for magnesium casting, SF6 cover gas are the dominant direct sources. SF6 has a global warming potential in the tens of thousands, so small leak volumes carry disproportionate weight.',
  },
  {
    id: 'electronics',
    label: 'Electronics & Semiconductors',
    outputMetric: 'Wafer starts / units produced',
    keyProcessFactors: ['fugitive.nf3', 'fugitive.pfc_etch', 'fugitive.sf6'],
    guidance:
      'Fluorinated etch and chamber-clean gases (NF3, PFCs, SF6) dominate direct emissions and require abatement-adjusted accounting. Purchased electricity is normally the largest single line overall.',
  },
  {
    id: 'mining',
    label: 'Mining & Minerals',
    outputMetric: 'Tonnes of ore / run-of-mine',
    keyProcessFactors: ['fugitive.ch4_coal_mine', 'process.other_process_direct'],
    guidance:
      'Seam methane released by extraction is reported as a fugitive source and is frequently larger than diesel used by the mobile fleet. Off-road plant should be recorded under mobile combustion.',
  },
  {
    id: 'power_utilities',
    label: 'Power & Utilities',
    outputMetric: 'MWh generated',
    keyProcessFactors: ['fugitive.sf6', 'process.other_process_direct'],
    guidance:
      'Generation fuel is Scope 1, and electricity sold onward is not deducted from it. SF6 from switchgear is a small volume with outsized warming impact. Transmission and distribution losses belong in Scope 3 Category 3.',
  },
  {
    id: 'agriculture_food',
    label: 'Agriculture & Food Processing',
    outputMetric: 'Tonnes of product',
    keyProcessFactors: [
      'agri.enteric_fermentation',
      'agri.manure_management',
      'agri.fertiliser_n2o',
      'agri.rice_cultivation',
      'land.use_change',
    ],
    guidance:
      'Enteric fermentation, manure management and fertiliser N2O are usually larger than any combustion source. Land use change is reported separately and can dominate where cultivation has expanded.',
  },
  {
    id: 'textiles',
    label: 'Textiles & Apparel',
    outputMetric: 'Tonnes / units of finished goods',
    keyProcessFactors: ['process.other_process_direct'],
    guidance:
      'Direct emissions are typically boiler steam for dyeing and finishing. The material weight of the inventory sits in Scope 3 Category 1 — purchased fibre, yarn and wet processing at suppliers.',
  },
  {
    id: 'pharma_healthcare',
    label: 'Pharmaceuticals & Healthcare',
    outputMetric: 'Units / batches produced',
    keyProcessFactors: ['fugitive.n2o_medical', 'fugitive.fire_hfc227ea', 'process.other_process_direct'],
    guidance:
      'Medical and laboratory N2O, anaesthetic gases and refrigerant losses from the cold chain are the main direct sources. Cold chain distribution is a significant Scope 3 Category 4 line.',
  },
  {
    id: 'transport_logistics',
    label: 'Transport & Logistics',
    outputMetric: 'Tonne-kilometres moved',
    keyProcessFactors: ['mobile.diesel', 'mobile.marine_hfo', 'mobile.aviation_atf'],
    guidance:
      'Owned fleet fuel is Scope 1 and contracted haulage is Scope 3 Category 4. Report on a tonne-kilometre basis so intensity is comparable across modes.',
  },
  {
    id: 'waste_management',
    label: 'Waste Management',
    outputMetric: 'Tonnes of waste handled',
    keyProcessFactors: ['fugitive.ch4_wastewater', 'fugitive.n2o_wastewater', 'flare.biogas'],
    guidance:
      'Landfill and anaerobic digestion methane are the defining sources, and captured gas that is flared or used for energy must not be counted twice. Biogenic CO2 from decomposition is an out-of-scope memo item.',
  },
  {
    id: 'construction_realestate',
    label: 'Construction & Real Estate',
    outputMetric: 'Square metres built / managed',
    keyProcessFactors: ['fugitive.refrigerant.r410a', 'fugitive.refrigerant.r134a'],
    guidance:
      'Operational emissions are mostly purchased energy and refrigerant leakage. Embodied carbon in cement, steel and aluminium sits in Scope 3 Categories 1 and 2 and usually exceeds operational emissions over a build.',
  },
  {
    id: 'services_it',
    label: 'Services, IT & Data Centres',
    outputMetric: 'Revenue (INR Cr) or rack-units hosted',
    keyProcessFactors: ['fugitive.refrigerant.r410a', 'fuel.diesel.stationary', 'fugitive.fire_novec'],
    guidance:
      'Purchased electricity dominates. Direct sources are limited to standby generation, cooling refrigerants and fire suppression agents. Market-based Scope 2 with renewable instruments is the primary lever.',
  },
  {
    id: 'other',
    label: 'Other / Multi-sector',
    outputMetric: 'Tonnes of product',
    keyProcessFactors: ['process.other_process_direct'],
    guidance:
      'The full factor catalogue is available. Record process emissions specific to your operations under Process emissions, and use the "Other process" line to enter a directly measured tCO2e figure.',
  },
];

export const DEFAULT_SECTOR: SectorId = 'iron_steel';

export function getSector(id: SectorId | undefined): SectorProfile {
  return SECTORS.find((s) => s.id === id) ?? SECTORS[SECTORS.length - 1];
}
