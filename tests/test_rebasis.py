"""Expressing published factors under AR5 or AR6.

The values here come from the ingested GWP sets, which were read from the IPCC
tables. The gas masses are taken from the DESNZ 2025 flat file where noted, and
are otherwise invented fixtures.
"""
from decimal import Decimal

import pytest

from ghg_core.errors import GwpNotFoundError
from ghg_core.gwp import load_gwp_set
from ghg_core.quantities import D
from ghg_core.rebasis import difference_percent, rebase

AR5 = load_gwp_set("data/gwp/ar5.json")
AR6 = load_gwp_set("data/gwp/ar6.json")


def test_both_sets_carry_the_gases_a_fuel_inventory_needs():
    for gwp_set in (AR5, AR6):
        for gas in ("CH4_fossil", "CH4_nonfossil", "N2O", "SF6"):
            assert gwp_set.gwp(gas) > 0


def test_co2_is_one_in_every_set():
    assert AR5.gwp("CO2") == 1
    assert AR6.gwp("CO2") == 1


def test_the_published_ar5_and_ar6_values_differ():
    assert AR5.gwp("CH4_fossil") == D("30")
    assert AR6.gwp("CH4_fossil") == D("29.8")
    assert AR5.gwp("N2O") == D("265")
    assert AR6.gwp("N2O") == D("273")


def test_rebasing_a_fuel_factor_gives_a_different_total_under_each_set():
    # Diesel, per litre, from DESNZ 2025: CO2 2.55808, CH4 0.00381 as CO2e under
    # AR5, N2O 0.00893 as CO2e under AR5. Masses recovered by the ingester.
    masses = {"CO2": "2.55808", "CH4": D("0.00381") / 28, "N2O": D("0.00893") / 265}

    under_ar5 = rebase(masses, AR5)
    under_ar6 = rebase(masses, AR6)

    assert under_ar5.gwp_set_name == "AR5"
    assert under_ar6.gwp_set_name == "AR6"
    assert under_ar5.value_kgco2e_per_unit != under_ar6.value_kgco2e_per_unit
    # CO2 dominates a diesel factor, so the two bases land within a fraction of
    # a percent of each other.
    assert abs(difference_percent(under_ar5.value_kgco2e_per_unit,
                                  under_ar6.value_kgco2e_per_unit)) < 1


def test_a_refrigerant_shows_the_choice_actually_matters():
    # One kilogram of HFC-134a leaked.
    under_ar5 = rebase({"HFC-134a": "1"}, AR5).value_kgco2e_per_unit
    under_ar6 = rebase({"HFC-134a": "1"}, AR6).value_kgco2e_per_unit
    # AR5 Table 8.A.1 and AR6 Table 7.SM.7, the tables the halocarbons are read from.
    assert under_ar5 == D("1300")
    assert under_ar6 == D("1530")
    assert difference_percent(under_ar5, under_ar6) > 17


def test_methane_carbon_origin_changes_the_answer():
    fossil = rebase({"CH4": "1"}, AR6, biogenic=False).value_kgco2e_per_unit
    biogenic = rebase({"CH4": "1"}, AR6, biogenic=True).value_kgco2e_per_unit
    assert fossil == D("29.8")
    assert biogenic == D("27.0")


def test_a_gas_the_set_does_not_carry_is_refused_not_guessed():
    with pytest.raises(GwpNotFoundError) as error:
        rebase({"R-410A": "1"}, AR6)
    assert "R-410A" in str(error.value)
    assert "Ingest" in str(error.value)


def test_contributions_are_reported_per_gas():
    result = rebase({"CO2": "2", "N2O": "0.001"}, AR5)
    assert result.contributions["CO2"] == D("2")
    assert result.contributions["N2O"] == D("0.265")
    assert result.value_kgco2e_per_unit == D("2.265")


def test_an_empty_or_zero_mass_contributes_nothing():
    result = rebase({"CO2": "1", "CH4": "", "N2O": Decimal(0)}, AR6)
    assert result.value_kgco2e_per_unit == D("1")
    assert "CH4" not in result.contributions


# --- refrigerant blends -----------------------------------------------------

import json  # noqa: E402

from ghg_core.rebasis import blend_gwp  # noqa: E402

BLENDS = json.loads((__import__("pathlib").Path("data/gwp/refrigerant_blends.json"))
                    .read_text(encoding="utf-8"))["blends"]


def test_every_blend_component_exists_in_both_sets():
    for blend, composition in BLENDS.items():
        for gwp_set in (AR5, AR6):
            for component in composition:
                if component == "HFC-600a":      # isobutane, GWP ~3, not tabulated here
                    continue
                assert gwp_set.gwp(component) > 0, f"{component} missing from {gwp_set.name}"


def test_r410a_matches_the_published_blend_value():
    # R-410A is half HFC-32 and half HFC-125. Under AR6 that is 2,255.5, and the
    # figure quoted for R-410A under AR6 is 2,256.
    under_ar6 = blend_gwp("R-410A", BLENDS["R-410A"], AR6).value
    assert abs(under_ar6 - D("2256")) < D("2")
    under_ar5 = blend_gwp("R-410A", BLENDS["R-410A"], AR5).value
    assert abs(under_ar5 - D("1924")) < D("2")


def test_a_blend_is_recomputed_under_each_set():
    ar5 = blend_gwp("R-404A", BLENDS["R-404A"], AR5).value
    ar6 = blend_gwp("R-404A", BLENDS["R-404A"], AR6).value
    assert ar6 > ar5
    assert difference_percent(ar5, ar6) > 15


def test_an_incomplete_composition_is_refused():
    with pytest.raises(ValueError, match="sums to"):
        blend_gwp("broken", {"HFC-32": 0.5}, AR6)


def test_the_components_are_reported_so_the_sum_can_be_checked():
    result = blend_gwp("R-407C", BLENDS["R-407C"], AR6)
    assert set(result.components) == {"HFC-32", "HFC-125", "HFC-134a"}
    assert sum(result.components.values()) == result.value
