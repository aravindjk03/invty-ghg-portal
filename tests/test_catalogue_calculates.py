"""Every source a user can pick, with a published factor behind it, calculates.

The catalogue map joins what the picker offers to the engine's published
factors. A mapping that resolves to nothing, or files a Scope 3 purchase under
Scope 1, would look like a working row and report the wrong inventory. Each
mapping is run through the engine as the browser would send it.
"""
import json
from decimal import Decimal
from pathlib import Path

import pytest

pytest.importorskip("pydantic")

from service.inventory_api import (InventoryRequest, calculate_inventory,  # noqa: E402
                                   catalogue_mappings)

CATALOGUE = {
    source["activity_key"]: source
    for source in json.loads(
        (Path(__file__).resolve().parents[1] / "data" / "emission_source_catalogue.json")
        .read_text(encoding="utf-8"))
}
MAPPINGS = [m for m in catalogue_mappings() if CATALOGUE[m.catalogue_key]["scope"] != "memo"]


def test_every_mapping_names_a_catalogue_source():
    assert {m.catalogue_key for m in catalogue_mappings()} <= set(CATALOGUE)


@pytest.mark.parametrize("mapping", MAPPINGS, ids=lambda m: f"{m.catalogue_key}[{m.unit}]")
def test_the_mapping_calculates_in_its_own_scope_and_category(mapping):
    source = CATALOGUE[mapping.catalogue_key]
    record = {"record_id": "r", "activity_key": mapping.activity_key, "scope": source["scope"],
              "ghg_category": source["ghg_category"], "region": mapping.region,
              "value": "1000", "unit": mapping.unit}
    if source["scope"] == "2":
        record["scope2_view"] = "location"
    response = calculate_inventory(InventoryRequest(
        records=[record], gwp_set="AR5", reporting_year=2025, scope2_view="location"), "test")

    line = next(line for line in response.lines if line.record_id == "r")
    assert line.status == "calculated", line.message
    assert Decimal(line.emissions_kgco2e) > 0
    # Its own line, not the Category 3 upstream line a fuel also produces.
    assert (line.scope, line.ghg_category) == (source["scope"], source["ghg_category"])


# --- the units a row is offered -------------------------------------------------

from service.inventory_api import unit_choices  # noqa: E402

CHOICES = [c for c in unit_choices() if CATALOGUE[c.catalogue_key]["scope"] != "memo"]


@pytest.mark.parametrize("choice", CHOICES, ids=lambda c: f"{c.catalogue_key}[{c.unit}]")
def test_every_unit_a_row_offers_calculates(choice):
    source = CATALOGUE[choice.catalogue_key]
    # A rupee row reaches the engine in dollars, converted at the stated rate.
    unit = "USD" if choice.needs_fx else choice.unit
    record = {"record_id": "r", "activity_key": choice.activity_key, "scope": source["scope"],
              "ghg_category": source["ghg_category"], "region": choice.region,
              "value": "1000", "unit": unit}
    if source["scope"] == "2":
        record["scope2_view"] = "location"
    response = calculate_inventory(InventoryRequest(
        records=[record], gwp_set="AR5", reporting_year=2025, scope2_view="location"), "test")
    line = next(line for line in response.lines if line.record_id == "r")
    assert line.status == "calculated", line.message


def test_only_rupees_need_a_rate():
    assert {c.unit for c in CHOICES if c.needs_fx} == {"INR"}


def test_a_unit_that_cannot_calculate_is_not_offered():
    offered = {(c.catalogue_key, c.unit) for c in CHOICES}
    # Floor area against an electricity factor, and a count of parcels.
    assert ("cat9.warehousing", "m2.yr") not in offered
    assert ("cat4.courier", "parcel") not in offered
