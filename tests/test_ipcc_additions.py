"""The IPCC values added on 2026-11-12, each checked against the published cell.

Methanol, ethylene, carbon black and HFC-23 (IPCC 2006 Volume 3 Chapter 3),
rice cultivation (Volume 4 Chapter 5), tyre-derived fuel (Volume 2, "Industrial
wastes", per GJ only) and Novec 1230 (AR6 Table 7.SM.7). A figure here that no
longer matches the table it cites is a transcription error, not a refinement.
"""
import json
from decimal import Decimal
from pathlib import Path

import pytest

pytest.importorskip("pydantic")

from ghg_core.methods import (carbon_black_emissions, ethylene_emissions,  # noqa: E402
                              hfc23_byproduct, methanol_emissions, rice_ch4)
from service.inventory_api import InventoryRequest, calculate_inventory  # noqa: E402
from service.methods_api import (ChemicalIndustryRequest,  # noqa: E402
                                 RiceCultivationRequest, calculate_method)

DATA = Path(__file__).resolve().parents[1] / "data"


def test_methanol_default_is_table_3_12():
    result = methanol_emissions(1)
    assert result.gas_masses_kg["CO2"] == Decimal("670")       # 0.67 t CO2 per t
    assert result.gas_masses_kg["CH4"] == Decimal("2.3")       # section 3.9.2.2


def test_ethylene_is_scaled_by_the_table_3_15_region():
    india = ethylene_emissions(1, feedstock="naphtha", region="asia_africa_russia")
    europe = ethylene_emissions(1, feedstock="naphtha", region="western_europe")
    assert europe.gas_masses_kg["CO2"] == Decimal("1730")      # Table 3.14
    assert india.gas_masses_kg["CO2"] == Decimal("1730") * Decimal("1.3")
    assert ethylene_emissions(1, feedstock="ethane").gas_masses_kg["CH4"] == Decimal("6")


def test_carbon_black_and_hfc23_defaults():
    assert carbon_black_emissions(1).gas_masses_kg["CO2"] == Decimal("2620")  # Table 3.23
    assert carbon_black_emissions(1).gas_masses_kg["CH4"] == Decimal("0.06")  # Table 3.24
    assert hfc23_byproduct(1).gas_masses_kg["HFC-23"] == Decimal("30")       # Table 3.28


def test_an_unpublished_process_choice_is_refused():
    with pytest.raises(KeyError):
        methanol_emissions(1, process="made_up_route")


def test_rice_follows_equations_5_1_to_5_3():
    # 1.30 x 0.60 x 0.68 x (1 + 5 x 0.14)^0.59, for 120 days on 10 ha.
    result = rice_ch4(10, 120, water_regime="irrigated_intermittent_single_aeration",
                      pre_season="non_flooded_over_180_days",
                      amendments_t_per_ha={"farmyard_manure": 5})
    expected = 1.30 * 0.60 * 0.68 * (1.7 ** 0.59) * 120 * 10
    assert float(result.ch4_kg) == pytest.approx(expected, rel=1e-9)
    assert result.components["EF_c"] == Decimal("1.30")


def test_rice_baseline_with_no_adjustment_is_table_5_11():
    assert rice_ch4(1, 1).daily_factor == Decimal("1.30")


def test_rice_methane_is_biogenic_in_the_method_response():
    response = calculate_method(RiceCultivationRequest(
        method="rice_cultivation", gwp_set="AR6",
        seasons=[{"harvested_area_ha": 1, "cultivation_days": 100}]))
    # 130 kg CH4 at the AR6 non-fossil GWP of 27.0.
    assert Decimal(response.co2e_kg) == Decimal("130") * Decimal("27.0")


def test_chemical_industry_reports_the_new_processes_together():
    response = calculate_method(ChemicalIndustryRequest(
        method="chemical_industry", methanol_tonnes=100, hcfc22_tonnes=2))
    assert Decimal(response.gas_masses_kg["CO2"]) == Decimal("67000")
    assert Decimal(response.gas_masses_kg["HFC-23"]) == Decimal("60")


def _line(activity_key, value, unit, gwp="AR6", scope="1", category="1.4"):
    response = calculate_inventory(InventoryRequest(
        gwp_set=gwp, reporting_year=2025,
        records=[{"record_id": "r", "activity_key": activity_key, "scope": scope,
                  "ghg_category": category, "region": "GLOBAL", "value": value,
                  "unit": unit}]), "test")
    assert not response.excluded, response.excluded
    return next(line for line in response.lines if line.record_id == "r")


def test_novec_uses_the_inventory_gwp_set():
    gwp = json.loads((DATA / "gwp" / "ar6.json").read_text())["values"]["FK-5-1-12"]
    assert gwp == 0.114
    assert Decimal(_line("gas.released.fk_5_1_12", "50", "kg").emissions_kgco2e) \
        == Decimal("50") * Decimal("0.114")
    # AR5 publishes only "<1"; the bound is used so the figure cannot understate.
    assert Decimal(_line("gas.released.fk_5_1_12", "50", "kg", gwp="AR5").emissions_kgco2e) \
        == Decimal("50")


def test_tyre_fuel_is_industrial_wastes_per_gj():
    line = _line("ipcc.2006.energy.industrial_wastes", "1", "GJ", category="1.1")
    assert Decimal(line.gas_breakdown["CO2"]) == Decimal("143")   # 143,000 kg/TJ


def test_methane_released_takes_the_fossil_gwp():
    assert Decimal(_line("gas.released.ch4_fossil", "10", "kg").emissions_kgco2e) \
        == Decimal("10") * Decimal("29.8")


def test_derived_values_show_their_working():
    line = _line("derived.acetylene_combustion", "1", "kg", category="1.1")
    assert Decimal(line.emissions_kgco2e) == Decimal("3.3804")
    rows = (DATA / "factors" / "supplementary.csv").read_text(encoding="utf-8")
    assert "2 x 44.009 / 26.038" in rows


# --- second round: incineration, hydrogen, biochar ----------------------------

def test_incineration_of_industrial_waste_is_table_5_2():
    # 50% carbon x 90% fossil x 100% oxidised x 44/12, per DRY tonne.
    line = _line("ipcc.2006.incineration.industrial_waste", "1", "tonnes", scope="3", category="3.5")
    assert Decimal(line.gas_breakdown["CO2"]) == Decimal("1650")
    assert Decimal(line.gas_breakdown["N2O"]) == Decimal("0.1")       # Table 5.6


def test_sewage_sludge_carbon_is_biogenic_and_only_n2o_counts():
    line = _line("ipcc.2006.incineration.sewage_sludge", "1", "tonnes", scope="3", category="3.5")
    assert Decimal(line.gas_breakdown["CO2"]) == 0
    assert Decimal(line.gas_breakdown["N2O"]) == Decimal("0.99")      # 990 g per dry t


def test_hydrogen_reforming_is_table_3_30_tier_1b():
    line = _line("ipcc.2019.hydrogen.natural_gas_reforming", "1", "tonnes", category="1.3")
    assert Decimal(line.gas_breakdown["CO2"]) == Decimal("9256.5")    # 165 x 0.0153 x 44/12


def test_biochar_removal_is_a_memo_never_netted():
    response = calculate_inventory(InventoryRequest(
        gwp_set="AR6", reporting_year=2025,
        records=[{"record_id": "r", "activity_key": "ipcc.2019.biochar.wood_pyrolysis_medium",
                  "scope": "memo", "ghg_category": "memo", "region": "GLOBAL", "value": "1",
                  "unit": "tonnes", "memo_bucket": "removals"}]), "test")
    line = response.lines[0]
    assert Decimal(line.emissions_kgco2e) == Decimal("2258.67")      # 0.77 x 0.80 x 44/12
    assert Decimal(response.totals.total_all) == 0
    assert Decimal(response.totals.memo["removals"]) == Decimal("2258.67")
