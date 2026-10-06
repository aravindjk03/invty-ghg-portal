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
