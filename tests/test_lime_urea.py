"""CO2 from liming and from urea application, IPCC 2006 Volume 4 Chapter 11.

The factors come from the ingested file, read from Equations 11.12 and 11.13.
The activity data here is invented; the expected results are worked by hand.
"""
import pytest

from ghg_core.methods import liming_co2, urea_co2, urea_nitrogen
from ghg_core.methods.lime_urea import C_TO_CO2, CarbonateParameters
from ghg_core.quantities import D


def test_the_parameters_carry_their_source():
    p = CarbonateParameters.load()
    assert "IPCC 2006" in p.source_name
    assert p.source_url.endswith(".pdf")
    assert "11.12" in p.read_from and "11.13" in p.read_from


def test_the_published_carbon_contents_are_the_ones_loaded():
    p = CarbonateParameters.load()
    assert p.get("limestone") == D("0.12")
    assert p.get("dolomite") == D("0.13")
    assert p.get("urea") == D("0.20")


def test_a_material_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="do not estimate"):
        CarbonateParameters.load().get("seashells")


def test_liming_follows_equation_11_12():
    # 100 t limestone x 0.12 = 12 t C; 50 t dolomite x 0.13 = 6.5 t C.
    result = liming_co2(limestone=100, dolomite=50)
    assert result.components["total_co2_c"] == D("18.5")
    assert result.co2 == D("18.5") * C_TO_CO2


def test_dolomite_carries_more_carbon_than_limestone():
    assert liming_co2(dolomite=100).co2 > liming_co2(limestone=100).co2


def test_the_carbon_is_converted_to_carbon_dioxide():
    # 44/12 is roughly 3.67: forgetting it understates the source three-fold.
    assert liming_co2(limestone=D(12)).co2 == D("1.44") * C_TO_CO2
    assert C_TO_CO2 > D("3.6")


def test_urea_follows_equation_11_13():
    # 1,000 t urea x 0.20 = 200 t C, then x 44/12.
    result = urea_co2(1000)
    assert result.components["total_co2_c"] == D(200)
    assert result.co2 == D(200) * C_TO_CO2


def test_a_solution_of_known_strength_only_counts_its_urea():
    assert urea_co2(1000, urea_fraction_of_solution="0.4").co2 == urea_co2(400).co2


def test_an_unknown_solution_strength_is_treated_as_all_urea():
    # Section 11.4.1 prefers over-stating here to under-estimating the source.
    assert urea_co2(1000).co2 == urea_co2(1000, urea_fraction_of_solution=1).co2


def test_an_impossible_solution_strength_is_refused():
    with pytest.raises(ValueError, match="between 0 and 1"):
        urea_co2(1000, urea_fraction_of_solution="1.4")


def test_the_mass_unit_is_carried_through_untouched():
    # The factors are ratios, so kilograms in means kilograms out.
    result = urea_co2(1000, mass_unit="kg")
    assert result.mass_unit == "kg"
    assert result.co2 == urea_co2(1000).co2


def test_urea_is_also_a_nitrogen_input():
    # 46 percent N, which is what the bag says, so the same urea produces N2O
    # through managed soils as well as CO2 here.
    nitrogen = urea_nitrogen(1000)
    assert nitrogen == pytest.approx(D(466), abs=D(1))
