"""IPCC Tier 1 N2O from managed soils.

The parameters come from the ingested file, which was read from Tables 11.1 and
11.3. The activity data here is invented; the expected results are worked by
hand from the IPCC equations in the docstrings.
"""
from decimal import Decimal

import pytest

from ghg_core.methods import NitrogenInputs, managed_soil_n2o, nitrogen_in
from ghg_core.methods.managed_soils import N_TO_N2O, SoilParameters
from ghg_core.quantities import D


def test_the_parameters_carry_their_source():
    p = SoilParameters.load()
    assert "IPCC 2006" in p.source_name
    assert p.source_url.endswith(".pdf")
    assert "Table 11.1" in p.read_from and "Table 11.3" in p.read_from


def test_the_published_defaults_are_the_ones_loaded():
    p = SoilParameters.load()
    assert p.get("EF1") == D("0.01")
    assert p.get("EF1FR") == D("0.003")
    assert p.get("EF3PRP_CPP") == D("0.02")
    assert p.get("EF4") == D("0.010")
    assert p.get("EF5") == D("0.0075")
    assert p.get("FracGASF") == D("0.10")
    assert p.get("FracGASM") == D("0.20")
    assert p.get("FracLEACH_H") == D("0.30")


def test_a_parameter_that_was_never_ingested_is_refused():
    with pytest.raises(KeyError, match="do not estimate"):
        SoilParameters.load().get("EF9_invented")


def test_direct_emissions_follow_equation_11_1():
    # 10,000 kg of synthetic N. Direct: 10,000 x 0.01 = 100 kg N2O-N.
    result = managed_soil_n2o(NitrogenInputs(
        synthetic_fertiliser_n=D(10000), leaching_occurs=False))
    assert result.components["direct_n2o_n"] == D(100)
    assert result.direct_kg_n2o == D(100) * N_TO_N2O
    assert result.direct_kg_n2o == pytest.approx(Decimal("157.142857"), abs=Decimal("0.001"))


def test_flooded_rice_uses_its_own_lower_factor():
    upland = managed_soil_n2o(NitrogenInputs(synthetic_fertiliser_n=D(1000), leaching_occurs=False))
    rice = managed_soil_n2o(NitrogenInputs(flooded_rice_n=D(1000), leaching_occurs=False))
    # EF1FR is 0.003 against EF1 of 0.01: a bit under a third.
    assert rice.direct_kg_n2o < upland.direct_kg_n2o
    assert rice.direct_kg_n2o == upland.direct_kg_n2o * D("0.3")


def test_volatilisation_follows_equation_11_9():
    # Synthetic: 10,000 x 0.10 volatilised = 1,000 kg N; x EF4 0.010 = 10 kg N2O-N.
    result = managed_soil_n2o(NitrogenInputs(
        synthetic_fertiliser_n=D(10000), leaching_occurs=False))
    assert result.components["volatilised_n"] == D(1000)
    assert result.components["volatilisation_n2o_n"] == D(10)


def test_organic_nitrogen_volatilises_twice_as_readily_as_synthetic():
    synthetic = managed_soil_n2o(NitrogenInputs(synthetic_fertiliser_n=D(1000), leaching_occurs=False))
    organic = managed_soil_n2o(NitrogenInputs(organic_amendment_n=D(1000), leaching_occurs=False))
    assert organic.volatilisation_kg_n2o == synthetic.volatilisation_kg_n2o * 2


def test_leaching_is_zero_where_it_does_not_occur():
    dry = managed_soil_n2o(NitrogenInputs(synthetic_fertiliser_n=D(10000), leaching_occurs=False))
    wet = managed_soil_n2o(NitrogenInputs(synthetic_fertiliser_n=D(10000), leaching_occurs=True))
    assert dry.leaching_kg_n2o == 0
    # 10,000 x 0.30 x 0.0075 = 22.5 kg N2O-N
    assert wet.components["leaching_n2o_n"] == D("22.5")
    assert wet.total_kg_n2o > dry.total_kg_n2o


def test_grazing_animal_type_changes_the_factor():
    cattle = managed_soil_n2o(NitrogenInputs(grazing_deposition_n=D(1000), leaching_occurs=False))
    sheep = managed_soil_n2o(NitrogenInputs(
        grazing_deposition_n=D(1000), grazing_is_cattle_poultry_pigs=False, leaching_occurs=False))
    assert cattle.components["ef3_applied"] == D("0.02")
    assert sheep.components["ef3_applied"] == D("0.01")
    assert sheep.direct_kg_n2o == cattle.direct_kg_n2o / 2


def test_the_result_is_a_mass_of_n2o_not_co2e():
    # So the report can express it under AR5 or AR6, rather than being locked in.
    result = managed_soil_n2o(NitrogenInputs(synthetic_fertiliser_n=D(1000), leaching_occurs=False))
    assert result.total_kg_n2o < D(1000)          # a mass of gas, not a CO2e figure
    assert result.direct_kg_n2o == D(10) * N_TO_N2O


def test_nitrogen_content_must_be_supplied_and_sensible():
    assert nitrogen_in(1000, "0.46") == D(460)    # urea is 46% N
    with pytest.raises(ValueError, match="between 0 and 1"):
        nitrogen_in(1000, 46)
