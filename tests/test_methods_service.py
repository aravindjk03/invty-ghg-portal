"""The methods endpoint: the IPCC equations, under the customer's GWP basis.

These are the sources that cannot be a factor per unit of activity. The test
calls the API layer directly, as the inventory tests do, so it checks the
contract without needing a running server.
"""
import pytest

pytest.importorskip("fastapi")

from ghg_core.quantities import D  # noqa: E402
from service.methods_api import (EntericRequest, LimeAndUreaRequest,  # noqa: E402
                                 ManagedSoilsRequest, ManureRequest, SolidWasteRequest,
                                 WastewaterRequest, calculate_method, list_methods)


def test_every_method_says_what_it_is_and_where_it_came_from():
    methods = list_methods()
    assert {m["key"] for m in methods} == {
        "managed_soils", "lime_and_urea", "enteric_fermentation",
        "manure_management", "wastewater", "solid_waste"}
    for method in methods:
        assert "IPCC 2006" in method["source"]
        assert method["why_not_a_factor"]
        assert method["needs"]


def test_every_form_gets_its_choices_from_the_published_tables():
    # A screen must never type out a species, region, treatment system or site
    # type of its own: if it offers something IPCC does not publish, the method
    # would refuse it, and if a table gains a row the form has to gain it too.
    options = {method["key"]: method["options"] for method in list_methods()}

    regions = [choice["value"] for choice in options["enteric_fermentation"]["cattle_region"]]
    assert "indian_subcontinent" in regions and "north_america" in regions

    manure = options["manure_management"]
    assert "dairy_cows" in [choice["value"] for choice in manure["species"]]
    assert "dry_lot" in [choice["value"] for choice in manure["system"]]
    # Table 10.19 has no Indian Subcontinent column, and the form must not imply one.
    assert "indian_subcontinent" not in [c["value"] for c in manure["excretion_region"]]

    waste = options["solid_waste"]
    assert "managed_anaerobic" in [choice["value"] for choice in waste["site_type"]]
    assert "tropical_moist_wet" in [choice["value"] for choice in waste["climate_zone"]]
    assert "nappies" in waste["no_decay_rate"]

    assert "anaerobic_reactor" in [c["value"] for c in options["wastewater"]["system"]]
    assert [c["label"] for c in options["wastewater"]["load_basis"]] == ["BOD", "COD"]


def test_the_options_only_offer_what_the_method_will_accept():
    # Every published choice has to round-trip through the calculator.
    options = {method["key"]: method["options"] for method in list_methods()}
    for region in [choice["value"] for choice in options["enteric_fermentation"]["cattle_region"]]:
        result = calculate_method(EntericRequest(
            method="enteric_fermentation", dairy_cattle=1, cattle_region=region))
        assert D(result.gas_masses_kg["CH4"]) > D(0)


def test_the_answer_carries_the_gas_masses_as_well_as_the_carbon_dioxide_equivalent():
    result = calculate_method(EntericRequest(
        method="enteric_fermentation", dairy_cattle=100, other_cattle=50))
    # 100 x 58 + 50 x 27, the Indian subcontinent rows of Table 10.11.
    assert result.gas_masses_kg == {"CH4": "7150"}
    assert D(result.co2e_kg) == D(7150) * D(28)


def test_the_same_calculation_states_itself_under_either_basis():
    ar5 = calculate_method(EntericRequest(method="enteric_fermentation", dairy_cattle=100))
    ar6 = calculate_method(EntericRequest(method="enteric_fermentation", dairy_cattle=100,
                                          gwp_set="AR6"))
    assert ar5.gas_masses_kg == ar6.gas_masses_kg      # the method ran once
    assert D(ar6.co2e_kg) < D(ar5.co2e_kg)             # 27.0 against 28


def test_biological_methane_takes_the_non_fossil_global_warming_potential():
    # A cow's methane is not fossil methane. AR5 gives it 28, not 30; using the
    # fossil figure would overstate a herd by about seven percent.
    result = calculate_method(EntericRequest(method="enteric_fermentation", dairy_cattle=100))
    assert D(result.co2e_kg) == D(5800) * D(28)
    assert "non-fossil" in result.notes[-1]


def test_the_gwp_source_is_named_on_every_answer():
    result = calculate_method(EntericRequest(method="enteric_fermentation", dairy_cattle=1))
    assert "IPCC" in result.gwp_source and "http" in result.gwp_source


def test_managed_soils_shows_its_three_parts():
    result = calculate_method(ManagedSoilsRequest(
        method="managed_soils", synthetic_fertiliser_n=10000, leaching_occurs=False))
    assert set(result.gas_masses_kg) == {"N2O"}
    assert D(result.working["direct_kg_n2o"]) > D(0)
    assert D(result.working["leaching_kg_n2o"]) == D(0)
    assert any("zero, not 0.3" in note for note in result.notes)


def test_urea_is_reported_as_carbon_dioxide_and_flagged_as_nitrogen_too():
    result = calculate_method(LimeAndUreaRequest(method="lime_and_urea", urea=100))
    assert set(result.gas_masses_kg) == {"CO2"}
    assert any("managed soils" in note for note in result.notes)


def test_tonnes_in_means_kilograms_out():
    in_tonnes = calculate_method(LimeAndUreaRequest(method="lime_and_urea", limestone=1))
    in_kg = calculate_method(LimeAndUreaRequest(method="lime_and_urea", limestone=1000,
                                                mass_unit="kg"))
    assert D(in_tonnes.co2e_kg) == D(in_kg.co2e_kg)


def test_manure_reports_both_gases_and_the_nitrogen_left_for_the_land():
    result = calculate_method(ManureRequest(
        method="manure_management",
        region="indian_subcontinent",
        excretion_region="asia",
        temperature_c=27,
        groups=[{"species": "dairy_cows", "head": 100}],
        streams=[{"category": "dairy_cattle", "head": 100, "system": "dry_lot",
                  "typical_animal_mass_kg": 300}],
    ))
    assert set(result.gas_masses_kg) == {"CH4", "N2O"}
    assert D(result.working["nitrogen_available_for_soils_kg"]) > D(0)
    assert any("Table 10.19 has no indian_subcontinent column" in note for note in result.notes)
    assert any("left for application to land" in note for note in result.notes)


def test_manure_without_storage_details_reports_methane_only():
    result = calculate_method(ManureRequest(
        method="manure_management", region="asia", temperature_c=25,
        groups=[{"species": "dairy_cows", "head": 10}]))
    assert set(result.gas_masses_kg) == {"CH4"}


def test_a_pasture_herd_is_refused_rather_than_double_counted():
    with pytest.raises(KeyError, match="managed soils"):
        calculate_method(ManureRequest(
            method="manure_management", region="asia", temperature_c=25,
            streams=[{"category": "dairy_cattle", "head": 10,
                      "system": "pasture_range_paddock", "typical_animal_mass_kg": 300}]))


def test_wastewater_builds_its_load_from_the_population_when_asked():
    result = calculate_method(WastewaterRequest(
        method="wastewater", population=100000, bod_per_person_g_day=40,
        pathways=[{"system": "anaerobic_reactor", "share_of_load": 1}],
        protein_kg_per_person_year=20))
    assert set(result.gas_masses_kg) == {"CH4", "N2O"}
    assert D(result.working["organic_load_kg_bod"]) > D(0)


def test_wastewater_with_a_load_but_no_treatment_route_says_why_it_cannot_answer():
    result = calculate_method(WastewaterRequest(method="wastewater", organic_load=1000000))
    assert result.gas_masses_kg == {}
    assert any("does not say how anaerobic" in note for note in result.notes)


def test_wastewater_with_nothing_at_all_says_what_it_needs():
    result = calculate_method(WastewaterRequest(method="wastewater"))
    assert result.gas_masses_kg == {}
    assert any("Nothing could be calculated" in note for note in result.notes)


def test_a_landfill_needs_its_history_not_just_this_year():
    only_this_year = calculate_method(SolidWasteRequest(
        method="solid_waste", inventory_year=2026, climate_zone="tropical_moist_wet",
        streams=[{"component": "food", "site_type": "unmanaged_deep",
                  "tonnes_by_year": {2026: 1000}}]))
    assert D(only_this_year.co2e_kg) == D(0)
    assert any("disposal history" in note for note in only_this_year.notes)

    with_history = calculate_method(SolidWasteRequest(
        method="solid_waste", inventory_year=2026, climate_zone="tropical_moist_wet",
        streams=[{"component": "food", "site_type": "unmanaged_deep",
                  "tonnes_by_year": {year: 1000 for year in range(2015, 2027)}}]))
    assert D(with_history.co2e_kg) > D(0)
    assert D(with_history.working["remaining_carbon_tonnes"]) > D(0)


def test_a_parameter_that_ipcc_never_published_is_refused_not_defaulted_to_zero():
    with pytest.raises(KeyError):
        calculate_method(SolidWasteRequest(
            method="solid_waste", inventory_year=2026, climate_zone="tropical_moist_wet",
            streams=[{"component": "nappies", "site_type": "unmanaged_deep",
                      "tonnes_by_year": {2020: 100}}]))
