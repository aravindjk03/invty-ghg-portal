"""Industrial process emissions, IPCC 2006 Volume 3, Tier 1.

The parameters come from the ingested file, read from Chapter 2 Tables 2.1, 2.4
and 2.6, Chapter 3 Tables 3.1 to 3.9, and Chapter 4 Tables 4.1 to 4.24. The
tonnages here are invented; the expected results are worked by hand.
"""
import pytest

from ghg_core.methods import (CarbonateInput, FactorNotPublished, IndustrialParameters,
                              SteelStep, adipic_acid_n2o, aluminium_emissions,
                              ammonia_co2, carbide_emissions, carbonate_co2,
                              cement_clinker_co2, ferroalloy_co2, glass_co2,
                              iron_and_steel_emissions, lead_co2, lime_co2,
                              magnesium_sf6, nitric_acid_n2o, titanium_dioxide_co2,
                              zinc_co2)
from ghg_core.quantities import D


def test_the_parameters_carry_their_source():
    p = IndustrialParameters.load()
    assert "IPCC 2006" in p.source_name
    assert "Volume 3" in p.source_name
    assert "Chapter 2" in p.read_from and "Chapter 4" in p.read_from


# --- Chapter 2: minerals ---------------------------------------------------

def test_clinker_follows_equation_2_4():
    # 0.51 base, times the 1.02 kiln dust correction, on 1,000 tonnes.
    result = cement_clinker_co2(1000)
    assert result.gas_masses_kg["CO2"] == D(1000) * D("0.51") * D("1.02") * D(1000)


def test_a_plant_that_recycles_all_its_kiln_dust_drops_the_correction():
    with_dust = cement_clinker_co2(1000)
    without = cement_clinker_co2(1000, kiln_dust_recycled=True)
    assert without.gas_masses_kg["CO2"] == with_dust.gas_masses_kg["CO2"] / D("1.02")
    assert any("dust returns to the kiln" in note for note in without.notes)


def test_a_known_clinker_chemistry_uses_its_own_factor():
    lean = cement_clinker_co2(1000, cao_content="60_percent_cao")
    rich = cement_clinker_co2(1000, cao_content="67_percent_cao")
    assert lean.gas_masses_kg["CO2"] < rich.gas_masses_kg["CO2"]


def test_the_activity_is_clinker_not_cement():
    # A plant grinding imported clinker calcined nothing; the note has to say so,
    # because applying this factor to cement tonnage is the usual mistake.
    result = cement_clinker_co2(1000)
    assert any("clinker, not cement" in note for note in result.notes)


def test_lime_takes_the_published_default_mix():
    # Equation 2.8: 85 percent high calcium at 0.75, 15 percent dolomitic at 0.77.
    assert lime_co2(1000).gas_masses_kg["CO2"] == D(1000) * D("0.75") * D(1000)


def test_dolomitic_lime_carries_more_carbon_than_high_calcium():
    high_calcium = lime_co2(100, lime_type="high_calcium")
    dolomitic = lime_co2(100, lime_type="dolomitic_developed")
    assert dolomitic.gas_masses_kg["CO2"] > high_calcium.gas_masses_kg["CO2"]


def test_lime_made_and_lime_spread_are_not_the_same_source():
    assert any("managed soils" in note for note in lime_co2(100).notes)


def test_glass_only_emits_from_the_virgin_part_of_the_batch():
    # Tier 1: 0.20 x (1 - 0.50 cullet) = 0.10 tCO2 per tonne.
    result = glass_co2(1000)
    assert result.gas_masses_kg["CO2"] == D(1000) * D("0.10") * D(1000)
    assert any("Tier 1 assumption" in note for note in result.notes)


def test_a_measured_cullet_ratio_changes_the_glass_answer():
    assert (glass_co2(1000, cullet_ratio="0.8").gas_masses_kg["CO2"]
            < glass_co2(1000, cullet_ratio="0.2").gas_masses_kg["CO2"])


def test_a_batch_that_is_entirely_cullet_is_refused():
    with pytest.raises(ValueError, match="no carbonates to calcine"):
        glass_co2(1000, cullet_ratio=1)


def test_carbonates_follow_their_own_chemistry():
    # Table 2.1: limestone 0.43971, dolomite 0.47732 tCO2 per tonne.
    result = carbonate_co2([CarbonateInput("limestone_caco3", 1000)])
    assert result.gas_masses_kg["CO2"] == D(1000) * D("0.43971") * D(1000)


def test_carbonate_that_never_calcined_released_nothing():
    half = carbonate_co2([CarbonateInput("limestone_caco3", 1000, fraction_calcined="0.5")])
    full = carbonate_co2([CarbonateInput("limestone_caco3", 1000)])
    assert half.gas_masses_kg["CO2"] == full.gas_masses_kg["CO2"] / 2


def test_a_calcined_fraction_above_one_is_refused():
    with pytest.raises(ValueError, match="between 0 and 1"):
        carbonate_co2([CarbonateInput("limestone_caco3", 10, fraction_calcined="1.2")])


# --- Chapter 3: chemicals --------------------------------------------------

def test_ammonia_counts_fuel_and_feedstock_together():
    result = ammonia_co2(1000)
    assert result.gas_masses_kg["CO2"] == D(1000) * D("2.104") * D(1000)
    assert any("stationary combustion" in note for note in result.notes)


def test_carbon_captured_for_urea_leaves_as_urea_not_to_air():
    plain = ammonia_co2(1000)
    recovered = ammonia_co2(1000, co2_recovered_tonnes=500)
    assert recovered.gas_masses_kg["CO2"] == plain.gas_masses_kg["CO2"] - D(500_000)
    assert any("released when the urea is applied" in note for note in recovered.notes)


def test_recovering_more_than_the_plant_made_is_refused():
    with pytest.raises(ValueError, match="More CO2 recovered"):
        ammonia_co2(10, co2_recovered_tonnes=1000)


def test_nitric_acid_depends_on_the_plant_type_not_the_tonnage_alone():
    # A high pressure plant makes four and a half times the N2O of one with NSCR.
    abated = nitric_acid_n2o(1000, plant_type="nscr_all_processes")
    high_pressure = nitric_acid_n2o(1000, plant_type="high_pressure")
    assert abated.gas_masses_kg["N2O"] == D(2000)
    assert high_pressure.gas_masses_kg["N2O"] == D(9000)


def test_the_nitric_acid_tonnage_has_to_be_pure_acid():
    assert any("100 percent HNO3" in note for note in
               nitric_acid_n2o(10, plant_type="high_pressure").notes)


def test_adipic_acid_abatement_needs_both_destruction_and_uptime():
    # 300 kg per tonne generated; thermal destruction removes 0.985 x 0.97 of it.
    uncontrolled = adipic_acid_n2o(100)
    abated = adipic_acid_n2o(100, abatement="thermal_destruction")
    assert uncontrolled.gas_masses_kg["N2O"] == D(30_000)
    assert abated.gas_masses_kg["N2O"] == D(30_000) * (D(1) - D("0.985") * D("0.97"))
    assert any("never stopped" in note for note in abated.notes)


def test_an_abatement_technology_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No published destruction factor"):
        adipic_acid_n2o(100, abatement="wishful thinking")


def test_silicon_carbide_emits_methane_as_well_as_carbon_dioxide():
    result = carbide_emissions(100, carbide="silicon_carbide")
    assert result.gas_masses_kg["CO2"] == D(100) * D("2.62") * D(1000)
    assert result.gas_masses_kg["CH4"] == D(100) * D("11.6")


def test_calcium_carbide_can_be_counted_on_the_coke_that_went_in():
    on_product = carbide_emissions(100, carbide="calcium_carbide", basis="product")
    on_coke = carbide_emissions(100, carbide="calcium_carbide", basis="petroleum_coke")
    assert on_coke.gas_masses_kg["CO2"] > on_product.gas_masses_kg["CO2"]


def test_titanium_slag_raises_rather_than_returning_zero():
    # IPCC publishes no default: two plants make it and their data is confidential.
    with pytest.raises(FactorNotPublished, match="confidential"):
        titanium_dioxide_co2(100, product="titanium_slag")


# --- Chapter 4: metals -----------------------------------------------------

def test_the_steelmaking_route_changes_the_answer_by_a_factor_of_eighteen():
    # Scrap through an arc furnace against iron through a basic oxygen furnace.
    eaf = iron_and_steel_emissions([SteelStep("steel_electric_arc_furnace", 1000)])
    bof = iron_and_steel_emissions([SteelStep("steel_basic_oxygen_furnace", 1000)])
    assert eaf.gas_masses_kg["CO2"] == D(1000) * D("0.08") * D(1000)
    assert bof.gas_masses_kg["CO2"] == D(1000) * D("1.46") * D(1000)


def test_coke_and_sinter_carry_methane_too():
    result = iron_and_steel_emissions([SteelStep("sinter", 1000)])
    assert result.gas_masses_kg["CH4"] == D(1000) * D("0.07")


def test_reporting_pig_iron_beside_bof_steel_is_flagged_as_double_counting():
    # The BOF factor already includes the blast furnace; reporting both counts
    # the same carbon twice, and a works will do it unless told.
    result = iron_and_steel_emissions([
        SteelStep("pig_iron_blast_furnace", 1000),
        SteelStep("steel_basic_oxygen_furnace", 1000),
    ])
    assert any("same carbon twice" in note for note in result.notes)


def test_a_steel_step_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No Tier 1 factor for the step"):
        iron_and_steel_emissions([SteelStep("alchemy", 10)])


def test_ferroalloys_differ_by_alloy_not_by_tonnage():
    assert (ferroalloy_co2(100, alloy="silicon_metal").gas_masses_kg["CO2"]
            > ferroalloy_co2(100, alloy="ferromanganese_7_percent_c").gas_masses_kg["CO2"])


def test_aluminium_reports_the_anode_carbon_and_both_perfluorocarbons():
    result = aluminium_emissions(1000, cell_technology="swpb")
    assert result.gas_masses_kg["CO2"] == D(1000) * D("1.6") * D(1000)   # prebake anode
    assert result.gas_masses_kg["CF4"] == D(1000) * D("1.6")
    assert result.gas_masses_kg["C2F6"] == D(1000) * D("0.4")


def test_a_soderberg_cell_takes_the_soderberg_anode_factor():
    prebake = aluminium_emissions(1000, cell_technology="cwpb")
    soderberg = aluminium_emissions(1000, cell_technology="vss")
    assert soderberg.gas_masses_kg["CO2"] > prebake.gas_masses_kg["CO2"]


def test_the_aluminium_uncertainty_is_stated_because_it_is_enormous():
    result = aluminium_emissions(100, cell_technology="cwpb")
    assert any("-99 to +380" in note for note in result.notes)


def test_a_cell_technology_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No published PFC factors"):
        aluminium_emissions(100, cell_technology="something new")


def test_magnesium_prefers_the_gas_actually_bought():
    from_production = magnesium_sf6(100)
    from_purchase = magnesium_sf6(100, sf6_consumed_kg=40)
    assert from_production.gas_masses_kg["SF6"] == D(100)   # 1.0 kg per tonne
    assert from_purchase.gas_masses_kg["SF6"] == D(40)
    assert any("assumed emitted within the year" in note for note in from_purchase.notes)


def test_lead_and_zinc_take_their_furnace_route():
    assert lead_co2(100).gas_masses_kg["CO2"] == D(100) * D("0.52") * D(1000)
    assert (zinc_co2(100, process="waelz_kiln").gas_masses_kg["CO2"]
            > zinc_co2(100, process="pyrometallurgical_imperial_smelting").gas_masses_kg["CO2"])


def test_the_zinc_route_ipcc_records_as_unknown_raises():
    with pytest.raises(FactorNotPublished, match="unknown"):
        zinc_co2(100, process="electro_thermic")


def test_every_result_is_a_gas_mass_not_carbon_dioxide_equivalent():
    # The GWP set is applied by the report, so one calculation serves AR5 and AR6.
    result = aluminium_emissions(1, cell_technology="cwpb")
    assert set(result.gas_masses_kg) == {"CO2", "CF4", "C2F6"}
    assert all(isinstance(value, type(D(1))) for value in result.gas_masses_kg.values())
