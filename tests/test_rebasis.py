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
    assert under_ar5 == D("1300")
    assert under_ar6 == D("1526")
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
