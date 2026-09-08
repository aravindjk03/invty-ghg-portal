import * as fs from 'fs';
import * as path from 'path';

const csvPath = path.resolve(process.cwd(), 'src/data/emission_source_catalogue.csv');
const text = fs.readFileSync(csvPath, 'utf8');

function parseCSV(content: string) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const header = lines[0].split(',').map(h => h.trim());
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row: string[] = [];
    let inQuote = false;
    let token = '';
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        row.push(token.trim());
        token = '';
      } else {
        token += c;
      }
    }
    row.push(token.trim());
    if (row.length >= header.length) {
      const obj: Record<string, any> = {};
      header.forEach((h, idx) => {
        obj[h] = row[idx] || '';
      });
      rows.push(obj);
    }
  }
  return rows;
}

const entries = parseCSV(text);

// Map default emission factor values for accurate calculations
const DEFAULT_FACTOR_MAP: Record<string, number> = {
  // Solid fuels
  'fuel.coal.anthracite': 2670.0,
  'fuel.coal.bituminous': 2415.0,
  'fuel.coal.sub_bituminous': 2100.0,
  'fuel.coal.lignite': 1850.0,
  'fuel.coal.coking': 3100.0,
  'fuel.coal.indian_domestic': 1950.0,
  'fuel.coal.imported_steam': 2450.0,
  'fuel.coke.metallurgical': 3250.0,
  'fuel.coke.petroleum': 3150.0,
  'fuel.charcoal': 110.0, // CH4 + N2O only (CO2 biogenic memo)
  // Biomass (only CH4 + N2O)
  'fuel.biomass.wood_chips': 15.0,
  'fuel.biomass.wood_pellets': 14.0,
  'fuel.biomass.wood_logs': 16.0,
  'fuel.biomass.briquettes': 18.0,
  'fuel.biomass.bagasse': 22.0,
  'fuel.biomass.rice_husk': 25.0,
  'fuel.biomass.groundnut_shell': 20.0,
  'fuel.biomass.mustard_husk': 21.0,
  'fuel.biomass.coconut_shell': 19.0,
  'fuel.biomass.sawdust': 17.0,
  'fuel.biomass.agri_residue': 20.0,
  // Waste derived
  'fuel.msw': 850.0,
  'fuel.rdf': 1100.0,
  'fuel.tyre_derived': 2800.0,
  // Liquid fuels
  'fuel.diesel.stationary': 2.6865,
  'fuel.ldo': 2.75,
  'fuel.furnace_oil': 3180.0,
  'fuel.kerosene_sko': 2.54,
  'fuel.naphtha': 3120.0,
  'fuel.lpg.stationary': 2.9431,
  'fuel.propane': 2.98,
  'fuel.butane': 3.01,
  'fuel.lng': 2750.0,
  'fuel.biodiesel.stationary': 0.15,
  'fuel.ethanol.stationary': 0.12,
  'fuel.lubricants': 2.95,
  'fuel.waste_oil': 2.92,
  // Gaseous fuels
  'fuel.natural_gas': 2.0282,
  'fuel.png': 2.0282,
  'fuel.cng.stationary': 2.75,
  'fuel.biogas': 0.25,
  'fuel.landfill_gas': 0.30,
  'fuel.producer_gas': 0.85,
  'fuel.blast_furnace_gas': 0.72,
  'fuel.coke_oven_gas': 0.65,
  'fuel.converter_gas': 0.90,
  'fuel.hydrogen.grey': 0.0,
  'fuel.hydrogen.green': 0.0,
  'fuel.ammonia_fuel': 0.05,
  // Mobile
  'mobile.diesel': 2.6865,
  'mobile.petrol': 2.31,
  'mobile.cng': 2.75,
  'mobile.lpg_auto': 1.55,
  'mobile.biodiesel_blend': 2.45,
  'mobile.ethanol_blend': 2.15,
  'mobile.distance.car': 0.17,
  'mobile.distance.truck': 0.85,
  'mobile.distance.two_wheeler': 0.035,
  'mobile.forklift_diesel': 2.6865,
  'mobile.forklift_lpg': 2.9431,
  'mobile.atf_own_aircraft': 2.54,
  'mobile.avgas': 2.35,
  'mobile.marine_gas_oil': 3200.0,
  'mobile.marine_hfo': 3150.0,
  'mobile.rail_diesel': 2.6865,
  'mobile.offroad.excavator': 2.6865,
  'mobile.offroad.dozer': 2.6865,
  'mobile.offroad.crane': 2.6865,
  'mobile.offroad.haul_truck': 2.6865,
  'mobile.offroad.loader': 2.6865,
  'mobile.offroad.tractor': 2.6865,
  'mobile.offroad.genset_mobile': 2.6865,
  // Process
  'process.cement_clinker': 525.0,
  'process.lime_calcination': 750.0,
  'process.dolomite_calcination': 860.0,
  'process.limestone_flux': 440.0,
  'process.soda_ash_use': 415.0,
  'process.iron_steel_bf': 1800.0,
  'process.iron_steel_dri': 1150.0,
  'process.iron_steel_eaf_electrode': 3667.0,
  'process.ammonia_production': 1600.0,
  'process.nitric_acid': 300.0,
  'process.adipic_acid': 450.0,
  'process.urea_production': 730.0,
  'process.methanol_production': 670.0,
  'process.hydrogen_smr': 9000.0,
  'process.aluminium_anode': 1500.0,
  'process.aluminium_pfc': 1200.0,
  'process.glass_carbonates': 210.0,
  'process.ceramics': 180.0,
  'process.calcium_carbide': 1100.0,
  'process.ferroalloys': 1400.0,
  'process.ethylene_petchem': 1200.0,
  'process.carbon_black': 2400.0,
  'process.pulp_paper_lime_kiln': 480.0,
  'process.hfc23_byproduct': 12700.0,
  'process.titanium_dioxide': 1400.0,
  'process.phosphoric_acid': 150.0,
  'process.lead_production': 520.0,
  'process.zinc_production': 430.0,
  'process.silicon_carbide': 2300.0,
  'process.co2_captured': -1000.0, // negative
  'process.other_process_direct': 1000.0,
  // Fugitive
  'fugitive.refrigerant.r134a': 1430.0,
  'fugitive.refrigerant.r410a': 2088.0,
  'fugitive.refrigerant.r404a': 3922.0,
  'fugitive.refrigerant.r407c': 1774.0,
  'fugitive.refrigerant.r32': 675.0,
  'fugitive.refrigerant.r1234yf': 0.5,
  'fugitive.refrigerant.r1234ze': 1.0,
  'fugitive.refrigerant.r507a': 3985.0,
  'fugitive.refrigerant.r417a': 2346.0,
  'fugitive.refrigerant.r23': 14800.0,
  'fugitive.refrigerant.r125': 3500.0,
  'fugitive.refrigerant.r143a': 4470.0,
  'fugitive.refrigerant.r290': 3.0,
  'fugitive.refrigerant.r717': 0.0,
  'fugitive.refrigerant.r744': 1.0,
  'combustion.acetylene': 3.38,
  'fugitive.sf6': 25200.0,
  'fugitive.nf3': 17200.0,
  'fugitive.pfc_etch': 7390.0,
  'fugitive.fire_co2': 1.0,
  'fugitive.fire_hfc227ea': 3220.0,
  'fugitive.fire_novec': 1.0,
  'fugitive.ch4_wastewater': 28.0,
  'fugitive.ch4_ng_distribution': 28.0,
  'fugitive.ch4_coal_mine': 28.0,
  'fugitive.co2_welding': 1.0,
  'fugitive.n2o_medical': 273.0,
  'fugitive.co2_beverage': 1.0,
  'fugitive.n2o_wastewater': 273.0,
  'fugitive.hfc_foam': 1000.0,
  'fugitive.hfc_aerosol': 1200.0,
  'fugitive.sf6_magnesium': 25200.0,
  'flare.process_vent': 2.1,
  'flare.biogas': 0.15,
  'vent.process_ch4': 28.0,
  'vent.oil_gas': 22.0,
  // Scope 2
  'elec.grid.location': 0.716, // CEA baseline v19 India
  'elec.grid.market_residual': 0.820,
  'elec.ppa_renewable': 0.0,
  'elec.green_tariff': 0.0,
  'elec.irec': 0.0,
  'elec.open_access': 0.716,
  'elec.dg_backup_purchased': 0.68,
  'elec.ev_charging_onsite': 0.716,
  'elec.supplier_specific': 0.65,
  'elec.submetered_tenant': 0.716,
  'steam.purchased': 180.0,
  'heat.purchased': 55.0,
  'cooling.chilled_water': 45.0,
  'compressed_air.purchased': 0.08,
  // Scope 3 & Memos
  'cat1.material.steel': 1800.0,
  'cat1.material.cement': 750.0,
  'cat1.material.aluminium': 8500.0,
  'cat1.material.copper': 4200.0,
  'cat1.material.plastic_pp': 2100.0,
  'cat1.material.plastic_pe': 2000.0,
  'cat1.material.plastic_pvc': 2400.0,
  'cat1.material.plastic_pet': 2500.0,
  'cat1.material.paper': 950.0,
  'cat1.material.glass': 850.0,
  'cat1.material.timber': 320.0,
  'cat1.material.chemicals_generic': 1600.0,
  'cat1.material.textiles': 12000.0,
  'cat1.material.food_generic': 1500.0,
  'cat1.material.packaging': 1400.0,
  'cat1.material.water_supply': 0.35,
  'cat1.material.it_services': 0.00042,
  'cat1.material.professional_services': 0.00035,
  'cat1.spend_based': 0.00045,
  'cat3.wtt_fuels': 0.20,
  'cat3.wtt_electricity': 0.12,
  'cat3.td_losses': 0.18,
  'cat3.wtt_td_losses': 0.03,
  'cat4.road_hgv': 0.115,
  'cat4.rail': 0.025,
  'cat4.sea_container': 0.015,
  'cat4.air_freight': 1.25,
  'cat6.air_domestic_economy': 0.145,
  'cat6.air_short_haul_economy': 0.125,
  'cat6.air_long_haul_economy': 0.102,
  'cat6.air_long_haul_business': 0.295,
  'cat6.rail': 0.035,
  'cat6.taxi': 0.19,
  'cat6.hotel_nights': 42.0,
  'cat7.car_petrol': 0.17,
  'cat7.two_wheeler': 0.035,
  'cat7.metro_rail': 0.028,
  'memo.biogenic_co2': 1.0,
  'memo.montreal_r22': 1810.0,
  'memo.offsets_retired': 1000.0,
};

const enriched = entries.map((e: any) => {
  const factor = DEFAULT_FACTOR_MAP[e.activity_key] ?? 1.0;
  return {
    ...e,
    factorValue: factor,
    qualityTier: e.factor_source?.includes('CEA') || e.factor_source?.includes('DESNZ') ? 'Primary' : 'Secondary',
    publicationYear: 2024,
  };
});

fs.writeFileSync(
  path.resolve(process.cwd(), 'src/data/emission_source_catalogue.json'),
  JSON.stringify(enriched, null, 2)
);

const tsContent = `// Auto-generated catalogue containing 266+ GHG emission activities with factors
export interface CatalogueSource {
  activity_key: string;
  display_name: string;
  group: string;
  scope: string;
  ghg_category: string;
  category_name: string;
  default_unit: string;
  allowed_units: string;
  gases: string;
  factor_source: string;
  notes: string;
  factorValue: number;
  qualityTier: 'Primary' | 'Secondary' | 'Proxy' | 'Estimated';
  publicationYear: number;
}

export const CATALOGUE_SOURCES: CatalogueSource[] = ${JSON.stringify(enriched, null, 2)};

export const CATALOGUE_BY_KEY: Record<string, CatalogueSource> = CATALOGUE_SOURCES.reduce(
  (acc, item) => {
    acc[item.activity_key] = item;
    return acc;
  },
  {} as Record<string, CatalogueSource>
);
`;

fs.writeFileSync(path.resolve(process.cwd(), 'src/data/catalogueData.ts'), tsContent);

console.log(`Generated catalogue with ${enriched.length} items!`);
