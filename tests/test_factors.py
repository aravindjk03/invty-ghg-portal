"""Factor registry: a miss must RAISE, and every fallback must set its flag."""
import pytest
from decimal import Decimal

from ghg_core import EmissionFactor, FactorNotFoundError, InMemoryFactorRegistry
from ghg_core.factors import (ENERGY_BASIS, PHYSICAL_BASIS, Flag,
                              assert_basis_compatible)
from ghg_core.errors import EfBasisMismatchError
from conftest import ef


def test_registry_ships_empty():
    """No emission factor values are bundled with the package."""
    assert len(InMemoryFactorRegistry()) == 0


def test_missing_factor_raises_and_never_returns_zero(registry):
    with pytest.raises(FactorNotFoundError) as e:
        registry.resolve("fuel.unobtanium", "IN", 2026, "CO2")
    assert "NOT zero" in str(e.value)


def test_exact_match_flags_exact(registry):
    r = registry.resolve("fuel.diesel.stationary", "IN", 2026, "CO2")
    assert r.flags == (Flag.EXACT,)
    assert r.is_proxy is False


def test_prior_year_fallback_flags_year_mismatch(registry):
    r = registry.resolve("cat6.rail", "IN", 2026, "CO2")   # only a 2020 row exists
    assert Flag.YEAR_MISMATCH in r.flags
    assert r.factor.reference_year == 2020
    assert r.is_proxy is True


def test_never_uses_a_future_factor(registry):
    """Resolving 2019 must not silently reach forward to the 2020 row."""
    with pytest.raises(FactorNotFoundError):
        registry.resolve("cat6.rail", "IN", 2019, "CO2")


def test_region_fallback_flags_global_proxy(registry):
    r = registry.resolve("cat4.road_hgv", "IN", 2026, "CO2")  # only GLOBAL exists
    assert Flag.GLOBAL_PROXY in r.flags


def test_superseded_factors_are_never_returned():
    r = InMemoryFactorRegistry()
    r.add(ef(version_id="old", activity_key="x", region="IN", reference_year=2026,
             gas="CO2", value="1", numerator_unit="kgCO2e", denominator_unit="kg",
             ef_basis=PHYSICAL_BASIS, superseded_by="new"))
    with pytest.raises(FactorNotFoundError):
        r.resolve("x", "IN", 2026, "CO2")


def test_factor_without_a_source_is_rejected():
    """An unsourced factor is indistinguishable from an invented one."""
    with pytest.raises(ValueError, match="no source reference"):
        EmissionFactor(version_id="v", activity_key="x", region="IN",
                       reference_year=2026, gas="CO2", value="1",
                       numerator_unit="kgCO2e", denominator_unit="kg",
                       ef_basis=PHYSICAL_BASIS, source_name="", 
                       source_table_ref="", source_url="", factor_set_id="X")


def test_ef_basis_is_mandatory_and_validated():
    with pytest.raises(ValueError, match="ef_basis"):
        ef(version_id="v", activity_key="x", region="IN", reference_year=2026,
           gas="CO2", value="1", numerator_unit="kgCO2e",
           denominator_unit="kg", ef_basis="whatever")


def test_energy_basis_factor_with_a_non_energy_denominator_is_rejected(registry):
    """A misconfigured factor row must be caught, not silently used."""
    bad = ef(version_id="bad", activity_key="x", region="IN", reference_year=2026,
             gas="CO2", value="1", numerator_unit="kgCO2", denominator_unit="L",
             ef_basis=ENERGY_BASIS)
    with pytest.raises(EfBasisMismatchError, match="misconfigured"):
        assert_basis_compatible(bad, "volume", "volume")


def test_physical_basis_with_energy_denominator_rejects_a_mass_activity(registry):
    """Bridging mass to a per-kWh factor needs an NCV -> the factor is mislabelled.

    This is the ~40x silent error the ef_basis column exists to prevent.
    """
    f = registry.resolve("elec.grid.location", "IN", 2026, "CO2").factor
    with pytest.raises(EfBasisMismatchError, match="energy-basis"):
        assert_basis_compatible(f, "mass", "energy")


def test_electricity_in_kwh_against_a_per_kwh_factor_is_allowed(registry):
    """The legitimate case the guard must NOT block."""
    f = registry.resolve("elec.grid.location", "IN", 2026, "CO2").factor
    assert_basis_compatible(f, "energy", "energy")   # no raise


def test_fuel_in_litres_against_a_per_litre_factor_is_allowed(registry):
    f = registry.resolve("fuel.diesel.stationary", "IN", 2026, "CO2").factor
    assert_basis_compatible(f, "volume", "volume")   # no raise
