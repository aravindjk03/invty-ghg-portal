"""Enteric fermentation CH4, IPCC 2006 Volume 4 Chapter 10, Tier 1.

The factors come from the ingested file, read from Tables 10.10 and 10.11. The
head counts here are invented; the expected results are worked by hand.
"""
import pytest

from ghg_core.methods import Herd, enteric_ch4
from ghg_core.methods.enteric import EntericParameters, FactorNotPublished
from ghg_core.quantities import D


def test_the_parameters_carry_their_source():
    p = EntericParameters.load()
    assert "IPCC 2006" in p.source_name
    assert p.source_url.endswith(".pdf")
    assert "10.11" in p.read_from


def test_indian_cattle_carry_the_regions_own_factors():
    p = EntericParameters.load()
    assert p.cattle_factor("indian_subcontinent", "dairy") == D(58)
    assert p.cattle_factor("indian_subcontinent", "other") == D(27)


def test_a_region_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="Regions in Table 10.11"):
        EntericParameters.load().cattle_factor("antarctica", "dairy")


def test_a_cattle_category_outside_the_two_published_is_refused():
    with pytest.raises(KeyError, match="dairy"):
        EntericParameters.load().cattle_factor("indian_subcontinent", "beef")


def test_poultry_raises_rather_than_returning_zero():
    # IPCC publishes no Tier 1 enteric factor for poultry. Returning zero would
    # silently drop a poultry unit out of an inventory.
    with pytest.raises(FactorNotPublished, match="rather than treating it as zero"):
        EntericParameters.load().livestock_factor("poultry")


def test_a_herd_is_the_sum_of_its_categories():
    # 100 dairy x 58 + 50 other x 27 = 5,800 + 1,350.
    result = enteric_ch4(Herd(dairy_cattle=100, other_cattle=50))
    assert result.ch4_kg == D(7150)
    assert result.by_animal["dairy_cattle"] == D(5800)
    assert result.by_animal["other_cattle"] == D(1350)


def test_the_factors_applied_are_reported_for_the_assurance_trail():
    result = enteric_ch4(Herd(dairy_cattle=1))
    assert result.factors_applied["dairy_cattle"] == D(58)


def test_the_region_changes_the_answer():
    indian = enteric_ch4(Herd(dairy_cattle=100))
    north_american = enteric_ch4(Herd(dairy_cattle=100), cattle_region="north_america")
    # A North American dairy cow eats far more and emits about twice as much.
    assert north_american.ch4_kg > indian.ch4_kg * D(2)


def test_other_species_take_the_economy_they_are_farmed_in():
    developing = enteric_ch4(Herd(other_animals={"sheep": 100}))
    developed = enteric_ch4(Herd(other_animals={"sheep": 100}), economy="developed")
    assert developing.ch4_kg == D(500)      # 5 kg per head
    assert developed.ch4_kg == D(800)       # 8 kg per head


def test_buffalo_are_not_treated_as_cattle():
    # A buffalo emits 55 kg, not the 58 of an Indian dairy cow or the 27 of
    # other cattle: it is its own row in Table 10.10.
    assert enteric_ch4(Herd(other_animals={"buffalo": 1})).ch4_kg == D(55)


def test_empty_categories_are_left_out_rather_than_carried_as_zero():
    result = enteric_ch4(Herd(dairy_cattle=10, other_cattle=0))
    assert "other_cattle" not in result.by_animal


def test_the_result_is_methane_not_carbon_dioxide_equivalent():
    # The GWP set is applied by the report, so the same herd can be stated
    # under AR5 or AR6 without recalculating the method.
    result = enteric_ch4(Herd(dairy_cattle=1))
    assert result.ch4_kg == D(58)
