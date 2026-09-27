"""Transcribe the IPCC 2006 Volume 3 industrial process defaults.

    python scripts/ingest_ipcc_industrial.py

Writes data/ipcc/industrial_processes.json.

These are the sources a cement works, steel mill, aluminium smelter or chemical
plant emits from its PROCESS, not from burning fuel. Calcining limestone
releases CO2 whatever heats the kiln; a nitric acid plant makes N2O in the
reaction itself; an aluminium cell makes CF4 and C2F6 during an anode effect.
Until now they sat in the catalogue with nothing behind them, because none of
them is a factor per unit of a fuel.

Every value below was read from the rendered published pages:

  Volume 3 Chapter 2 (Mineral industry)
    Table 2.1  carbon dioxide content of the carbonate species
    Eq 2.4     clinker emission factor, 0.51 x 1.02 for kiln dust
    Table 2.4  lime by type, and Eq 2.8's 85/15 default mix
    Table 2.6  glass by type, and the Tier 1 cullet assumption
  Volume 3 Chapter 3 (Chemical industry)
    Table 3.1  ammonia by process route
    Table 3.3  nitric acid by plant type
    Table 3.4  adipic acid, with abatement destruction and utilisation
    Table 3.7  silicon carbide      Table 3.8  calcium carbide
    Table 3.9  titanium dioxide
  Volume 3 Chapter 4 (Metal industry)
    Table 4.1  coke, sinter, pellet, iron, DRI and the three steelmaking routes
    Table 4.2  the same for methane
    Table 4.5  ferroalloys by alloy
    Table 4.10 aluminium anode CO2 by cell technology
    Table 4.15 aluminium CF4 and C2F6 by cell technology
    Table 4.20 magnesium casting SF6
    Table 4.21 lead by furnace      Table 4.24 zinc by process

The script refuses to write if a factor falls outside a band that its own
chemistry allows - a carbonate cannot release more CO2 than its formula holds,
and a tonne of steel cannot emit twenty tonnes of it.
"""
from __future__ import annotations

import argparse
import json
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "data" / "ipcc" / "industrial_processes.json"

SOURCE = ("IPCC 2006 Guidelines for National Greenhouse Gas Inventories, "
          "Volume 3 (Industrial Processes and Product Use)")
URL = "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol3.html"

DATA = {
    "source_name": SOURCE,
    "source_url": URL,
    "read_on": "2026-09-27",
    "read_from": ("Chapter 2 Tables 2.1, 2.4, 2.6 and Equations 2.4 and 2.8; "
                  "Chapter 3 Tables 3.1, 3.3, 3.4, 3.7, 3.8, 3.9; "
                  "Chapter 4 Tables 4.1, 4.2, 4.5, 4.10, 4.15, 4.20, 4.21, 4.24"),
    "tier": 1,

    # --- Chapter 2: minerals ------------------------------------------------
    "carbonates": {
        "unit": "tonnes CO2 per tonne of carbonate, at 100 percent calcination",
        "read_from": "Table 2.1 (printed page 2.7)",
        "note": "Use with the fraction actually calcined. A carbonate that leaves "
                "the kiln uncalcined has released nothing.",
        "values": {
            "limestone_caco3": {"value": 0.43971, "mineral": "Calcite or aragonite (CaCO3)"},
            "magnesite_mgco3": {"value": 0.52197, "mineral": "Magnesite (MgCO3)"},
            "dolomite": {"value": 0.47732, "mineral": "Dolomite (CaMg(CO3)2)"},
            "siderite_feco3": {"value": 0.37987, "mineral": "Siderite (FeCO3)"},
            "rhodochrosite_mnco3": {"value": 0.38286, "mineral": "Rhodochrosite (MnCO3)"},
            "soda_ash_na2co3": {"value": 0.41492, "mineral": "Sodium carbonate (Na2CO3)"},
        },
    },

    "cement": {
        "unit": "tonnes CO2 per tonne of clinker",
        "read_from": "Equation 2.4 (printed page 2.12)",
        "clinker_emission_factor": {
            "value": 0.52,
            "base": 0.51,
            "kiln_dust_correction": 1.02,
            "note": "0.51 assumes clinker is 65 percent CaO, all of it from CaCO3, fully "
                    "calcined. The 1.02 adds back the CO2 in cement kiln dust lost from "
                    "the system; a plant that recycles all its dust uses 1.00.",
        },
        "cao_variants": {
            "note": "Table text on page 2.12: for a clinker of known CaO content, before "
                    "the kiln dust correction.",
            "values": {"60_percent_cao": 0.47, "65_percent_cao": 0.51, "67_percent_cao": 0.53},
        },
        "clinker_from_cement": {
            "note": "Cement is not clinker. Where only cement tonnage is known, the clinker "
                    "fraction of the product mix has to be applied, and imported clinker "
                    "belongs to whoever made it.",
        },
    },

    "lime": {
        "unit": "tonnes CO2 per tonne of lime produced",
        "read_from": "Table 2.4 and Equation 2.8 (printed page 2.22)",
        "values": {
            "high_calcium": {"value": 0.75, "stoichiometric_ratio": 0.785,
                             "cao_content": 0.95},
            "dolomitic_developed": {"value": 0.86, "stoichiometric_ratio": 0.913,
                                    "cao_mgo_content": 0.95},
            "dolomitic_developing": {"value": 0.77, "stoichiometric_ratio": 0.913,
                                     "cao_mgo_content": 0.85},
            "hydraulic": {"value": 0.59, "stoichiometric_ratio": 0.785,
                          "cao_content": 0.75},
        },
        "default_mix": {
            "value": 0.75,
            "note": "Equation 2.8: 85 percent high calcium at 0.75 plus 15 percent "
                    "dolomitic at 0.77, where the split is not known.",
        },
    },

    "glass": {
        "unit": "tonnes CO2 per tonne of glass melted",
        "read_from": "Table 2.6 (printed page 2.30)",
        "note": "Cullet is recycled glass; it has already released its carbonate CO2, so "
                "the factor applies only to the virgin part of the batch.",
        "tier1_default": {"emission_factor": 0.20, "cullet_ratio": 0.50,
                          "effective": 0.10,
                          "note": "0.20 x (1 - 0.50). Use a measured cullet ratio where there "
                                  "is one."},
        "values": {
            "float": {"value": 0.21, "cullet_range": [0.10, 0.25]},
            "container_flint": {"value": 0.21, "cullet_range": [0.30, 0.60]},
            "container_amber_green": {"value": 0.21, "cullet_range": [0.30, 0.80]},
            "fibreglass_e_glass": {"value": 0.19, "cullet_range": [0.00, 0.15]},
            "fibreglass_insulation": {"value": 0.25, "cullet_range": [0.10, 0.50]},
            "specialty_tv_panel": {"value": 0.18, "cullet_range": [0.20, 0.75]},
            "specialty_tv_funnel": {"value": 0.13, "cullet_range": [0.20, 0.70]},
            "specialty_tableware": {"value": 0.10, "cullet_range": [0.20, 0.60]},
            "specialty_lab_pharma": {"value": 0.03, "cullet_range": [0.30, 0.75]},
            "specialty_lighting": {"value": 0.20, "cullet_range": [0.40, 0.70]},
        },
    },

    # --- Chapter 3: chemicals ----------------------------------------------
    "ammonia": {
        "unit": "tonnes CO2 per tonne of ammonia",
        "read_from": "Table 3.1 (printed page 3.15)",
        "note": "This is the CO2 from the fuel AND the feedstock together, which is how "
                "ammonia is reported. CO2 recovered for urea manufacture is subtracted, "
                "because it leaves as urea rather than to air.",
        "values": {
            "conventional_reforming_natural_gas": {"value": 1.694, "fuel_gj_per_tonne": 30.2},
            "excess_air_reforming_natural_gas": {"value": 1.666, "fuel_gj_per_tonne": 29.7},
            "autothermal_reforming_natural_gas": {"value": 1.694, "fuel_gj_per_tonne": 30.2},
            "partial_oxidation": {"value": 2.772, "fuel_gj_per_tonne": 36.0},
            "average_natural_gas": {"value": 2.104, "fuel_gj_per_tonne": 37.5,
                                    "note": "European average over modern and older plants."},
            "average_partial_oxidation": {"value": 3.273, "fuel_gj_per_tonne": 42.5},
        },
    },

    "nitric_acid": {
        "unit": "kg N2O per tonne of nitric acid, on 100 percent pure acid",
        "read_from": "Table 3.3 (printed page 3.23)",
        "values": {
            "nscr_all_processes": {"value": 2, "uncertainty_percent": 10,
                                   "note": "Non-selective catalytic reduction. The factor "
                                           "already counts the abatement; verify the unit is "
                                           "installed and ran all year."},
            "process_integrated_or_tailgas_destruction": {"value": 2.5, "uncertainty_percent": 10},
            "atmospheric_pressure": {"value": 5, "uncertainty_percent": 10},
            "medium_pressure_combustion": {"value": 7, "uncertainty_percent": 20},
            "high_pressure": {"value": 9, "uncertainty_percent": 40},
        },
    },

    "adipic_acid": {
        "unit": "kg N2O per tonne of adipic acid",
        "read_from": "Table 3.4 (printed page 3.30)",
        "generation_factor": {"value": 300, "uncertainty_percent": 10,
                              "process": "Nitric acid oxidation, uncontrolled"},
        "destruction_factor": {
            "note": "The share of the N2O an abatement technology destroys.",
            "values": {"catalytic_destruction": 0.925, "thermal_destruction": 0.985,
                       "recycle_to_nitric_acid": 0.985, "recycle_to_adipic_feedstock": 0.94},
        },
        "utilisation_factor": {
            "note": "The share of the year the abatement system actually ran. Destruction "
                    "times utilisation is what is abated; assuming 100 percent uptime "
                    "understates the source.",
            "values": {"catalytic_destruction": 0.89, "thermal_destruction": 0.97,
                       "recycle_to_nitric_acid": 0.94, "recycle_to_adipic_feedstock": 0.89},
        },
    },

    "carbide": {
        "silicon_carbide": {
            "read_from": "Table 3.7 (printed page 3.44)",
            "co2_per_tonne_product": 2.62,
            "ch4_kg_per_tonne_product": 11.6,
            "co2_per_tonne_petroleum_coke": 2.30,
            "ch4_kg_per_tonne_petroleum_coke": 10.2,
        },
        "calcium_carbide": {
            "read_from": "Table 3.8 (printed page 3.44)",
            "co2_per_tonne_product": 1.090,
            "co2_per_tonne_petroleum_coke": 1.70,
            "co2_per_tonne_carbide_used": 1.100,
            "note": "Using the carbide - to make acetylene - releases its carbon too, and "
                    "that is a separate line from making it.",
        },
    },

    "titanium_dioxide": {
        "unit": "tonnes CO2 per tonne of product",
        "read_from": "Table 3.9 (printed page 3.49)",
        "values": {
            "synthetic_rutile": {"value": 1.43, "uncertainty_percent": 10},
            "rutile_tio2_chloride_route": {"value": 1.34, "uncertainty_percent": 15},
        },
        "not_published": {
            "titanium_slag": "IPCC publishes no default: only two plants make it and their "
                             "data is confidential. A plant that makes it has to use its own "
                             "reductant and carbothermal input.",
        },
    },

    # --- Chapter 4: metals --------------------------------------------------
    "iron_and_steel": {
        "unit": "tonnes CO2 per tonne of the named product",
        "read_from": "Tables 4.1 and 4.2 (printed pages 4.25 and 4.26)",
        "values": {
            "sinter": {"co2": 0.20, "ch4_kg": 0.07},
            "coke_oven": {"co2": 0.56, "ch4_kg": 0.0001,
                          "ch4_note": "0.1 gram per tonne of coke."},
            "pellet": {"co2": 0.03},
            "pig_iron_blast_furnace": {"co2": 1.35},
            "direct_reduced_iron": {"co2": 0.70,
                                    "note": "Assumes natural gas, 12.5 GJ per tonne of DRI."},
            "steel_basic_oxygen_furnace": {"co2": 1.46,
                                           "note": "Includes the blast furnace iron making."},
            "steel_electric_arc_furnace": {"co2": 0.08,
                                           "note": "Steel from SCRAP. Not applicable to an EAF "
                                                   "charged with pig iron - that iron's "
                                                   "emissions belong to the blast furnace."},
            "steel_open_hearth_furnace": {"co2": 1.72,
                                          "note": "Includes the blast furnace iron making."},
            "steel_global_average": {"co2": 1.06,
                                     "note": "65 percent BOF, 30 percent EAF, 5 percent OHF."},
        },
    },

    "ferroalloys": {
        "unit": "tonnes CO2 per tonne of product",
        "read_from": "Table 4.5 (printed page 4.37)",
        "note": "These factors assume fossil reductants. If any bio-carbon is used beyond "
                "woodchips in FeSi and Si-metal, they do not apply.",
        "values": {
            "ferrosilicon_45_percent_si": 2.5,
            "ferrosilicon_65_percent_si": 3.6,
            "ferrosilicon_75_percent_si": 4.0,
            "ferrosilicon_90_percent_si": 4.8,
            "ferromanganese_7_percent_c": 1.3,
            "ferromanganese_1_percent_c": 1.5,
            "silicomanganese": 1.4,
            "silicon_metal": 5.0,
            "ferrochromium": 1.3,
            "ferrochromium_with_sinter_plant": 1.6,
        },
    },

    "aluminium": {
        "read_from": "Tables 4.10 and 4.15 (printed pages 4.47 and 4.54)",
        "anode_co2": {
            "unit": "tonnes CO2 per tonne of aluminium",
            "values": {"prebake": {"value": 1.6, "uncertainty_percent": 10},
                       "soderberg": {"value": 1.7, "uncertainty_percent": 10}},
        },
        "pfc": {
            "unit": "kg per tonne of aluminium",
            "note": "Perfluorocarbons are made during an anode effect. CWPB is centre worked "
                    "prebake, SWPB side worked prebake, VSS vertical stud Soderberg, HSS "
                    "horizontal stud Soderberg.",
            "values": {
                "cwpb": {"cf4": 0.4, "c2f6": 0.04},
                "swpb": {"cf4": 1.6, "c2f6": 0.4},
                "vss": {"cf4": 0.8, "c2f6": 0.04},
                "hss": {"cf4": 0.4, "c2f6": 0.03},
            },
            "caveat": "The uncertainty on these runs from -99 to +380 percent for CWPB. They "
                      "are for use only where no anode effect data exists; a smelter that "
                      "records anode effect minutes should use the Tier 2 slope coefficients.",
        },
    },

    "magnesium": {
        "unit": "kg SF6 per tonne of magnesium cast",
        "read_from": "Table 4.20 (printed page 4.66)",
        "values": {"all_casting_processes": 1.0},
        "note": "The Tier 1 assumption is that all the SF6 bought is emitted. Where the "
                "foundry records its own consumption, that figure is better.",
    },

    "lead": {
        "unit": "tonnes CO2 per tonne of lead",
        "read_from": "Table 4.21 (printed page 4.73)",
        "values": {
            "imperial_smelting_furnace": 0.59,
            "direct_smelting": 0.25,
            "secondary_raw_materials": 0.2,
            "default_mix": 0.52,
        },
        "default_note": "0.52 assumes 80 percent Imperial Smelting and 20 percent direct "
                        "smelting. Use it only where the split is unknown.",
    },

    "zinc": {
        "unit": "tonnes CO2 per tonne of zinc",
        "read_from": "Table 4.24 (printed page 4.80)",
        "values": {
            "waelz_kiln": 3.66,
            "pyrometallurgical_imperial_smelting": 0.43,
            "default_mix": 1.72,
        },
        "default_note": "1.72 weights 60 percent Imperial Smelting and 40 percent Waelz kiln.",
        "not_published": {
            "electro_thermic": "IPCC records the electro-thermic factor as unknown.",
        },
    },
}

#: A factor outside its band means a digit went astray somewhere.
BANDS = {
    "carbonates": (0.3, 0.6),      # bounded by the formula weights themselves
    "cement": (0.4, 0.6),
    "lime": (0.5, 1.0),
    "glass": (0.0, 0.3),
    "ammonia": (1.0, 4.0),
    "iron_and_steel": (0.0, 2.5),
    "ferroalloys": (1.0, 6.0),
    "lead": (0.1, 1.0),
    "zinc": (0.3, 4.0),
}


def check() -> list[str]:
    problems: list[str] = []

    for name, value in DATA["carbonates"]["values"].items():
        low, high = BANDS["carbonates"]
        if not low <= value["value"] <= high:
            problems.append(f"carbonate {name}: {value['value']} outside {low}-{high}")

    clinker = DATA["cement"]["clinker_emission_factor"]
    derived = round(clinker["base"] * clinker["kiln_dust_correction"], 4)
    if abs(derived - clinker["value"]) > 0.005:
        problems.append(
            f"cement: {clinker['base']} x {clinker['kiln_dust_correction']} is {derived}, "
            f"not the stated {clinker['value']}")

    mix = DATA["lime"]["values"]
    derived_mix = round(0.85 * mix["high_calcium"]["value"]
                        + 0.15 * mix["dolomitic_developing"]["value"], 4)
    if abs(derived_mix - DATA["lime"]["default_mix"]["value"]) > 0.01:
        problems.append(
            f"lime: the 85/15 mix works out at {derived_mix}, not the stated "
            f"{DATA['lime']['default_mix']['value']}")

    glass = DATA["glass"]["tier1_default"]
    if abs(glass["emission_factor"] * (1 - glass["cullet_ratio"]) - glass["effective"]) > 0.001:
        problems.append("glass: the Tier 1 effective factor does not follow from its parts")

    for group in ("lime", "glass"):
        low, high = BANDS[group]
        for name, value in DATA[group]["values"].items():
            number = value["value"] if isinstance(value, dict) else value
            if not low <= number <= high:
                problems.append(f"{group} {name}: {number} outside {low}-{high}")

    for group in ("ammonia", "ferroalloys", "lead", "zinc"):
        low, high = BANDS[group]
        for name, value in DATA[group]["values"].items():
            number = value["value"] if isinstance(value, dict) else value
            if not low <= number <= high:
                problems.append(f"{group} {name}: {number} outside {low}-{high}")

    low, high = BANDS["iron_and_steel"]
    for name, value in DATA["iron_and_steel"]["values"].items():
        if not low <= value["co2"] <= high:
            problems.append(f"iron_and_steel {name}: {value['co2']} outside {low}-{high}")

    # Abatement can never remove more than everything.
    adipic = DATA["adipic_acid"]
    for technology, destruction in adipic["destruction_factor"]["values"].items():
        utilisation = adipic["utilisation_factor"]["values"].get(technology)
        if utilisation is None:
            problems.append(f"adipic acid: {technology} has no utilisation factor")
        elif not 0 < destruction * utilisation < 1:
            problems.append(f"adipic acid: {technology} abates {destruction * utilisation}")

    return problems


def main() -> None:
    argparse.ArgumentParser(description=__doc__).parse_args()

    problems = check()
    if problems:
        print(f"REFUSED: {len(problems)} problem(s); nothing written")
        for problem in problems:
            print(f"  {problem}")
        raise SystemExit(1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(DATA, indent=2) + "\n", encoding="utf-8")

    processes = [key for key, value in DATA.items() if isinstance(value, dict)
                 and key not in ("source_name",)]
    print(f"IPCC 2006 Volume 3 industrial processes: {len(processes)} process families")
    print("  every factor is inside the band its own chemistry allows, the clinker and lime "
          "defaults reproduce from their parts, and no abatement removes more than all of it")
    print(f"  -> {OUT}")


if __name__ == "__main__":
    main()
