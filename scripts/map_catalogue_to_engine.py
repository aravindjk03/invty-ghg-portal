"""Map each browser catalogue source to the published factor that calculates it.

    python scripts/map_catalogue_to_engine.py

The browser's catalogue (frontend/src/data/catalogueData.ts) is the list of
sources a user may pick from. The engine's registry (data/factors/*.csv) is the
list of factors that exist. Until now nothing joined the two, so a user could
pick "Diesel / HSD - stationary", see a factor printed on the row, and still get
0.00 tCO2e - the row named no published factor, so the engine refused it and the
report excluded it.

This writes that join, as data, into data/catalogue_engine_map.csv.

The mapping below is TRANSCRIBED, not inferred. Automatic name matching was
tried and resolved 8 of 266 sources, attaching two of them to the wrong thing
(propane to the refrigerant R290, butane to R600); the rest of the catalogue
either names something DESNZ calls differently or something no ingested set
publishes at all. A wrong factor is worse than none, so each line below states
the DESNZ or CEA family it means and the script refuses to write if a family
does not exist, if its rows disagree on a value, or if a mapped source ends up
with no unit the row could be entered in.

A catalogue source with no entry here keeps its honest state: no published
factor, not calculated, listed in the report's exclusion register. That is the
correct answer for rice husk, bagasse and the other sources no published set
covers - inventing a number for them is the failure this whole library exists
to prevent.
"""
from __future__ import annotations

import argparse
import csv
import json
import pathlib
import re
from collections import defaultdict

REPO = pathlib.Path(__file__).resolve().parent.parent
CATALOGUE = REPO / "frontend" / "src" / "data" / "catalogueData.ts"
OUT = REPO / "data" / "catalogue_engine_map.csv"

# DESNZ publishes each activity once per unit, as ..._<unit code>. The family is
# everything before that code; the engine's activity key includes it.
UNIT_CODE = {
    "1": "cubic metres", "2": "GJ", "3": "kg", "5": "kWh", "6": "kWh (Gross CV)",
    "7": "kWh (Net CV)", "8": "litres", "14": "tonne.km", "15": "tonnes",
}

#: catalogue activity_key -> the DESNZ activity NAME it means, written the way
#: the published workbook writes it, so every line can be checked against the
#: source without knowing DESNZ's internal numbering.
#:
#: The NAME is the key, not the category path. DESNZ publishes several different
#: measurements under one path and tells them apart only in the trailing
#: qualifier - a van by its fuel, refuse by whether it is landfilled or burned,
#: a flight by whether radiative forcing is included. Keying on the path picked
#: one of them silently.
DESNZ_BY_NAME: dict[str, str] = {
    # --- Scope 1, stationary combustion ---------------------------------
    "fuel.coal.imported_steam": "Fuels / Solid fuels / Coal (industrial)",
    "fuel.coal.coking": "Fuels / Solid fuels / Coking coal",
    "fuel.coke.petroleum": "Fuels / Solid fuels / Petroleum coke",
    "fuel.biomass.wood_chips": "Bioenergy / Biomass / Wood chips",
    "fuel.biomass.wood_pellets": "Bioenergy / Biomass / Wood pellets",
    "fuel.biomass.wood_logs": "Bioenergy / Biomass / Wood logs",
    "fuel.biomass.agri_residue": "Bioenergy / Biomass / Grass / straw",
    "fuel.diesel.stationary": "Fuels / Liquid fuels / Diesel (100% mineral diesel)",
    "fuel.ldo": "Fuels / Liquid fuels / Gas oil",
    "fuel.furnace_oil": "Fuels / Liquid fuels / Fuel oil",
    "fuel.kerosene_sko": "Fuels / Liquid fuels / Burning oil",
    "fuel.naphtha": "Fuels / Liquid fuels / Naphtha",
    "fuel.lpg.stationary": "Fuels / Gaseous fuels / LPG",
    "fuel.propane": "Fuels / Gaseous fuels / Propane",
    "fuel.butane": "Fuels / Gaseous fuels / Butane",
    "fuel.lng": "Fuels / Gaseous fuels / LNG",
    "fuel.biodiesel.stationary": "Bioenergy / Biofuel / Biodiesel ME",
    "fuel.ethanol.stationary": "Bioenergy / Biofuel / Bioethanol",
    "fuel.lubricants": "Fuels / Liquid fuels / Lubricants",
    "fuel.waste_oil": "Fuels / Liquid fuels / Waste oils",
    "fuel.natural_gas": "Fuels / Gaseous fuels / Natural gas",
    "fuel.png": "Fuels / Gaseous fuels / Natural gas",
    "fuel.cng.stationary": "Fuels / Gaseous fuels / CNG",
    "fuel.biogas": "Bioenergy / Biogas / Biogas",
    "fuel.landfill_gas": "Bioenergy / Biogas / Landfill gas",

    # --- Scope 1, mobile combustion --------------------------------------
    "mobile.diesel": "Fuels / Liquid fuels / Diesel (average biofuel blend)",
    "mobile.petrol": "Fuels / Liquid fuels / Petrol (average biofuel blend)",
    "mobile.cng": "Fuels / Gaseous fuels / CNG",
    "mobile.lpg_auto": "Fuels / Gaseous fuels / LPG",
    "mobile.biodiesel_blend": "Bioenergy / Biofuel / Biodiesel ME",
    "mobile.ethanol_blend": "Bioenergy / Biofuel / Bioethanol",
    "mobile.forklift_diesel": "Fuels / Liquid fuels / Gas oil",
    "mobile.forklift_lpg": "Fuels / Gaseous fuels / LPG",
    "mobile.atf_own_aircraft": "Fuels / Liquid fuels / Aviation turbine fuel",
    "mobile.avgas": "Fuels / Liquid fuels / Aviation spirit",
    "mobile.marine_gas_oil": "Fuels / Liquid fuels / Marine gas oil",
    "mobile.marine_hfo": "Fuels / Liquid fuels / Marine fuel oil",
    "mobile.rail_diesel": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.excavator": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.dozer": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.crane": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.haul_truck": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.loader": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.tractor": "Fuels / Liquid fuels / Gas oil",
    "mobile.offroad.genset_mobile": "Fuels / Liquid fuels / Gas oil",

    # --- Scope 1, fugitive: refrigerants DESNZ publishes a GWP for --------
    # DESNZ gives each refrigerant twice: counting only Kyoto gases, and
    # counting everything in the blend. A leak releases the whole charge, so
    # the total is the honest figure; the Kyoto-only one would under-report
    # any blend containing an HCFC.
    "fugitive.refrigerant.r134a": "Refrigerant & other / Kyoto protocol products / HFC-134a (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r410a": "Refrigerant & other / Blends / R410A (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r404a": "Refrigerant & other / Blends / R404A (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r407c": "Refrigerant & other / Blends / R407C (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r32": "Refrigerant & other / Kyoto protocol products / HFC-32 (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r507a": "Refrigerant & other / Blends / R507A (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r417a": "Refrigerant & other / Blends / R417A (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r23": "Refrigerant & other / Kyoto protocol products / HFC-23 (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r125": "Refrigerant & other / Kyoto protocol products / HFC-125 (Total emissions including non-Kyoto products)",
    "fugitive.refrigerant.r143a": "Refrigerant & other / Kyoto protocol products / HFC-143a (Total emissions including non-Kyoto products)",
    "fugitive.sf6": "Refrigerant & other / Kyoto protocol products / Sulphur hexafluoride (SF6) (Total emissions including non-Kyoto products)",
    "fugitive.nf3": "Refrigerant & other / Kyoto protocol products / Nitrogen trifluoride (Total emissions including non-Kyoto products)",

    # --- Scope 2: purchased heat ------------------------------------------
    # Heat bought in energy units converts exactly to the kWh DESNZ publishes
    # this for. Steam bought by the TONNE does not: that needs the enthalpy of
    # the steam, which only the supplier knows, so it stays unmapped. District
    # cooling has no published factor at all and is not this one.
    "heat.purchased": "Heat and steam / Heat and steam / District heat and steam / kWh",

    # --- Scope 3, cat 4: upstream transport --------------------------------
    # Where DESNZ splits a mode by load or fuel, the average is the defensible
    # choice for a catalogue that offers one row, and every row names which
    # variant it used.
    "cat4.road_hgv": "Freighting goods / HGV (all diesel) / All HGVs (Average laden)",
    "cat4.road_lcv": "Freighting goods / Vans / Average (up to 3.5 tonnes) (Diesel)",
    "cat4.rail": "Freighting goods / Rail / Freight train",
    "cat4.sea_container": "Freighting goods / Cargo ship / Container ship / Average",
    "cat4.sea_bulk": "Freighting goods / Cargo ship / Bulk carrier / Average",
    # With radiative forcing: the GHG Protocol asks for the warming a flight
    # actually causes, not the CO2 alone.
    "cat4.air_freight": "Freighting goods / Freight flights / International, to / from non-UK (With RF)",
    "cat4.courier": "Freighting goods / Vans / Average (up to 3.5 tonnes) (Diesel)",

    # --- Scope 3, cat 5: waste ---------------------------------------------
    "cat5.landfill_mixed": "Waste disposal / Refuse / Commercial and industrial waste (Landfill)",
    "cat5.landfill_organic": "Waste disposal / Refuse / Organic: mixed food and garden waste (Landfill)",
    "cat5.incineration_energy": "Waste disposal / Refuse / Commercial and industrial waste (Incineration with Energy Recovery)",
    "cat5.composting": "Waste disposal / Refuse / Organic: mixed food and garden waste (Composting)",
    "cat5.anaerobic_digestion": "Waste disposal / Refuse / Organic: mixed food and garden waste (Anaerobic digestion)",
    "cat5.wastewater_treated": "Water treatment / Water treatment / Water treatment",

    # --- Scope 3, cat 6: business travel -----------------------------------
    "cat6.air_domestic_economy": "Business travel- air / Flights / Domestic, to / from UK / Average passenger (With RF)",
    "cat6.air_short_haul_economy": "Business travel- air / Flights / Short-haul, to / from UK / Economy class (With RF)",
    "cat6.air_long_haul_economy": "Business travel- air / Flights / Long-haul, to / from UK / Economy class (With RF)",
    "cat6.air_long_haul_premium": "Business travel- air / Flights / Long-haul, to / from UK / Premium economy class (With RF)",
    "cat6.air_long_haul_business": "Business travel- air / Flights / Long-haul, to / from UK / Business class (With RF)",
    "cat6.air_long_haul_first": "Business travel- air / Flights / Long-haul, to / from UK / First class (With RF)",
    "cat6.bus_coach": "Business travel- land / Bus / Coach",
    "cat6.ferry": "Business travel- sea / Ferry / Average (all passenger)",
    "cat6.hotel_nights": "Hotel stay / Hotel stay / India",

    # --- Scope 3, cat 9 -----------------------------------------------------
    "cat9.downstream_transport": "Freighting goods / HGV (all diesel) / All HGVs (Average laden)",

    # --- Scope 3, cat 1 -----------------------------------------------------
    "cat1.material.water_supply": "Water supply / Water supply / Water supply",
}

#: catalogue activity_key -> an engine activity key outside DESNZ, given in full.
DIRECT: dict[str, str] = {
    # CEA publishes the Indian grid; this is the all-India weighted average
    # including imports, which is the figure a site without a state-level
    # factor should report on.
    "elec.grid.location": "cea.grid.weighted_average_incl_res.incl_imports.2025_26",
    # Charging an owned vehicle on the site's own supply is the same purchased
    # electricity as any other kilowatt hour drawn from the grid.
    "elec.ev_charging_onsite": "cea.grid.weighted_average_incl_res.incl_imports.2025_26",
    "elec.submetered_tenant": "cea.grid.weighted_average_incl_res.incl_imports.2025_26",
    "elec.open_access": "cea.grid.weighted_average_incl_res.incl_imports.2025_26",
}


def load_catalogue() -> list[dict]:
    text = CATALOGUE.read_text(encoding="utf-8")
    marker = "export const CATALOGUE_SOURCES: CatalogueSource[] = "
    start = text.index(marker) + len(marker)
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "[":
            depth += 1
        elif text[index] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:index + 1])
    raise SystemExit("REFUSED: the catalogue array could not be read.")


def desnz_name(raw: str) -> str:
    """A DESNZ activity name with its level separators normalised to " / ".

    The workbook separates levels with an em dash, and the ingested CSV carries
    whatever the source encoding produced. Normalising both sides here lets the
    mapping above be written the way the workbook reads.
    """
    text = raw.replace("\ufffd", "/").replace("\u2014", "/").replace("\u2013", "/")
    return re.sub(r"\s*/\s*", " / ", text).strip()


def load_engine() -> tuple[dict, dict]:
    """Engine activities by key, and the DESNZ activities grouped by name."""
    activities: dict[str, dict] = {}
    by_name: dict[str, list[tuple[str, str, str]]] = defaultdict(list)

    for name in ("desnz_2025", "cea_grid", "india_transport", "epa_supply_chain"):
        path = REPO / "data" / "factors" / f"{name}.csv"
        if not path.exists():
            continue
        with path.open(encoding="utf-8", errors="replace") as handle:
            for row in csv.DictReader(handle):
                key = (re.sub(r"_\d+$", "", row["factor_id"])
                       if name == "desnz_2025" else row["factor_id"])
                record = activities.setdefault(key, {
                    "name": row["name"].replace("�", "-"),
                    "path": row["category_path"].replace("�", "-"),
                    "unit": row["unit"],
                    "scope": row["scope"],
                    "region": row["geography"],
                    "source": row["source"],
                    "values": {},
                })
                record["values"][row["gas"]] = row["value_kgco2e_per_unit"]
                if name == "desnz_2025":
                    record["desnz_name"] = desnz_name(row["name"])
                    by_name[record["desnz_name"]].append((key, record["unit"], record["scope"]))
    return activities, by_name


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    catalogue = {source["activity_key"]: source for source in load_catalogue()}
    activities, by_name = load_engine()
    problems: list[str] = []
    rows: list[dict] = []

    def add(catalogue_key: str, engine_key: str) -> None:
        source = catalogue[catalogue_key]
        activity = activities[engine_key]
        rows.append({
            "catalogue_key": catalogue_key,
            "catalogue_name": source["display_name"].replace("�", "-"),
            "unit": activity["unit"],
            "engine_activity_key": engine_key,
            "engine_name": activity.get("desnz_name") or activity["path"],
            "engine_region": activity["region"],
            "engine_source": activity["source"],
        })

    for catalogue_key, published_name in sorted(DESNZ_BY_NAME.items()):
        if catalogue_key not in catalogue:
            problems.append(f"{catalogue_key}: not a catalogue source")
            continue
        candidates = by_name.get(published_name)
        if not candidates:
            problems.append(
                f"{catalogue_key}: DESNZ publishes nothing called {published_name!r}")
            continue

        # DESNZ repeats some activities across sheet sections. Keep one key per
        # unit, and refuse if the repeats disagree on what they publish.
        best: dict[str, str] = {}
        for key, unit, _scope in sorted(candidates):
            if unit in best:
                if activities[key]["values"] != activities[best[unit]]["values"]:
                    problems.append(
                        f"{catalogue_key}: {published_name!r} has two {unit} rows that "
                        f"disagree ({best[unit]} vs {key})")
                continue
            best[unit] = key

        if not best:
            problems.append(
                f"{catalogue_key}: {published_name!r} resolved to no usable unit")
            continue
        for key in best.values():
            add(catalogue_key, key)

    for catalogue_key, engine_key in sorted(DIRECT.items()):
        if catalogue_key not in catalogue:
            problems.append(f"{catalogue_key}: not a catalogue source")
        elif engine_key not in activities:
            problems.append(f"{catalogue_key}: the engine has no activity {engine_key!r}")
        else:
            add(catalogue_key, engine_key)

    mapped = {row["catalogue_key"] for row in rows}
    for catalogue_key in sorted(DESNZ_BY_NAME) + sorted(DIRECT):
        if catalogue_key in catalogue and catalogue_key not in mapped:
            problems.append(f"{catalogue_key}: mapped but produced no row")

    if problems:
        print(f"REFUSED: {len(problems)} problem(s); nothing written")
        for problem in problems:
            print(f"  {problem}")
        raise SystemExit(1)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    fields = ["catalogue_key", "catalogue_name", "unit", "engine_activity_key",
              "engine_name", "engine_region", "engine_source"]
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in sorted(rows, key=lambda item: (item["catalogue_key"], item["unit"])):
            writer.writerow(row)

    unmapped = sorted(set(catalogue) - mapped)
    print(f"{len(mapped)} of {len(catalogue)} catalogue sources map to a published factor, "
          f"across {len(rows)} unit variants")
    print(f"  -> {OUT}")
    if not args.quiet:
        print(f"  {len(unmapped)} sources have no published factor in any ingested set and stay "
              f"uncalculated by design; the report lists them:")
        for key in unmapped[:12]:
            print(f"    {key}: {catalogue[key]['display_name'].replace(chr(0xfffd), '-')}")
        if len(unmapped) > 12:
            print(f"    ... and {len(unmapped) - 12} more")


if __name__ == "__main__":
    main()
