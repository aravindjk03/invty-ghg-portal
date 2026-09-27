"""The inventory endpoint: one engine, the customer's GWP basis, honest failures.

Runs against the ingested factor tables in data/factors, so it also proves the
ingestion produced something the engine can actually resolve.
"""
import pytest

pytest.importorskip("fastapi")

from service.inventory import activities_for, load_registry  # noqa: E402
from service.inventory_api import (InventoryRequest, calculate_inventory,  # noqa: E402
                                   list_activities)

DIESEL = "desnz.2025.1_101_1011_8"          # Fuels / Liquid fuels / Diesel, per litre
# CEA publishes two variants side by side; this is the one including imports.
GRID_IN = "cea.grid.weighted_average_incl_res.incl_imports.2025_26"


def request_for(records, gwp_set="AR5", year=2025, view="location"):
    return InventoryRequest(records=records, gwp_set=gwp_set, reporting_year=year,
                            scope2_view=view)


def diesel_record(litres="1000"):
    return {"record_id": "r1", "activity_key": DIESEL, "scope": "1",
            "ghg_category": "1.1", "region": "UK", "value": litres, "unit": "litres"}


def test_the_ingested_factors_load_into_the_engine():
    registry, activities = load_registry()
    assert len(registry) > 3000
    assert len(activities) > 1000
    assert activities_for("1") and activities_for("2") and activities_for("3")


def test_a_fuel_line_is_calculated_gas_by_gas():
    response = calculate_inventory(request_for([diesel_record()]), "fixture")
    line = response.lines[0]
    assert line.status == "calculated"
    assert set(line.gas_breakdown) == {"CO2", "CH4", "N2O"}
    assert line.gwp_applied["CH4"] == "30"        # AR5 fossil methane
    assert float(line.emissions_kgco2e) == pytest.approx(2570.84, abs=0.1)
    assert "DESNZ" in (line.factor_source or "")


def test_the_same_records_give_a_different_answer_under_ar6():
    under_ar5 = calculate_inventory(request_for([diesel_record()], "AR5"), "f")
    under_ar6 = calculate_inventory(request_for([diesel_record()], "AR6"), "f")
    assert under_ar5.gwp_set == "AR5" and under_ar6.gwp_set == "AR6"
    assert under_ar5.lines[0].gwp_applied["N2O"] == "265"
    assert under_ar6.lines[0].gwp_applied["N2O"] == "273"
    assert under_ar5.totals.scope1 != under_ar6.totals.scope1


def test_indian_grid_electricity_resolves_for_its_own_year():
    record = {"record_id": "e1", "activity_key": GRID_IN, "scope": "2",
              "ghg_category": "2.1", "region": "IN", "value": "1000", "unit": "kWh",
              "scope2_view": "location"}
    response = calculate_inventory(request_for([record], year=2025), "f")
    line = response.lines[0]
    assert line.status == "calculated"
    assert float(line.emissions_kgco2e) == pytest.approx(675.1, abs=0.5)
    assert "CEA" in (line.factor_source or "")


def test_location_and_market_are_never_summed():
    records = [
        {"record_id": "loc", "activity_key": GRID_IN, "scope": "2", "ghg_category": "2.1",
         "region": "IN", "value": "1000", "unit": "kWh", "scope2_view": "location"},
        {"record_id": "mkt", "activity_key": GRID_IN, "scope": "2", "ghg_category": "2.1",
         "region": "IN", "value": "1000", "unit": "kWh", "scope2_view": "market"},
    ]
    response = calculate_inventory(request_for(records), "f")
    headline = float(response.totals.scope2_headline)
    assert headline == pytest.approx(float(response.totals.scope2_location))
    assert headline < float(response.totals.scope2_location) + float(response.totals.scope2_market)


def test_a_missing_factor_is_reported_not_treated_as_zero():
    record = {"record_id": "x", "activity_key": "desnz.2025.does_not_exist", "scope": "1",
              "ghg_category": "1.1", "region": "UK", "value": "10", "unit": "litres"}
    response = calculate_inventory(request_for([record]), "f")
    line = response.lines[0]
    assert line.status == "unavailable"
    assert "not zero" in line.message.lower() or "no emission factor" in line.message.lower()
    assert response.excluded and response.excluded[0]["record_id"] == "x"
    assert float(response.totals.scope1) == 0


def test_an_unknown_unit_is_refused_with_the_reason():
    record = dict(diesel_record(), unit="buckets")
    response = calculate_inventory(request_for([record]), "f")
    assert response.lines[0].status == "unavailable"
    assert "unit" in response.lines[0].message.lower()


def test_a_record_with_no_value_is_incomplete_not_zero():
    record = dict(diesel_record())
    record["value"] = None
    response = calculate_inventory(request_for([record]), "f")
    assert response.lines[0].status == "incomplete"


def test_every_run_carries_its_provenance():
    response = calculate_inventory(request_for([diesel_record()], "AR6"), "IPCC AR6 (url)")
    assert response.run_id and response.engine_version
    assert response.gwp_set == "AR6"
    assert "AR6" in response.gwp_source or "IPCC" in response.gwp_source


def test_the_activity_list_can_be_searched_and_is_scoped():
    fuels = list_activities("1", None, "diesel", 20)
    assert fuels and all(item.scope == "1" for item in fuels)
    assert all("diesel" in item.name.lower() or "diesel" in item.category_path.lower()
               for item in fuels)


def test_a_source_published_only_as_co2e_still_calculates():
    # DESNZ publishes waste, materials and hotel stays as a CO2e composite with
    # no gas split. Those must still calculate, carrying the publisher's basis.
    from service.inventory import activities_for

    composite = next(a for a in activities_for("3")
                     if a.gases == ("CO2e",) and a.unit == "tonnes")
    record = {"record_id": "w1", "activity_key": composite.activity_key, "scope": "3",
              "ghg_category": "3.5", "region": composite.region, "value": "10",
              "unit": composite.unit}
    response = calculate_inventory(request_for([record]), "f")
    line = response.lines[0]
    assert line.status == "calculated"
    assert list(line.gas_breakdown) == ["CO2e"]
    # A composite is already CO2e, so no GWP is applied on top of it.
    assert line.gwp_applied["CO2e"] == "1"


def test_an_activity_with_no_factor_at_all_still_fails():
    record = {"record_id": "none", "activity_key": "desnz.2025.nothing_here", "scope": "1",
              "ghg_category": "1.1", "region": "UK", "value": "1", "unit": "litres"}
    response = calculate_inventory(request_for([record]), "f")
    assert response.lines[0].status == "unavailable"
