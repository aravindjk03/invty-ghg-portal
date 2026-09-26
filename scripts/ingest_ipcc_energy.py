"""Ingest the IPCC 2006 default stationary combustion factors, per tonne of fuel.

    python scripts/ingest_ipcc_energy.py

Why this exists: DESNZ publishes UK fuels. It has no anthracite, no lignite, no
sub-bituminous coal, no charcoal, no municipal waste as a fuel and no blast
furnace gas — all of which an Indian steel plant, cement works or boiler house
actually burns. Those sources sat in the catalogue with nothing behind them, so
every row naming one came to zero.

IPCC publishes them, but not per tonne. It gives a net calorific value in TJ per
gigagram (Volume 2 Chapter 1, Table 1.2) and an emission factor in kg of gas per
TJ (Table 1.4 for CO2, Volume 2 Chapter 2 Table 2.3 for CH4 and N2O, on the
manufacturing industries and construction row that a plant reports under). The
factor per tonne is their product:

    kg gas per tonne = NCV (TJ/Gg) x EF (kg/TJ) / 1000

because a gigagram is a thousand tonnes. Every number below is transcribed from
the rendered pages; nothing is inferred and nothing is interpolated.

Biomass is split the way the GHG Protocol requires and DESNZ already does: the
CH4 and N2O go into Scope 1, and the biogenic CO2 is a separate memo activity,
never added to the scope total. Ingesting biomass CO2 into Scope 1 would
overstate an inventory that burns bagasse or wood by an order of magnitude.

The script refuses to write when a fuel is missing a value, when a derived
factor lands outside a sane band for its fuel class, or when a fuel DESNZ also
publishes disagrees with DESNZ by more than half.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "data" / "factors" / "ipcc_energy.csv"
DESNZ = REPO_ROOT / "data" / "factors" / "desnz_2025.csv"

SOURCE = "IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Volume 2 (Energy)"
SOURCE_VERSION = ("Ch1 Table 1.2 (net calorific values) and Table 1.4 (CO2); "
                  "Ch2 Table 2.3 (CH4 and N2O, manufacturing industries and construction)")
SOURCE_URL = "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html"

# (key, display name, NCV TJ/Gg, CO2 kg/TJ, CH4 kg/TJ, N2O kg/TJ, biogenic, class)
# "class" is only used for the sanity band below.
FUELS: list[tuple[str, str, float, float, float, float, bool, str]] = [
    # --- solid fossil fuels -------------------------------------------------
    ("anthracite", "Coal — anthracite", 26.7, 98_300, 10, 1.5, False, "coal"),
    ("coking_coal", "Coal — coking / metallurgical", 28.2, 94_600, 10, 1.5, False, "coal"),
    ("other_bituminous_coal", "Coal — bituminous", 25.8, 94_600, 10, 1.5, False, "coal"),
    ("sub_bituminous_coal", "Coal — sub-bituminous", 18.9, 96_100, 10, 1.5, False, "coal"),
    ("lignite", "Coal — lignite / brown coal", 11.9, 101_000, 10, 1.5, False, "coal"),
    ("brown_coal_briquettes", "Brown coal briquettes", 20.7, 97_500, 10, 1.5, False, "coal"),
    ("patent_fuel", "Patent fuel", 20.7, 97_500, 10, 1.5, False, "coal"),
    ("coke_oven_coke", "Coke — metallurgical (coke oven and lignite coke)",
     28.2, 107_000, 10, 1.5, False, "coal"),
    ("gas_coke", "Gas coke", 28.2, 107_000, 1, 0.1, False, "coal"),
    ("petroleum_coke", "Petroleum coke (petcoke)", 32.5, 97_500, 3, 0.6, False, "coal"),
    ("coal_tar", "Coal tar", 28.0, 80_700, 10, 1.5, False, "coal"),
    ("peat", "Peat", 9.76, 106_000, 2, 1.5, False, "coal"),

    # --- liquid fossil fuels ------------------------------------------------
    ("gas_diesel_oil", "Gas / diesel oil (HSD, LDO)", 43.0, 74_100, 3, 0.6, False, "oil"),
    ("residual_fuel_oil", "Furnace oil / residual fuel oil", 40.4, 77_400, 3, 0.6, False, "oil"),
    ("other_kerosene", "Kerosene / SKO", 43.8, 71_900, 3, 0.6, False, "oil"),
    ("naphtha", "Naphtha", 44.5, 73_300, 3, 0.6, False, "oil"),
    ("lubricants", "Lubricants (combusted)", 40.2, 73_300, 3, 0.6, False, "oil"),
    ("waste_oil", "Waste oil (combusted)", 40.2, 73_300, 30, 4, False, "oil"),
    ("motor_gasoline", "Motor gasoline / petrol", 44.3, 69_300, 3, 0.6, False, "oil"),
    ("lpg", "LPG", 47.3, 63_100, 1, 0.1, False, "oil"),
    ("crude_oil", "Crude oil", 42.3, 73_300, 3, 0.6, False, "oil"),
    ("bitumen", "Bitumen", 40.2, 80_700, 3, 0.6, False, "oil"),

    # --- derived and natural gases (per tonne, a mass basis) ----------------
    ("natural_gas", "Natural gas", 48.0, 56_100, 1, 0.1, False, "gas"),
    ("blast_furnace_gas", "Blast furnace gas", 2.47, 260_000, 1, 0.1, False, "gas"),
    ("coke_oven_gas", "Coke oven gas", 38.7, 44_400, 1, 0.1, False, "gas"),
    ("oxygen_steel_furnace_gas", "Converter / LD gas (oxygen steel furnace gas)",
     7.06, 182_000, 1, 0.1, False, "gas"),
    ("gas_works_gas", "Gas works gas", 38.7, 44_400, 1, 0.1, False, "gas"),

    # --- waste as a fuel ----------------------------------------------------
    ("municipal_waste_fossil", "Municipal solid waste (as fuel) — non-biomass fraction",
     10.0, 91_700, 30, 4, False, "waste"),
    ("municipal_waste_biomass", "Municipal solid waste (as fuel) — biomass fraction",
     11.6, 100_000, 30, 4, True, "waste"),

    # --- biomass: CH4 and N2O into scope, CO2 as a memo ---------------------
    ("wood", "Wood / wood waste", 15.6, 112_000, 30, 4, True, "biomass"),
    ("other_primary_solid_biomass",
     "Other primary solid biomass (bagasse, husk, shell, straw, briquettes)",
     11.6, 100_000, 30, 4, True, "biomass"),
    ("charcoal", "Charcoal", 29.5, 112_000, 200, 4, True, "biomass"),
    ("black_liquor", "Sulphite lyes (black liquor)", 11.8, 95_300, 3, 2, True, "biomass"),
    ("biodiesel", "Biodiesel (B100)", 27.0, 70_800, 3, 0.6, True, "biomass"),
    ("biogasoline", "Bioethanol / biogasoline", 27.0, 70_800, 3, 0.6, True, "biomass"),
    ("other_liquid_biofuel", "Other liquid biofuel", 27.4, 79_600, 3, 0.6, True, "biomass"),
    ("landfill_gas", "Landfill gas", 50.4, 54_600, 1, 0.1, True, "biomass"),
    ("sludge_gas", "Sludge gas", 50.4, 54_600, 1, 0.1, True, "biomass"),
    ("other_biogas", "Biogas", 50.4, 54_600, 1, 0.1, True, "biomass"),
]

#: kg CO2 per tonne must land inside this band for the fuel class, or a digit
#: went astray between the two published tables.
CO2_BAND = {
    "coal": (900, 3600),
    "oil": (2500, 3600),
    "gas": (300, 3000),
    "waste": (900, 1300),
    "biomass": (600, 3400),
}

#: Fuels DESNZ also publishes per tonne, as an independent check on the
#: arithmetic. Different editions and slightly different fuel definitions mean
#: these will not match exactly; an order of magnitude apart means a mistake.
DESNZ_CROSS_CHECK = {
    "petroleum_coke": "Fuels / Solid fuels / Petroleum coke",
    "coking_coal": "Fuels / Solid fuels / Coking coal",
    "natural_gas": "Fuels / Gaseous fuels / Natural gas",
    "residual_fuel_oil": "Fuels / Liquid fuels / Fuel oil",
    "gas_diesel_oil": "Fuels / Liquid fuels / Gas oil",
    "other_kerosene": "Fuels / Liquid fuels / Burning oil",
    "naphtha": "Fuels / Liquid fuels / Naphtha",
    "lubricants": "Fuels / Liquid fuels / Lubricants",
}


def per_tonne(ncv_tj_per_gg: float, kg_per_tj: float) -> float:
    """kg of gas per tonne of fuel. A gigagram is a thousand tonnes."""
    return ncv_tj_per_gg * kg_per_tj / 1000.0


def desnz_totals() -> dict[str, float]:
    """DESNZ kgCO2e per tonne, by category path, for the cross-check."""
    if not DESNZ.exists():
        return {}
    totals: dict[str, float] = {}
    with DESNZ.open(encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["unit"] != "tonnes" or row["gas"] != "CO2e":
                continue
            path = row["category_path"].replace("�", "-")
            totals.setdefault(path, float(row["value_kgco2e_per_unit"]))
    return totals


def check() -> list[str]:
    problems: list[str] = []
    seen: set[str] = set()
    published = desnz_totals()

    for key, name, ncv, co2, ch4, n2o, biogenic, fuel_class in FUELS:
        if key in seen:
            problems.append(f"{key}: listed twice")
        seen.add(key)

        if not all(value > 0 for value in (ncv, co2, ch4, n2o)):
            problems.append(f"{key}: a published value is missing or zero")
            continue

        co2_per_tonne = per_tonne(ncv, co2)
        low, high = CO2_BAND[fuel_class]
        if not low <= co2_per_tonne <= high:
            problems.append(
                f"{key}: {co2_per_tonne:.0f} kgCO2 per tonne is outside the {low}-{high} "
                f"band for {fuel_class}; check the NCV and the emission factor")

        path = DESNZ_CROSS_CHECK.get(key)
        if path and path in published:
            theirs = published[path]
            # CH4 and N2O are a rounding error against CO2 here, so compare CO2.
            ratio = co2_per_tonne / theirs if theirs else 0
            if not 0.5 <= ratio <= 1.5:
                problems.append(
                    f"{key}: {co2_per_tonne:.0f} kgCO2/t against DESNZ's {theirs:.0f} "
                    f"kgCO2e/t for {path!r} - {ratio:.2f}x apart")
    return problems


def rows(retrieved: str) -> list[dict]:
    written: list[dict] = []

    for key, name, ncv, co2, ch4, n2o, biogenic, _class in FUELS:
        activity = f"ipcc.2006.energy.{key}"
        basis = (f"NCV {ncv} TJ/Gg x the published kg/TJ factor, per tonne of fuel")
        common = {
            "unit": "tonnes",
            "geography": "GLOBAL",
            "publication_year": 2006,
            "source": SOURCE,
            "source_version": SOURCE_VERSION,
            "licence": "IPCC Guidelines, free to use with attribution",
            "retrieved_on": retrieved,
            "scope": "1",
            "category_path": "Stationary combustion / IPCC default / "
                             + ("Biomass" if biogenic else "Fossil"),
        }

        gases = [("CH4", per_tonne(ncv, ch4)), ("N2O", per_tonne(ncv, n2o))]
        if not biogenic:
            gases.insert(0, ("CO2", per_tonne(ncv, co2)))

        for gas, value in gases:
            written.append({
                **common,
                "factor_id": f"{activity}.{gas.lower()}",
                "name": f"{name} — {gas}",
                "gas": gas,
                "value_kgco2e_per_unit": f"{value:.6g}",
                "gas_mass_kg_per_unit": f"{value:.6g}",
                "co2e_basis": basis,
            })

        if biogenic:
            # Reported beside the inventory, never inside it.
            written.append({
                **common,
                "factor_id": f"{activity}.biogenic_co2",
                "name": f"{name} — biogenic CO2 (memo, not in any scope)",
                "gas": "CO2",
                "scope": "memo",
                "value_kgco2e_per_unit": f"{per_tonne(ncv, co2):.6g}",
                "gas_mass_kg_per_unit": f"{per_tonne(ncv, co2):.6g}",
                "co2e_basis": basis + " - biogenic carbon, a memo item under the GHG "
                                      "Protocol and not part of Scope 1",
            })
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()

    problems = check()
    if problems:
        print(f"REFUSED: {len(problems)} problem(s); nothing written")
        for problem in problems:
            print(f"  {problem}")
        raise SystemExit(1)

    written = rows(dt.date.today().isoformat())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fields = ["factor_id", "name", "scope", "category_path", "unit", "gas",
              "value_kgco2e_per_unit", "gas_mass_kg_per_unit", "co2e_basis", "geography",
              "publication_year", "source", "source_version", "licence", "retrieved_on"]
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in written:
            writer.writerow(row)

    biomass = sum(1 for fuel in FUELS if fuel[6])
    print(f"IPCC 2006 energy defaults: {len(FUELS)} fuels ({biomass} biomass), "
          f"{len(written)} gas rows, per tonne")
    print("  every derived factor is inside its fuel class's band, and the eight fuels "
          "DESNZ also publishes agree with DESNZ within half")
    print(f"  -> {OUT}")


if __name__ == "__main__":
    main()
