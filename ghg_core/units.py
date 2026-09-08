"""Unit registry and conversion.

Design decision worth understanding:

We do NOT let a units library do the arithmetic. Every conversion factor here
is an EXACT Decimal, defined from the SI/IT definition. `pint` is used in the
test suite as an INDEPENDENT cross-check that each factor is right - so we get
exact decimal arithmetic in production and a second opinion in CI.

Canonical units: mass -> kg, volume -> m3, energy -> MJ, distance -> km,
freight -> t.km, currency and counts are passed through untouched.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from .errors import (
    FuelPropertyRequiredError,
    GasReferenceMismatchError,
    IncompatibleUnitsError,
    UnknownUnitError,
)
from .quantities import D

MASS, VOLUME, ENERGY, DISTANCE, FREIGHT = "mass", "volume", "energy", "distance", "freight"
CURRENCY, COUNT, AREA_TIME = "currency", "count", "area_time"
AREA = "area"

CANONICAL = {
    MASS: "kg", VOLUME: "m3", ENERGY: "MJ", DISTANCE: "km",
    FREIGHT: "t.km", CURRENCY: None, COUNT: "unit", AREA_TIME: "m2.yr", AREA: "m2",
}


@dataclass(frozen=True)
class UnitDef:
    name: str
    dimension: str
    to_canonical: Decimal          # exact multiplier into the canonical unit
    gas_reference: Optional[str] = None   # scm / Nm3 carry their reference state
    note: str = ""


def _u(name, dim, factor, gas_ref=None, note=""):
    return UnitDef(name, dim, D(factor), gas_ref, note)


# Every factor below is exact by definition, not measured.
_UNITS = {u.name: u for u in [
    # ---- mass ----
    _u("kg", MASS, "1"),
    _u("g", MASS, "0.001"),
    _u("t", MASS, "1000", note="metric tonne"),
    _u("kt", MASS, "1000000"),
    _u("lb", MASS, "0.45359237", note="exact by international definition"),

    # ---- volume ----
    _u("m3", VOLUME, "1"),
    _u("L", VOLUME, "0.001"),
    _u("kL", VOLUME, "1", note="kilolitre == 1 m3. The classic 1000x trap."),
    _u("gal", VOLUME, "0.003785411784", note="US liquid gallon, exact"),
    _u("scm", VOLUME, "1", gas_ref="standard",
       note="standard cubic metre - density must be quoted at the same state"),
    _u("Nm3", VOLUME, "1", gas_ref="normal",
       note="normal cubic metre - differs from scm by ~5% in mass terms"),

    # ---- energy ----
    _u("MJ", ENERGY, "1"),
    _u("kJ", ENERGY, "0.001"),
    _u("GJ", ENERGY, "1000"),
    _u("TJ", ENERGY, "1000000"),
    _u("kWh", ENERGY, "3.6", note="exact: 1 kWh = 3.6 MJ"),
    _u("MWh", ENERGY, "3600"),
    _u("GWh", ENERGY, "3600000"),
    _u("kcal", ENERGY, "0.0041868", note="International Steam Table calorie, 1956"),
    _u("Mcal", ENERGY, "4.1868"),
    _u("MMBtu", ENERGY, "1055.05585262", note="IT Btu, exact"),
    _u("TR-hr", ENERGY, "12.66067023144",
       note="ton of refrigeration hour = 12000 Btu_IT, exact"),
    _u("therm", ENERGY, "105.505585262"),

    # ---- distance ----
    _u("km", DISTANCE, "1"),
    _u("m", DISTANCE, "0.001"),
    _u("mi", DISTANCE, "1.609344", note="exact by definition"),

    # ---- freight ----
    _u("t.km", FREIGHT, "1"),
    _u("kg.km", FREIGHT, "0.001"),

    # ---- pass-through ----
    _u("unit", COUNT, "1"),
    _u("night", COUNT, "1"),
    _u("day", COUNT, "1"),
    _u("head.yr", COUNT, "1"),
    _u("ha", COUNT, "1"),
    _u("m2.yr", AREA_TIME, "1"),
    _u("m2", AREA, "1"),
    _u("sqft", AREA, "0.09290304", note="exact by definition"),
    _u("FTE.yr", COUNT, "1", note="full-time-equivalent employee year"),
]}

# Things Indian users actually type.
_ALIASES = {
    "kwh": "kWh", "units": "kWh", "unit(kwh)": "kWh", "kilowatt-hour": "kWh",
    "mwh": "MWh", "gwh": "GWh", "mj": "MJ", "gj": "GJ", "tj": "TJ",
    "litre": "L", "liter": "L", "l": "L", "ltr": "L",
    "kilolitre": "kL", "kiloliter": "kL", "kl": "kL",
    "tonne": "t", "tonnes": "t", "mt": "t", "ton": "t",
    "kilogram": "kg", "kgs": "kg", "kilograms": "kg",
    "cubic metre": "m3", "cubic meter": "m3", "m^3": "m3", "cum": "m3",
    "sm3": "scm", "nm^3": "Nm3", "normal m3": "Nm3",
    "kilometre": "km", "kilometer": "km", "kms": "km",
    "mile": "mi", "miles": "mi",
    "tkm": "t.km", "t-km": "t.km", "tonne-km": "t.km",
    "trhr": "TR-hr", "tr-hr": "TR-hr", "tr.hr": "TR-hr",
    "sq ft": "sqft", "sq.ft": "sqft", "ft2": "sqft", "m^2": "m2",
    "fte.yr": "FTE.yr", "fte-yr": "FTE.yr",
    "mmbtu": "MMBtu", "kcal": "kcal",
}

CURRENCIES = {"INR", "USD", "EUR", "GBP", "JPY"}


def normalise_unit(raw: str) -> str:
    """Resolve a user-typed unit string to a registry key. Never guesses."""
    if raw is None:
        raise UnknownUnitError("Unit is required; it cannot be blank.")
    s = str(raw).strip()
    if s in _UNITS:
        return s
    if s.upper() in CURRENCIES:
        return s.upper()
    key = _ALIASES.get(s.lower())
    if key:
        return key
    raise UnknownUnitError(
        f"Unknown unit {raw!r}. Add it to the registry with an exact, sourced "
        f"conversion factor - never infer one at runtime."
    )


def dimension_of(unit: str) -> str:
    u = normalise_unit(unit)
    if u in CURRENCIES:
        return CURRENCY
    return _UNITS[u].dimension


def unit_def(unit: str) -> UnitDef:
    u = normalise_unit(unit)
    if u in CURRENCIES:
        return UnitDef(u, CURRENCY, D(1))
    return _UNITS[u]


@dataclass(frozen=True)
class FuelProperty:
    """A dated, sourced physical property of one fuel.

    density_kg_per_m3 : bridges VOLUME <-> MASS
    ncv_mj_per_kg     : bridges MASS   <-> ENERGY
    gas_reference     : 'standard' | 'normal' | None - must match the unit used
    """
    fuel_key: str
    source_name: str
    source_ref: str
    reference_year: int
    density_kg_per_m3: Optional[Decimal] = None
    ncv_mj_per_kg: Optional[Decimal] = None
    gas_reference: Optional[str] = None
    basis: Optional[str] = None   # as_received | air_dried | equilibrated | daf

    def __post_init__(self):
        for f in ("density_kg_per_m3", "ncv_mj_per_kg"):
            v = getattr(self, f)
            if v is not None and not isinstance(v, Decimal):
                object.__setattr__(self, f, D(v))


def to_canonical(value, unit: str) -> tuple[Decimal, str, str]:
    """Convert into the canonical unit for the value's own dimension."""
    ud = unit_def(unit)
    if ud.dimension == CURRENCY:
        return D(value), ud.name, CURRENCY
    return D(value) * ud.to_canonical, CANONICAL[ud.dimension], ud.dimension


def convert(value, from_unit: str, to_unit: str,
            fuel: Optional[FuelProperty] = None) -> Decimal:
    """Convert between units, crossing dimensions only with a fuel property.

    Raises rather than guessing. That refusal is the whole safety mechanism.
    """
    src, dst = unit_def(from_unit), unit_def(to_unit)
    v = D(value)

    if src.dimension == dst.dimension:
        if src.dimension == CURRENCY:
            if src.name != dst.name:
                raise IncompatibleUnitsError(
                    "Currency conversion needs a dated FX rate; it is not a "
                    "unit conversion. Use the spend-based pipeline.")
            return v
        return v * src.to_canonical / dst.to_canonical

    # --- crossing dimensions ---
    if fuel is None:
        raise FuelPropertyRequiredError(
            f"Cannot convert {src.name} ({src.dimension}) to {dst.name} "
            f"({dst.dimension}) without a dated, sourced fuel property. "
            f"This is physics, not unit arithmetic.")

    _check_gas_reference(src, fuel)
    _check_gas_reference(dst, fuel)

    kg = _to_kg(v, src, fuel)
    return _from_kg(kg, dst, fuel)


def _check_gas_reference(ud: UnitDef, fuel: FuelProperty) -> None:
    if ud.gas_reference is None:
        return
    if fuel.gas_reference is None:
        raise GasReferenceMismatchError(
            f"{ud.name} is quoted at '{ud.gas_reference}' conditions but the "
            f"fuel property for {fuel.fuel_key} does not state its reference "
            f"state. scm and Nm3 differ by roughly 5% in mass terms.")
    if fuel.gas_reference != ud.gas_reference:
        raise GasReferenceMismatchError(
            f"{ud.name} is '{ud.gas_reference}' but the density for "
            f"{fuel.fuel_key} was measured at '{fuel.gas_reference}'.")


def _to_kg(value: Decimal, ud: UnitDef, fuel: FuelProperty) -> Decimal:
    if ud.dimension == MASS:
        return value * ud.to_canonical
    if ud.dimension == VOLUME:
        if fuel.density_kg_per_m3 is None:
            raise FuelPropertyRequiredError(
                f"Volume->mass for {fuel.fuel_key} needs a density.")
        return value * ud.to_canonical * fuel.density_kg_per_m3
    if ud.dimension == ENERGY:
        if fuel.ncv_mj_per_kg is None:
            raise FuelPropertyRequiredError(
                f"Energy->mass for {fuel.fuel_key} needs a net calorific value.")
        return value * ud.to_canonical / fuel.ncv_mj_per_kg
    raise IncompatibleUnitsError(
        f"{ud.dimension} cannot be bridged to mass by a fuel property.")


def _from_kg(kg: Decimal, ud: UnitDef, fuel: FuelProperty) -> Decimal:
    if ud.dimension == MASS:
        return kg / ud.to_canonical
    if ud.dimension == VOLUME:
        if fuel.density_kg_per_m3 is None:
            raise FuelPropertyRequiredError(
                f"Mass->volume for {fuel.fuel_key} needs a density.")
        return kg / fuel.density_kg_per_m3 / ud.to_canonical
    if ud.dimension == ENERGY:
        if fuel.ncv_mj_per_kg is None:
            raise FuelPropertyRequiredError(
                f"Mass->energy for {fuel.fuel_key} needs a net calorific value.")
        return kg * fuel.ncv_mj_per_kg / ud.to_canonical
    raise IncompatibleUnitsError(
        f"mass cannot be bridged to {ud.dimension} by a fuel property.")


def to_energy_mj(value, unit: str, fuel: Optional[FuelProperty] = None) -> Decimal:
    """Activity -> MJ. Needed by every energy-basis emission factor."""
    return convert(value, unit, "MJ", fuel)


def gcv_kcal_per_kg_to_mj_per_kg(gcv_kcal_per_kg) -> Decimal:
    """Indian coal is quoted in kcal/kg. Exact conversion, no NCV assumption.

    This deliberately returns GROSS calorific value in MJ/kg. Turning GCV into
    NCV requires a published, sourced relationship for the fuel class - it is
    NOT a hardcoded rule of thumb and is not done here.
    """
    return D(gcv_kcal_per_kg) * D("0.0041868")


def list_units() -> list[str]:
    return sorted(_UNITS)
