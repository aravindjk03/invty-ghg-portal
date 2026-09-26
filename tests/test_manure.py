"""Manure management CH4 and N2O, IPCC 2006 Volume 4 Chapter 10, Tier 1.

The parameters come from the ingested file, read from Tables 10.14 to 10.16,
10.19, 10.21, 10.22 and 10.23. The herds here are invented; the expected
results are worked by hand from the equations in the module docstrings.
"""
import pytest

from ghg_core.methods import (LivestockGroup, ManureParameters, ManureStream,
                              NotManureManagement, annual_n_excretion, climate_band,
                              manure_ch4, manure_n2o)
from ghg_core.methods.manure import N_TO_N2O
from ghg_core.quantities import D


def test_the_parameters_carry_their_source():
    p = ManureParameters.load()
    assert "IPCC 2006" in p.source_name
    assert p.source_url.endswith(".pdf")
    assert "10.14" in p.read_from and "10.22" in p.read_from


# --- methane ---------------------------------------------------------------

def test_the_temperature_columns_are_read_off_the_published_row():
    p = ManureParameters.load()
    # North American dairy cows: 48 at or below 10 C, 78 at 20, 112 at 28 or above.
    factor = lambda t: p.ch4_factor("dairy_cows", region="north_america", temperature_c=t)[0]
    assert factor(10) == D(48)
    assert factor(20) == D(78)
    assert factor(28) == D(112)


def test_the_ends_of_the_table_are_open_not_missing():
    p = ManureParameters.load()
    factor = lambda t: p.ch4_factor("dairy_cows", region="north_america", temperature_c=t)[0]
    assert factor(-5) == factor(10)      # the "<= 10" column
    assert factor(40) == factor(28)      # the ">= 28" column


def test_a_fractional_temperature_takes_its_whole_degree():
    p = ManureParameters.load()
    factor = lambda t: p.ch4_factor("dairy_cows", region="north_america", temperature_c=t)[0]
    assert factor("20.7") == factor(20)


def test_the_region_changes_the_answer_by_an_order_of_magnitude():
    indian = manure_ch4([LivestockGroup("dairy_cows", 100)],
                        region="indian_subcontinent", temperature_c=27)
    north_american = manure_ch4([LivestockGroup("dairy_cows", 100)],
                                region="north_america", temperature_c=27)
    # Liquid systems in North America against dry ones on the subcontinent.
    assert north_american.ch4_kg > indian.ch4_kg * D(15)


def test_sheep_fall_through_to_the_other_livestock_table():
    result = manure_ch4([LivestockGroup("sheep", 1000)],
                        region="indian_subcontinent", temperature_c=27)
    # Table 10.15, developing economy, warm: 0.20 kg per head.
    assert result.ch4_kg == D(200)
    assert result.tables_used["sheep"] == "Table 10.15"


def test_the_climate_bands_are_the_published_ones():
    assert climate_band(14) == "cool"
    assert climate_band(15) == "temperate"
    assert climate_band(25) == "temperate"
    assert climate_band("25.1") == "warm"


def test_deer_take_a_single_factor_with_no_temperature_at_all():
    result = manure_ch4([LivestockGroup("deer", 100)],
                        region="western_europe", temperature_c=5)
    assert result.ch4_kg == D(22)
    assert result.tables_used["deer"] == "Table 10.16"


def test_a_species_in_no_table_raises_rather_than_returning_zero():
    with pytest.raises(KeyError, match="Published species"):
        manure_ch4([LivestockGroup("alpacas", 10)],
                   region="latin_america", temperature_c=15)


def test_a_region_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No Table 10.14 region"):
        manure_ch4([LivestockGroup("dairy_cows", 10)], region="mars", temperature_c=15)


def test_an_empty_herd_emits_nothing():
    assert manure_ch4([], region="asia", temperature_c=20).ch4_kg == D(0)


# --- nitrogen and nitrous oxide -------------------------------------------

def test_nitrogen_excretion_follows_equation_10_30():
    # 0.34 kg N per 1000 kg per day, 400 kg animal, 365 days.
    assert annual_n_excretion("0.34", 400) == D("0.34") * D("0.4") * D(365)


def test_a_herd_without_a_mass_cannot_be_estimated():
    with pytest.raises(ValueError, match="positive"):
        annual_n_excretion("0.34", 0)


def test_the_excretion_rate_is_the_published_one():
    p = ManureParameters.load()
    assert p.excretion_rate("dairy_cattle", "asia") == D("0.47")
    assert p.excretion_rate("other_cattle", "middle_east") == D("0.79")


def test_the_missing_indian_subcontinent_column_is_named_not_invented():
    # Table 10.19 has no such column even though Table 10.14 does.
    with pytest.raises(KeyError, match="no Indian Subcontinent column"):
        ManureParameters.load().excretion_rate("dairy_cattle", "indian_subcontinent")


def test_direct_emissions_follow_equation_10_25():
    # 100 head x (0.47 x 0.4 x 365) kg N each, all of it on a dry lot (EF3 0.02).
    nex = annual_n_excretion("0.47", 400)
    result = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                      typical_animal_mass_kg=400)], region="asia")
    assert result.components["direct_n2o_n"] == D(100) * nex * D("0.02")
    assert result.direct_kg_n2o == result.components["direct_n2o_n"] * N_TO_N2O


def test_a_system_with_a_published_factor_of_zero_emits_nothing_directly():
    # An uncovered anaerobic lagoon: IPCC judges direct N2O negligible there,
    # which is a published zero, not a missing value.
    result = manure_n2o([ManureStream("swine", 1000, "uncovered_anaerobic_lagoon",
                                      typical_animal_mass_kg=50)], region="asia")
    assert result.direct_kg_n2o == D(0)
    assert result.volatilisation_kg_n2o > D(0)


def test_volatilisation_follows_equations_10_26_and_10_27():
    nex = annual_n_excretion("0.47", 400)
    managed = D(100) * nex
    result = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                      typical_animal_mass_kg=400)], region="asia")
    # Table 10.22: a dairy cow on a dry lot loses 20 percent; EF4 is 0.01.
    assert result.components["volatilised_n"] == managed * D("0.20")
    assert result.volatilisation_kg_n2o == managed * D("0.20") * D("0.01") * N_TO_N2O


def test_leaching_is_zero_unless_the_country_has_a_fraction_of_its_own():
    # IPCC publishes no default FracleachMS, so the method does not invent one.
    without = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                       typical_animal_mass_kg=400)], region="asia")
    with_fraction = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                             typical_animal_mass_kg=400,
                                             leaching_percent=5)], region="asia")
    assert without.leaching_kg_n2o == D(0)
    assert with_fraction.leaching_kg_n2o > D(0)


def test_pasture_is_refused_and_pointed_at_managed_soils():
    # Counting grazing here as well as under managed soils would double it.
    with pytest.raises(NotManureManagement, match="managed soils"):
        manure_n2o([ManureStream("dairy_cattle", 100, "pasture_range_paddock",
                                 typical_animal_mass_kg=400)], region="asia")


def test_dung_burned_as_fuel_is_refused_and_pointed_at_fuel_combustion():
    with pytest.raises(NotManureManagement, match="Fuel Combustion"):
        manure_n2o([ManureStream("dairy_cattle", 100, "burned_for_fuel",
                                 typical_animal_mass_kg=400)], region="asia")


def test_shares_that_add_to_more_than_one_are_refused():
    with pytest.raises(ValueError, match="more than all of its manure"):
        manure_n2o([
            ManureStream("dairy_cattle", 100, "dry_lot", typical_animal_mass_kg=400, share="0.7"),
            ManureStream("dairy_cattle", 100, "solid_storage", typical_animal_mass_kg=400, share="0.5"),
        ], region="asia")


def test_shares_may_add_to_less_than_one_because_the_rest_is_on_pasture():
    result = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                      typical_animal_mass_kg=400, share="0.4")],
                        region="asia")
    assert result.direct_kg_n2o > D(0)


def test_a_stream_with_neither_a_mass_nor_a_measured_rate_is_refused():
    with pytest.raises(ValueError, match="Neither can be guessed"):
        manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot")], region="asia")


def test_a_measured_excretion_rate_overrides_the_default_table():
    result = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                      nitrogen_excreted_kg_per_head=50)], region="asia")
    assert result.components["direct_n2o_n"] == D(100) * D(50) * D("0.02")


def test_the_nitrogen_left_for_soils_uses_the_total_loss_not_the_ammonia_alone():
    # Table 10.23 puts a dairy cow's dry lot loss at 30 percent, against the
    # 20 percent of Table 10.22 that is ammonia and NOx.
    nex = annual_n_excretion("0.47", 400)
    result = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                      typical_animal_mass_kg=400)], region="asia")
    assert result.nitrogen_available_for_soils_kg == D(100) * nex * D("0.70")


def test_the_total_is_the_three_parts_together():
    result = manure_n2o([ManureStream("dairy_cattle", 100, "dry_lot",
                                      typical_animal_mass_kg=400, leaching_percent=5)],
                        region="asia")
    assert result.total_kg_n2o == (result.direct_kg_n2o + result.volatilisation_kg_n2o
                                  + result.leaching_kg_n2o)
