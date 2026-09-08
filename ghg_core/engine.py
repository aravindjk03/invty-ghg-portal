"""The calculation engine.

Pure functions. No I/O, no database, no network. Factors and fuel properties
are loaded up front and passed in. Same inputs + same pins = same output,
forever.

Implements the equations in docs/calculation-methodology.md sections 2.1-2.12.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, asdict
from decimal import Decimal
from typing import Optional, Sequence

from .errors import DoubleCountError
from .factors import (ENERGY_BASIS, Flag, FactorProvider, FactorResolution,
                      assert_basis_compatible)
from .gwp import CH4_FOSSIL, CH4_NONFOSSIL, CO2, GwpSet
from .quantities import D, ZERO
from .units import FuelProperty, dimension_of, to_canonical, to_energy_mj

ENGINE_VERSION = "1.0.0"

SCOPE_1, SCOPE_2, SCOPE_3, MEMO = "1", "2", "3", "memo"

# Buckets that are reported but NEVER enter a scope total.
MEMO_BIOGENIC = "biogenic_co2"
MEMO_MONTREAL = "montreal_protocol_gases"
MEMO_REMOVALS = "removals"
MEMO_OFFSETS = "offsets_retired"
MEMO_ENERGY_BALANCE = "energy_balance"

DQ_PRIMARY, DQ_SECONDARY, DQ_PROXY, DQ_ESTIMATED = (
    "primary", "secondary", "proxy", "estimated")


@dataclass
class ActivityRecord:
    """One row of user-entered data."""
    record_id: str
    activity_key: str
    scope: str                       # "1" | "2" | "3" | "memo"
    ghg_category: str                # "1.1" ... "3.15" | "memo"
    region: str
    value: Optional[Decimal]         # None == incomplete, NOT zero
    unit: Optional[str]
    facility_id: Optional[str] = None
    method: str = "average_data"
    fuel_key: Optional[str] = None
    biogenic_fraction: Optional[Decimal] = None   # ENERGY basis, never mass
    biogenic_basis: Optional[str] = None          # "energy" | "carbon"
    memo_bucket: Optional[str] = None
    scope2_view: Optional[str] = None             # "location" | "market"
    data_quality_tier: str = DQ_SECONDARY
    note: str = ""

    def __post_init__(self):
        if self.value is not None:
            self.value = D(self.value)
        if self.biogenic_fraction is not None:
            self.biogenic_fraction = D(self.biogenic_fraction)

    @property
    def is_complete(self) -> bool:
        """Empty is null, not zero. Incomplete rows are EXCLUDED from sums."""
        return self.value is not None and self.unit is not None


@dataclass
class LineResult:
    record_id: str
    activity_key: str
    scope: str
    ghg_category: str
    normalised_value: Optional[Decimal]
    normalised_unit: Optional[str]
    factor_version_id: Optional[str]
    factor_value: Optional[Decimal]
    factor_source: Optional[str]
    factor_reference_year: Optional[int]
    gas_breakdown: dict[str, Decimal]
    gwp_applied: dict[str, Decimal]
    emissions_kgco2e: Decimal
    biogenic_co2_kg: Decimal
    memo_bucket: Optional[str]
    scope2_view: Optional[str]
    resolution_flags: list[str]
    data_quality_tier: str
    status: str                       # "calculated" | "incomplete" | "unavailable"
    message: str = ""


@dataclass
class Totals:
    scope1: Decimal = ZERO
    scope2_location: Decimal = ZERO
    scope2_market: Decimal = ZERO
    scope2_headline: Decimal = ZERO
    scope3_by_category: dict[str, Decimal] = field(default_factory=dict)
    scope3: Decimal = ZERO
    memo: dict[str, Decimal] = field(default_factory=dict)
    grand_total: Decimal = ZERO


@dataclass
class CalculationRun:
    run_id: str
    engine_version: str
    gwp_set_name: str
    factor_set_pins: dict[str, str]
    line_results: list[LineResult]
    totals: Totals
    excluded_records: list[dict]
    scope2_headline_view: str


def _gas_key_for_gwp(gas: str, biogenic: bool) -> str:
    if gas == "CH4":
        return CH4_NONFOSSIL if biogenic else CH4_FOSSIL
    return gas


def calculate(
    records: Sequence[ActivityRecord],
    registry: FactorProvider,
    gwp_set: GwpSet,
    reporting_year: int,
    fuel_properties: Optional[dict[str, FuelProperty]] = None,
    factor_set_pins: Optional[dict[str, str]] = None,
    gases: Sequence[str] = ("CO2", "CH4", "N2O"),
    scope2_headline_view: str = "location",
) -> CalculationRun:
    """Run the inventory.

    scope2_headline_view selects WHICH Scope 2 figure enters the grand total.
    Location-based and market-based are two views of the same electricity and
    are NEVER summed together.
    """
    fuel_properties = fuel_properties or {}
    factor_set_pins = factor_set_pins or {}
    if scope2_headline_view not in ("location", "market"):
        raise DoubleCountError(
            "scope2_headline_view must be exactly one of 'location' or "
            "'market'. Including both would double count electricity.")

    lines: list[LineResult] = []
    excluded: list[dict] = []

    for rec in records:
        if not rec.is_complete:
            lines.append(_blank_line(rec, "incomplete",
                                     "No value entered; excluded from totals."))
            excluded.append({"record_id": rec.record_id,
                             "activity_key": rec.activity_key,
                             "reason": "incomplete"})
            continue
        try:
            lines.append(_calc_line(rec, registry, gwp_set, reporting_year,
                                    fuel_properties, gases))
        except Exception as exc:                      # noqa: BLE001
            lines.append(_blank_line(rec, "unavailable", str(exc)))
            excluded.append({"record_id": rec.record_id,
                             "activity_key": rec.activity_key,
                             "reason": type(exc).__name__,
                             "detail": str(exc)})

    totals = _assemble_totals(lines, scope2_headline_view)
    return CalculationRun(
        run_id=_run_id(records, gwp_set, factor_set_pins, scope2_headline_view),
        engine_version=ENGINE_VERSION,
        gwp_set_name=gwp_set.name,
        factor_set_pins=dict(factor_set_pins),
        line_results=lines,
        totals=totals,
        excluded_records=excluded,
        scope2_headline_view=scope2_headline_view,
    )


def _blank_line(rec: ActivityRecord, status: str, message: str) -> LineResult:
    return LineResult(
        record_id=rec.record_id, activity_key=rec.activity_key, scope=rec.scope,
        ghg_category=rec.ghg_category, normalised_value=None,
        normalised_unit=None, factor_version_id=None, factor_value=None,
        factor_source=None, factor_reference_year=None, gas_breakdown={},
        gwp_applied={}, emissions_kgco2e=ZERO, biogenic_co2_kg=ZERO,
        memo_bucket=rec.memo_bucket, scope2_view=rec.scope2_view,
        resolution_flags=[], data_quality_tier=rec.data_quality_tier,
        status=status, message=message)


def _calc_line(rec, registry, gwp_set, reporting_year, fuel_properties, gases):
    fuel = fuel_properties.get(rec.fuel_key) if rec.fuel_key else None
    src_dim = dimension_of(rec.unit)

    gas_breakdown: dict[str, Decimal] = {}
    gwp_applied: dict[str, Decimal] = {}
    total_co2e = ZERO
    biogenic_co2 = ZERO
    first: Optional[FactorResolution] = None
    norm_val, norm_unit = to_canonical(rec.value, rec.unit)[:2]

    for gas in gases:
        try:
            res = registry.resolve(rec.activity_key, rec.region, reporting_year, gas)
        except Exception:
            if gas == gases[0]:
                raise            # no factor at all for the primary gas -> fail loudly
            continue             # a fuel may legitimately emit only some gases
        first = first or res
        f = res.factor

        den_dim = dimension_of(f.denominator_unit)
        assert_basis_compatible(f, src_dim, den_dim)

        if f.ef_basis == ENERGY_BASIS:
            # Bridge the activity to energy with a sourced NCV, then express it
            # in the factor's own energy denominator (MJ, GJ, TJ...).
            activity = to_energy_mj(rec.value, rec.unit, fuel)
            activity = activity / to_canonical(1, f.denominator_unit)[0]
        else:
            activity = _to_factor_denominator(rec, f, fuel)

        mass_gas = activity * f.value            # kg of this gas (or kgCO2e)

        # Biogenic CO2 split - ENERGY or CARBON basis, never mass.
        if gas == "CO2" and rec.biogenic_fraction is not None:
            if rec.biogenic_basis not in ("energy", "carbon"):
                raise ValueError(
                    f"Record {rec.record_id}: biogenic_fraction requires "
                    f"biogenic_basis of 'energy' or 'carbon'. A mass basis "
                    f"gives a wrong split for blends.")
            biogenic_co2 = mass_gas * rec.biogenic_fraction
            mass_gas = mass_gas - biogenic_co2    # only fossil CO2 enters scope

        is_biogenic_gas = bool(rec.biogenic_fraction)
        gwp = gwp_set.gwp(_gas_key_for_gwp(gas, is_biogenic_gas)) \
            if f.numerator_unit != "kgCO2e" else D(1)

        gas_breakdown[gas] = gas_breakdown.get(gas, ZERO) + mass_gas
        gwp_applied[gas] = gwp
        total_co2e += mass_gas * gwp

    flags = [f.value for f in (first.flags if first else ())]
    dq = rec.data_quality_tier
    if first and first.is_proxy and dq in (DQ_PRIMARY, DQ_SECONDARY):
        dq = DQ_PROXY

    return LineResult(
        record_id=rec.record_id, activity_key=rec.activity_key, scope=rec.scope,
        ghg_category=rec.ghg_category, normalised_value=norm_val,
        normalised_unit=norm_unit,
        factor_version_id=first.factor.version_id if first else None,
        factor_value=first.factor.value if first else None,
        factor_source=f"{first.factor.source_name} · {first.factor.source_table_ref}"
        if first else None,
        factor_reference_year=first.factor.reference_year if first else None,
        gas_breakdown=gas_breakdown, gwp_applied=gwp_applied,
        emissions_kgco2e=total_co2e, biogenic_co2_kg=biogenic_co2,
        memo_bucket=rec.memo_bucket, scope2_view=rec.scope2_view,
        resolution_flags=flags, data_quality_tier=dq, status="calculated")


def _to_factor_denominator(rec, f, fuel):
    from .units import convert
    return convert(rec.value, rec.unit, f.denominator_unit, fuel)


def _assemble_totals(lines: Sequence[LineResult], headline_view: str) -> Totals:
    t = Totals()
    for ln in lines:
        if ln.status != "calculated":
            continue

        # Memo buckets NEVER enter a scope total.
        if ln.biogenic_co2_kg:
            t.memo[MEMO_BIOGENIC] = t.memo.get(MEMO_BIOGENIC, ZERO) + ln.biogenic_co2_kg
        if ln.scope == MEMO:
            b = ln.memo_bucket or MEMO_ENERGY_BALANCE
            t.memo[b] = t.memo.get(b, ZERO) + ln.emissions_kgco2e
            continue

        if ln.scope == SCOPE_1:
            t.scope1 += ln.emissions_kgco2e
        elif ln.scope == SCOPE_2:
            if ln.scope2_view == "market":
                t.scope2_market += ln.emissions_kgco2e
            else:
                t.scope2_location += ln.emissions_kgco2e
        elif ln.scope == SCOPE_3:
            c = ln.ghg_category
            t.scope3_by_category[c] = t.scope3_by_category.get(c, ZERO) + ln.emissions_kgco2e
            t.scope3 += ln.emissions_kgco2e

    t.scope2_headline = (t.scope2_market if headline_view == "market"
                         else t.scope2_location)
    t.grand_total = t.scope1 + t.scope2_headline + t.scope3
    return t


def derive_td_losses(consumed_kwh, loss_rate_of_generation, ef_kgco2e_per_kwh) -> Decimal:
    """Scope 3 Category 3 transmission & distribution losses.

        Generation needed  G    = C / (1 - L)
        Energy lost             = G - C = C * L / (1 - L)

    The naive C * L understates. India's loss rate is high, so this matters.
    """
    c, l = D(consumed_kwh), D(loss_rate_of_generation)
    if not (0 <= l < 1):
        raise ValueError("T&D loss rate must be a fraction of generation in [0,1).")
    return c * l / (D(1) - l) * D(ef_kgco2e_per_kwh)


def intensity(total: Decimal, denominator: Optional[Decimal]) -> Optional[Decimal]:
    """Never returns Infinity. A missing or zero denominator gives None."""
    if denominator is None:
        return None
    d = D(denominator)
    return None if d == 0 else D(total) / d


def _run_id(records, gwp_set, pins, view) -> str:
    """Deterministic: identical inputs and pins produce an identical run_id."""
    payload = json.dumps({
        "engine": ENGINE_VERSION, "gwp": gwp_set.name, "pins": pins, "view": view,
        "records": [
            {k: (str(v) if isinstance(v, Decimal) else v)
             for k, v in asdict(r).items()} for r in records],
    }, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]
