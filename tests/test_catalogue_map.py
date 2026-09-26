"""The join between what a user may pick and what the engine can calculate.

Without this join a user chose "Diesel / HSD - stationary", saw a factor printed
on the row, and still got 0.00 tCO2e: the row named no published factor, so the
engine refused it and the report excluded it. The whole inventory came to zero.

These tests hold the join to the same standard as the factor tables themselves:
every mapping must resolve in the registry, in the unit it claims, and produce a
number.
"""
import csv

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


def test_every_mapping_claims_the_unit_the_factor_is_published_in(mappings):
    _, activities = load_registry()
    units = {activity.activity_key: activity.unit for activity in activities}
    for mapping in mappings:
        assert units[mapping.activity_key] == mapping.unit, (
            f"{mapping.catalogue_key} says {mapping.activity_key} is per "
            f"{mapping.unit}, but it is published per {units[mapping.activity_key]}")


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


def test_a_source_with_no_published_factor_is_left_out_rather_than_invented(mappings):
    # Rice husk, bagasse and the rest are real sources that no ingested set
    # publishes a factor for. They stay uncalculated on purpose: the report
    # lists them, and nobody reports a made-up number for them.
    mapped = {mapping.catalogue_key for mapping in mappings}
    for key in ("fuel.biomass.rice_husk", "fuel.biomass.bagasse", "fuel.coal.anthracite"):
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
