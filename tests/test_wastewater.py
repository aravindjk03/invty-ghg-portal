"""Wastewater CH4 and N2O, IPCC 2006 Volume 5 Chapter 6, Tier 1.

The parameters come from the ingested file, read from Tables 6.2 and 6.3 and
Section 6.3.1.2. The loads here are invented; the expected results are worked by
hand from the equations in the module docstring.
"""
import pytest

from ghg_core.methods import (TreatmentPathway, WastewaterParameters,
                              nitrogen_in_effluent, organic_load_from_population,
                              wastewater_ch4, wastewater_n2o)
from ghg_core.methods.wastewater import N_TO_N2O
from ghg_core.quantities import D


def test_the_parameters_carry_their_source():
    p = WastewaterParameters.load()
    assert "IPCC 2006" in p.source_name
    assert p.source_url.endswith(".pdf")
    assert "6.2" in p.read_from


def test_the_published_defaults_are_the_ones_loaded():
    p = WastewaterParameters.load()
    assert p.bo_per_kg_bod == D("0.6")
    assert p.bo_per_kg_cod == D("0.25")
    assert p.ef_effluent == D("0.005")
    assert p.protein_nitrogen_fraction == D("0.16")


def test_the_treatment_systems_carry_their_own_conversion_factors():
    p = WastewaterParameters.load()
    # A sea or river discharge is nothing like an anaerobic reactor.
    assert p.mcf_for("anaerobic_reactor") > p.mcf_for("sea_river_lake_discharge")


def test_a_system_that_was_never_published_is_refused():
    with pytest.raises(KeyError, match="No IPCC default MCF"):
        WastewaterParameters.load().mcf_for("a pond out the back")


def test_the_organic_load_follows_equation_6_3():
    # 100,000 people x 40 g BOD per day x 0.001 x 365, no industrial uplift.
    assert organic_load_from_population(100_000, 40) == D(100_000) * D(40) * D("0.001") * D(365)


def test_industrial_discharge_raises_the_domestic_load():
    plain = organic_load_from_population(100_000, 40)
    with_industry = organic_load_from_population(100_000, 40, "1.25")
    assert with_industry == plain * D("1.25")


def test_methane_follows_equation_6_2():
    p = WastewaterParameters.load()
    load = D(1_000_000)          # kg BOD per year
    pathway = TreatmentPathway("anaerobic_reactor", D(1))
    result = wastewater_ch4(load, [pathway])
    assert result.ch4_kg == load * D("0.6") * p.mcf_for("anaerobic_reactor")


def test_pathway_shares_have_to_account_for_the_whole_load():
    with pytest.raises(ValueError, match="has to go somewhere"):
        wastewater_ch4(1_000_000, [TreatmentPathway("anaerobic_reactor", D("0.6"))])


def test_the_load_can_be_split_across_treatment_routes():
    load = D(1_000_000)
    split = wastewater_ch4(load, [
        TreatmentPathway("anaerobic_reactor", D("0.5")),
        TreatmentPathway("sea_river_lake_discharge", D("0.5")),
    ])
    all_anaerobic = wastewater_ch4(load, [TreatmentPathway("anaerobic_reactor", D(1))])
    assert split.ch4_kg < all_anaerobic.ch4_kg
    assert set(split.by_pathway) == {"anaerobic_reactor", "sea_river_lake_discharge"}


def test_sludge_removed_never_reaches_the_treatment_step():
    full = wastewater_ch4(1_000_000, [TreatmentPathway("anaerobic_reactor", D(1))])
    less_sludge = wastewater_ch4(1_000_000, [TreatmentPathway("anaerobic_reactor", D(1))],
                                 sludge_removed_kg=200_000)
    assert less_sludge.ch4_kg == full.ch4_kg * D("0.8")


def test_removing_more_sludge_than_there_is_load_is_refused():
    with pytest.raises(ValueError, match="same basis"):
        wastewater_ch4(1000, [TreatmentPathway("anaerobic_reactor", D(1))],
                       sludge_removed_kg=5000)


def test_an_industrial_load_is_measured_as_cod_not_bod():
    # Bo is 0.25 per kg COD against 0.6 per kg BOD: the same number of
    # kilograms means very different methane depending on which was measured.
    as_bod = wastewater_ch4(1_000_000, [TreatmentPathway("anaerobic_reactor", D(1))])
    as_cod = wastewater_ch4(1_000_000, [TreatmentPathway("anaerobic_reactor", D(1))],
                            load_basis="COD")
    assert as_cod.ch4_kg < as_bod.ch4_kg


def test_a_load_basis_that_is_neither_is_refused():
    with pytest.raises(ValueError, match="BOD or COD"):
        wastewater_ch4(1000, [TreatmentPathway("anaerobic_reactor", D(1))],
                       load_basis="TOC")


def test_recovered_methane_is_subtracted_but_cannot_make_a_sink():
    result = wastewater_ch4(1000, [TreatmentPathway("anaerobic_reactor", D(1),
                                                    methane_recovered_kg=D(10_000))])
    assert result.ch4_kg == D(0)


def test_effluent_nitrogen_follows_equation_6_8():
    p = WastewaterParameters.load()
    # 100,000 people x 20 kg protein x 0.16 N x 1.1 non-consumed x 1.25 industrial.
    expected = D(100_000) * D(20) * D("0.16") * D("1.1") * D("1.25")
    assert nitrogen_in_effluent(100_000, 20) == expected
    assert p.non_consumed_protein["developing"] == D("1.1")


def test_a_developed_economy_wastes_more_of_its_protein():
    developing = nitrogen_in_effluent(100_000, 20)
    developed = nitrogen_in_effluent(100_000, 20, economy="developed")
    assert developed > developing


def test_a_plant_with_no_industrial_discharges_drops_that_factor():
    with_industry = nitrogen_in_effluent(100_000, 20)
    without = nitrogen_in_effluent(100_000, 20, industrial_discharges_to_sewer=False)
    assert without == with_industry / D("1.25")


def test_an_economy_that_is_neither_is_refused():
    with pytest.raises(KeyError, match="developed"):
        nitrogen_in_effluent(100_000, 20, economy="emerging")


def test_nitrogen_removed_as_sludge_is_not_discharged():
    plain = nitrogen_in_effluent(100_000, 20)
    with_sludge = nitrogen_in_effluent(100_000, 20, sludge_nitrogen_kg=1000)
    assert with_sludge == plain - D(1000)


def test_nitrous_oxide_follows_equation_6_7():
    # 100,000 kg N discharged x EF 0.005 x 44/28.
    assert wastewater_n2o(100_000) == D(100_000) * D("0.005") * N_TO_N2O


def test_the_results_are_gas_masses_not_carbon_dioxide_equivalent():
    # The GWP set is applied by the report, so one calculation serves AR5 and AR6.
    methane = wastewater_ch4(1000, [TreatmentPathway("anaerobic_reactor", D(1))])
    assert isinstance(methane.ch4_kg, type(D(1)))
    assert wastewater_n2o(1000) > D(0)
