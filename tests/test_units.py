"""Unit conversion tests, cross-checked against pint as an independent opinion."""
import pytest
from decimal import Decimal
import pint

from ghg_core.units import (convert, normalise_unit, to_canonical, list_units,
                            unit_def, CANONICAL, CURRENCY,
                            gcv_kcal_per_kg_to_mj_per_kg)
from ghg_core.errors import (FuelPropertyRequiredError, GasReferenceMismatchError,
                             UnknownUnitError, IncompatibleUnitsError)

ureg = pint.UnitRegistry()
PINT_NAME = {   # (magnitude, pint unit) - pint rejects scaling factors inside .to()
    "kg": (1, "kilogram"), "g": (1, "gram"), "t": (1, "metric_ton"),
    "kt": (1000, "metric_ton"), "lb": (1, "pound"),
    "m3": (1, "meter**3"), "L": (1, "liter"), "kL": (1000, "liter"),
    "gal": (1, "gallon"),
    "MJ": (1, "megajoule"), "kJ": (1, "kilojoule"), "GJ": (1, "gigajoule"),
    "TJ": (1, "terajoule"), "kWh": (1, "kilowatt_hour"),
    "MWh": (1, "megawatt_hour"), "GWh": (1, "gigawatt_hour"),
    "kcal": (1000, "cal_it"), "Mcal": (1e6, "cal_it"),
    "MMBtu": (1e6, "Btu_it"), "therm": (1e5, "Btu_it"),
    "km": (1, "kilometer"), "m": (1, "meter"), "mi": (1, "mile"),
}


@pytest.mark.parametrize("name", sorted(PINT_NAME))
def test_factor_agrees_with_pint(name):
    """Our exact Decimal factors must match an independent library."""
    ud = unit_def(name)
    canon = CANONICAL[ud.dimension]
    got = float(ud.to_canonical)
    mag, pu = PINT_NAME[name]
    cmag, cpu = PINT_NAME[canon]
    expect = ureg.Quantity(mag, pu).to(cpu).magnitude / cmag
    assert got == pytest.approx(expect, rel=1e-12), f"{name}: {got} vs {expect}"


@pytest.mark.parametrize("unit", list_units())
def test_round_trip_every_unit(unit):
    """Every unit -> canonical -> back must return the original value exactly."""
    ud = unit_def(unit)
    if ud.dimension == CURRENCY:
        return
    v = Decimal("12345.6789")
    canon_val, canon_unit, _ = to_canonical(v, unit)
    back = convert(canon_val, canon_unit, unit)
    assert back == v, f"{unit} round-trip drifted: {back} != {v}"


def test_the_1000x_traps():
    assert convert(1, "kL", "L") == Decimal(1000)
    assert convert(1, "kg", "t") == Decimal("0.001")
    assert convert(1, "MWh", "kWh") == Decimal(1000)


def test_exact_definitions():
    assert convert(1, "kWh", "MJ") == Decimal("3.6")
    assert convert(1, "MMBtu", "GJ") == Decimal("1.05505585262")
    assert convert(1, "mi", "km") == Decimal("1.609344")


def test_litres_to_kwh_raises_without_fuel_property():
    with pytest.raises(FuelPropertyRequiredError):
        convert(1, "L", "kWh")


def test_litres_to_kg_raises_without_density():
    with pytest.raises(FuelPropertyRequiredError):
        convert(1, "L", "kg")


def test_litres_to_kg_works_with_density(fuels):
    # 1000 L = 1 m3; at 840 kg/m3 that is 840 kg. Checkable by hand.
    assert convert(1000, "L", "kg", fuels["diesel"]) == Decimal("840")


def test_mass_to_energy_needs_ncv(fuels):
    assert convert(1, "kg", "MJ", fuels["coal_g12"]) == Decimal("16.7472")
    no_ncv = fuels["natural_gas"]
    with pytest.raises(FuelPropertyRequiredError):
        convert(1, "kg", "MJ", no_ncv)


def test_scm_requires_matching_gas_reference(fuels):
    ng = fuels["natural_gas"]                     # measured at 'standard'
    assert convert(1, "scm", "kg", ng) == Decimal("0.8")
    with pytest.raises(GasReferenceMismatchError):
        convert(1, "Nm3", "kg", ng)               # measured at 'normal'


def test_unknown_unit_raises_never_guesses():
    with pytest.raises(UnknownUnitError):
        normalise_unit("bushels")


def test_indian_aliases():
    assert normalise_unit("units") == "kWh"       # Indian bills say "units"
    assert normalise_unit("KL") == "kL"
    assert normalise_unit("tonnes") == "t"


def test_currency_is_not_a_unit_conversion():
    with pytest.raises(IncompatibleUnitsError):
        convert(100, "INR", "USD")


def test_gcv_kcal_conversion_is_exact():
    # 4000 kcal/kg  ->  4000 * 0.0041868 = 16.7472 MJ/kg
    assert gcv_kcal_per_kg_to_mj_per_kg(4000) == Decimal("16.7472000")
