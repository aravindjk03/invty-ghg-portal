"""The join between what a user may pick and what the engine can calculate.

Without this join a user chose "Diesel / HSD - stationary", saw a factor printed
on the row, and still got 0.00 tCO2e: the row named no published factor, so the
engine refused it and the report excluded it. The whole inventory came to zero.

These tests hold the join to the same standard as the factor tables themselves:
every mapping must resolve in the registry, in the unit it claims, and produce a
number.
"""
import csv
import pathlib

import pytest

from ghg_core.engine import ActivityRecord
from ghg_core.quantities import D
from service.inventory import (CATALOGUE_MAP, load_catalogue_map, load_registry,
                               run_inventory)


@pytest.fixture(scope="module")
def mappings():
    return load_catalogue_map()


def test_the_map_exists_and_is_not_empty(mappings):
    assert CATALOGUE_MAP.exists(), (
        "data/catalogue_engine_map.csv is missing. Run "
        "scripts/map_catalogue_to_engine.py.")
    assert len(mappings) > 150


def test_the_common_fuels_a_plant_actually_burns_are_all_mapped(mappings):
    # If these are not mapped, a factory's Scope 1 comes to zero and the product
    # is broken in the way the screen reported it.
    mapped = {mapping.catalogue_key for mapping in mappings}
    for key in ("fuel.diesel.stationary", "fuel.natural_gas", "fuel.lpg.stationary",
                "fuel.furnace_oil", "fuel.kerosene_sko", "fuel.cng.stationary",
                "mobile.diesel", "mobile.petrol", "elec.grid.location"):
        assert key in mapped, f"{key} has no published factor mapped to it"


def test_every_mapping_resolves_in_the_registry(mappings):
    known = load_registry()[0].activity_keys()
    for mapping in mappings:
        assert mapping.activity_key in known, (
            f"{mapping.catalogue_key} maps to {mapping.activity_key}, which the "
            f"registry does not hold")


def test_every_mapping_claims_a_unit_the_factor_is_published_in(mappings):
    """A mapping may name any basis the publisher gives, and only those.

    One activity can be published on several: IPCC gives a fuel per tonne and
    per gigajoule, and a plant that meters its works gas needs the second. What
    it must never do is name a unit nobody published, which would send the
    engine a quantity it cannot convert.
    """
    _, activities = load_registry()
    units = {activity.activity_key: set(activity.units) for activity in activities}
    for mapping in mappings:
        assert mapping.unit in units[mapping.activity_key], (
            f"{mapping.catalogue_key} says {mapping.activity_key} is per "
            f"{mapping.unit}, but it is published per "
            f"{sorted(units[mapping.activity_key])}")


def test_every_mapping_actually_calculates(mappings):
    """One unit of every mapped activity must produce a number, not a refusal.

    Run through the same path the product uses, so a factor published only as a
    CO2e composite — which is how DESNZ gives refrigerants, biofuels and water —
    counts as calculable, exactly as it does for a real inventory.
    """
    run = run_inventory(
        [ActivityRecord(
            record_id=str(index),
            activity_key=mapping.activity_key,
            scope="1",
            ghg_category="1.1",
            region=mapping.region,
            value=D(1),
            unit=mapping.unit,
        ) for index, mapping in enumerate(mappings)],
        gwp_set_name="AR5", reporting_year=2025,
    )

    failures = [
        f"{mappings[int(line.record_id)].catalogue_key} -> {line.activity_key}: {line.message}"
        for line in run.line_results
        if line.status != "calculated" or line.emissions_kgco2e <= 0
    ]
    assert not failures, "mapped factors that do not calculate:\n  " + "\n  ".join(failures)


def test_the_fuels_an_indian_plant_burns_are_mapped(mappings):
    # DESNZ publishes UK fuels and has none of these. They come from the IPCC
    # 2006 energy defaults, per tonne, and without them a cement works, steel
    # mill or bagasse boiler reports nothing at all.
    mapped = {mapping.catalogue_key for mapping in mappings}
    for key in ("fuel.coal.anthracite", "fuel.coal.lignite", "fuel.coal.sub_bituminous",
                "fuel.biomass.bagasse", "fuel.biomass.rice_husk", "fuel.charcoal",
                "fuel.blast_furnace_gas", "fuel.coke_oven_gas", "fuel.msw"):
        assert key in mapped, f"{key} has no published factor mapped to it"


def test_biomass_carries_its_combustion_gases_not_its_biogenic_carbon(mappings):
    # Burning bagasse emits CH4 and N2O into Scope 1; its CO2 is biogenic and is
    # a memo item under the GHG Protocol. Putting that CO2 in Scope 1 would
    # overstate a bagasse boiler by an order of magnitude.
    _, activities = load_registry()
    gases = {activity.activity_key: set(activity.gases) for activity in activities}
    bagasse = next(m for m in mappings if m.catalogue_key == "fuel.biomass.bagasse")
    assert gases[bagasse.activity_key] == {"CH4", "N2O"}

    memo = next(a for a in activities
                if a.activity_key.endswith("other_primary_solid_biomass.biogenic_co2"))
    assert memo.scope == "memo"


def test_a_source_with_no_published_factor_is_left_out_rather_than_invented(mappings):
    # Process emissions are real sources that no ingested factor set covers:
    # clinker calcination and nitric acid need the IPCC industrial-processes
    # methods, not a factor per tonne of product. They stay uncalculated on
    # purpose, the report lists them, and nobody reports a made-up number.
    mapped = {mapping.catalogue_key for mapping in mappings}
    for key in ("process.cement_clinker", "process.nitric_acid", "process.ammonia_production",
                "fuel.hydrogen.green"):
        assert key not in mapped


def test_the_map_on_disk_matches_what_the_service_serves(mappings):
    with CATALOGUE_MAP.open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    # The service drops any row the registry cannot resolve, so it may hold
    # fewer - never more, and never a row the file does not have.
    assert len(mappings) <= len(rows)
    on_disk = {(row["catalogue_key"], row["engine_activity_key"]) for row in rows}
    for mapping in mappings:
        assert (mapping.catalogue_key, mapping.activity_key) in on_disk


CATALOGUE_CSV = pathlib.Path(__file__).resolve().parents[1] / "data" / "emission_source_catalogue.csv"

#: Mirrors UNIT_EQUIVALENTS in frontend/src/services/catalogueMap.ts: how the
#: browser turns the unit on a row into the unit a factor is published in.
BROWSER_UNITS = {
    "l": ["litres"], "kl": ["cubic metres", "litres"], "gal": ["litres"],
    "m3": ["cubic metres"], "scm": ["cubic metres"], "nm3": ["cubic metres"],
    "kg": ["kg", "tonnes"], "t": ["tonnes", "kg"], "lb": ["kg", "tonnes"],
    "g": ["kg"], "kwh": ["kWh", "kWh (Net CV)", "kWh (Gross CV)"],
    "mwh": ["kWh", "kWh (Net CV)", "kWh (Gross CV)"],
    "gj": ["GJ", "kWh (Net CV)"], "mmbtu": ["kWh (Net CV)", "GJ"],
    "km": ["km"], "mi": ["km"], "t.km": ["tonne.km"],
    "pax.km": ["passenger.km"], "pax.mi": ["passenger.mi", "passenger.km"],
    "passenger.km": ["passenger.km"], "night": ["Room per night"],
    "fte.hr": ["per FTE Working Hour"], "ml": ["million litres"],
}


def _browser_choice(candidates, unit):
    for engine_unit in BROWSER_UNITS.get(unit.lower(), []):
        for row in candidates:
            if row.unit == engine_unit:
                return row
    return candidates[0]


def test_every_mapped_source_calculates_in_a_unit_the_product_offers(mappings):
    """A mapped source must calculate when entered the way the page offers it.

    The earlier test proves the mapping resolves in ITS OWN unit. This one
    proves the user can get there: it takes each source's allowed units from
    the catalogue the browser ships, picks the mapping the browser would pick,
    and runs it. Mapping a works gas to a per-tonne factor when the page only
    offers gigajoules reads on screen as having no factor at all, which is the
    bug this guards.
    """
    by_key: dict[str, list] = {}
    for mapping in mappings:
        by_key.setdefault(mapping.catalogue_key, []).append(mapping)

    records, meta = [], {}
    with CATALOGUE_CSV.open(encoding="utf-8", newline="") as handle:
        for source in csv.DictReader(handle):
            candidates = by_key.get(source["activity_key"])
            if not candidates:
                continue
            for unit in source["allowed_units"].split("|"):
                chosen = _browser_choice(candidates, unit)
                record_id = str(len(records))
                meta[record_id] = (source["activity_key"], unit)
                records.append(ActivityRecord(
                    record_id=record_id, activity_key=chosen.activity_key,
                    scope=source["scope"], ghg_category=source["ghg_category"],
                    region=chosen.region, value=D(1), unit=unit))

    run = run_inventory(records, gwp_set_name="AR5", reporting_year=2025)
    calculated = {meta[line.record_id][0] for line in run.line_results
                  if line.emissions_kgco2e > 0 or line.biogenic_co2_kg > 0}

    silent = sorted(set(by_key) - calculated)
    assert not silent, (
        "mapped sources that calculate in none of the units the page offers: "
        + ", ".join(silent))
