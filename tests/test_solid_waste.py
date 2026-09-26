"""Landfill CH4 by First Order Decay, IPCC 2006 Volume 5 Chapter 3, Tier 1.

The parameters come from the ingested file, read from Tables 3.1 to 3.3 and the
waste data of Chapter 2. The disposal histories here are invented; the expected
results are worked by hand from the equations in the module docstring.
"""
import pytest

from ghg_core.methods import (SolidWasteParameters, WasteStream, solid_waste_ch4,
                              streams_from_composition)
from ghg_core.methods.solid_waste import C_TO_CH4
from ghg_core.quantities import D


def history(years, tonnes):
    return {year: tonnes for year in years}


def test_the_parameters_carry_their_source():
    p = SolidWasteParameters.load()
    assert "IPCC 2006" in p.source_name
    assert p.source_url.endswith(".pdf")
    assert "3.1" in p.read_from and "2.4" in p.read_from


def test_the_published_defaults_are_the_ones_loaded():
    p = SolidWasteParameters.load()
    assert p.doc_f == D("0.5")
    assert p.methane_fraction == D("0.5")
    assert p.mcf("managed_anaerobic") == D("1.0")
    assert p.mcf("unmanaged_shallow") == D("0.4")
    assert p.oxidation_factor() == D(0)
    assert p.oxidation_factor(covered_with_oxidising_material=True) == D("0.1")
    assert p.doc("food") == D("0.15")
    assert p.doc("paper_cardboard") == D("0.40")
    assert p.k("food", "tropical_moist_wet") == D("0.40")


def test_a_site_type_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No Table 3.1"):
        SolidWasteParameters.load().mcf("a hole in the ground")


def test_waste_buried_this_year_emits_nothing_this_year():
    # Decay starts on 1 January of the year after deposition, so a site that
    # opened this year has generated nothing yet.
    result = solid_waste_ch4([WasteStream("food", "managed_anaerobic", {2026: 1000})],
                             inventory_year=2026, climate_zone="tropical_moist_wet")
    assert result.ch4_generated_kg == D(0)
    assert result.ch4_emitted_kg == D(0)


def test_one_years_waste_decays_in_the_next_year():
    # 1,000 t food x DOC 0.15 x DOCf 0.5 x MCF 1.0 = 75 t decomposable carbon.
    # In the following year (1 - e^-0.4) of it decomposes, then x F 0.5 x 16/12.
    k = D("0.4")
    expected_tonnes = D(75) * (D(1) - (-k).exp()) * D("0.5") * C_TO_CH4
    result = solid_waste_ch4([WasteStream("food", "managed_anaerobic", {2025: 1000})],
                             inventory_year=2026, climate_zone="tropical_moist_wet")
    assert result.ch4_generated_kg == pytest.approx(expected_tonnes * D(1000), rel=D("1e-12"))


def test_a_site_keeps_emitting_long_after_it_stops_taking_waste():
    # The whole point of the model: no factor per tonne can express this.
    closed = solid_waste_ch4([WasteStream("food", "managed_anaerobic", history(range(2000, 2011), 1000))],
                             inventory_year=2026, climate_zone="tropical_moist_wet")
    assert closed.ch4_generated_kg > D(0)


def test_a_longer_history_means_more_methane_this_year():
    short = solid_waste_ch4([WasteStream("paper_cardboard", "managed_anaerobic",
                                         history(range(2020, 2026), 1000))],
                            inventory_year=2026, climate_zone="boreal_temperate_wet")
    long = solid_waste_ch4([WasteStream("paper_cardboard", "managed_anaerobic",
                                        history(range(2000, 2026), 1000))],
                           inventory_year=2026, climate_zone="boreal_temperate_wet")
    assert long.ch4_generated_kg > short.ch4_generated_kg


def test_an_unmanaged_shallow_site_generates_less_than_a_managed_one():
    # MCF 0.4 against 1.0: more of the waste decomposes aerobically.
    shallow = solid_waste_ch4([WasteStream("food", "unmanaged_shallow", history(range(2015, 2026), 1000))],
                              inventory_year=2026, climate_zone="tropical_moist_wet")
    managed = solid_waste_ch4([WasteStream("food", "managed_anaerobic", history(range(2015, 2026), 1000))],
                              inventory_year=2026, climate_zone="tropical_moist_wet")
    assert shallow.ch4_generated_kg == pytest.approx(managed.ch4_generated_kg * D("0.4"),
                                                     rel=D("1e-12"))


def test_food_waste_decays_faster_than_wood():
    deposits = history(range(2020, 2026), 1000)
    food = solid_waste_ch4([WasteStream("food", "managed_anaerobic", deposits)],
                           inventory_year=2026, climate_zone="tropical_moist_wet")
    wood = solid_waste_ch4([WasteStream("wood", "managed_anaerobic", deposits)],
                           inventory_year=2026, climate_zone="tropical_moist_wet")
    assert food.remaining_carbon_tonnes < wood.remaining_carbon_tonnes


def test_recovered_gas_is_subtracted_before_oxidation():
    # Section 3.2.3: only what escapes capture can be oxidised in the cover.
    deposits = history(range(2015, 2026), 1000)
    stream = WasteStream("food", "managed_anaerobic", deposits,
                         covered_with_oxidising_material=True)
    result = solid_waste_ch4([stream], inventory_year=2026,
                             climate_zone="tropical_moist_wet",
                             recovered_ch4_kg=1000)
    expected = (result.ch4_generated_kg - D(1000)) * D("0.9")
    assert result.ch4_emitted_kg == pytest.approx(expected, rel=D("1e-12"))


def test_recovering_more_than_the_site_generated_is_refused():
    with pytest.raises(ValueError, match="More methane recovered"):
        solid_waste_ch4([WasteStream("food", "managed_anaerobic", {2020: 10})],
                        inventory_year=2026, climate_zone="tropical_moist_wet",
                        recovered_ch4_kg=1_000_000)


def test_an_uncovered_site_oxidises_nothing():
    deposits = history(range(2015, 2026), 1000)
    result = solid_waste_ch4([WasteStream("food", "managed_anaerobic", deposits)],
                             inventory_year=2026, climate_zone="tropical_moist_wet")
    assert result.ch4_emitted_kg == result.ch4_generated_kg


def test_waste_deposited_after_the_inventory_year_is_refused():
    with pytest.raises(ValueError, match="after the inventory year"):
        solid_waste_ch4([WasteStream("food", "managed_anaerobic", {2030: 1000})],
                        inventory_year=2026, climate_zone="tropical_moist_wet")


def test_negative_tonnage_is_refused():
    with pytest.raises(ValueError, match="cannot be unburied"):
        solid_waste_ch4([WasteStream("food", "managed_anaerobic", {2020: -5})],
                        inventory_year=2026, climate_zone="tropical_moist_wet")


def test_a_component_with_no_published_decay_rate_says_so():
    with pytest.raises(KeyError, match="no row for nappies"):
        solid_waste_ch4([WasteStream("nappies", "managed_anaerobic", {2020: 100})],
                        inventory_year=2026, climate_zone="tropical_moist_wet")


def test_a_half_life_can_be_given_instead_of_a_rate():
    from_half_life = solid_waste_ch4(
        [WasteStream("nappies", "managed_anaerobic", history(range(2015, 2026), 100),
                     doc="0.24", half_life_years=10)],
        inventory_year=2026, climate_zone="tropical_moist_wet")
    from_k = solid_waste_ch4(
        [WasteStream("nappies", "managed_anaerobic", history(range(2015, 2026), 100),
                     doc="0.24", k=D(2).ln() / D(10))],
        inventory_year=2026, climate_zone="tropical_moist_wet")
    assert from_half_life.ch4_generated_kg == from_k.ch4_generated_kg


def test_industrial_waste_takes_its_own_doc_table():
    p = SolidWasteParameters.load()
    assert p.industrial_doc("pulp_and_paper") == D("0.40")
    result = solid_waste_ch4(
        [WasteStream("pulp_and_paper", "managed_anaerobic", history(range(2015, 2026), 1000),
                     k="0.06", industrial=True)],
        inventory_year=2026, climate_zone="boreal_temperate_wet")
    assert result.ch4_generated_kg > D(0)


def test_inert_components_carry_no_degradable_carbon():
    p = SolidWasteParameters.load()
    assert p.doc("plastics") == D(0)
    assert p.doc("glass") == D(0)
    assert p.doc("metal") == D(0)


def test_a_regional_composition_only_splits_what_the_table_publishes():
    # Table 2.3's South-Central Asia row is complete, but several of its
    # components have no decay rate or no carbon, so they are left out rather
    # than scaled up to 100 percent.
    streams = streams_from_composition({2025: 1000}, region="south_central_asia",
                                       site_type="unmanaged_deep")
    components = {stream.component for stream in streams}
    assert components == {"food", "paper_cardboard", "wood", "textiles"}
    assert all(stream.site_type == "unmanaged_deep" for stream in streams)


def test_an_incomplete_composition_row_is_not_filled_in():
    # Southern Africa publishes only food, paper and wood; the rest is blank in
    # the source and stays blank here.
    streams = streams_from_composition({2025: 1000}, region="southern_africa",
                                       site_type="unmanaged_shallow")
    assert {stream.component for stream in streams} == {"food", "paper_cardboard", "wood"}


def test_a_region_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No Table 2.3"):
        streams_from_composition({2025: 1000}, region="atlantis",
                                 site_type="managed_anaerobic")


def test_the_result_is_methane_only_because_the_carbon_dioxide_is_biogenic():
    result = solid_waste_ch4([WasteStream("food", "managed_anaerobic", history(range(2015, 2026), 1000))],
                             inventory_year=2026, climate_zone="tropical_moist_wet")
    assert not hasattr(result, "co2_kg")
    assert result.ch4_generated_kg > D(0)
