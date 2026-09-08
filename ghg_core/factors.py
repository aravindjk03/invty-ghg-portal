"""Emission factor registry and resolution.

Factors are immutable and versioned. A revised factor is a NEW row and the old
one is marked superseded, so any calculation ever performed can be replayed
exactly, years later, from its stored factor_version_id.

Resolution NEVER returns zero for a miss. It raises.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Iterable, Optional, Protocol

from .errors import EfBasisMismatchError, FactorNotFoundError
from .quantities import D

ENERGY_BASIS = "energy"      # factor is per unit of ENERGY -> needs an NCV
PHYSICAL_BASIS = "physical"  # factor already embeds the NCV -> must NOT re-apply


class Flag(str, Enum):
    EXACT = "exact"
    YEAR_MISMATCH = "factor_year_mismatch"
    REGIONAL_PROXY = "regional_proxy"
    GLOBAL_PROXY = "global_proxy"


@dataclass(frozen=True)
class EmissionFactor:
    version_id: str
    activity_key: str
    region: str
    reference_year: int
    gas: str
    value: Decimal
    numerator_unit: str        # e.g. kgCO2 | kgCH4 | kgCO2e
    denominator_unit: str      # e.g. MJ | L | kWh | t.km | INR
    ef_basis: str              # ENERGY_BASIS | PHYSICAL_BASIS
    source_name: str
    source_table_ref: str
    source_url: str
    factor_set_id: str
    superseded_by: Optional[str] = None
    uncertainty_pct: Optional[Decimal] = None

    def __post_init__(self):
        object.__setattr__(self, "value", D(self.value))
        if self.ef_basis not in (ENERGY_BASIS, PHYSICAL_BASIS):
            raise ValueError(
                f"ef_basis must be {ENERGY_BASIS!r} or {PHYSICAL_BASIS!r}, "
                f"got {self.ef_basis!r}. Without it the engine cannot know "
                f"whether to apply a calorific value.")
        if not self.source_url or not self.source_table_ref:
            raise ValueError(
                f"Factor {self.activity_key}/{self.region} has no source "
                f"reference. An unsourced factor is indistinguishable from an "
                f"invented one and must not enter the registry.")


@dataclass(frozen=True)
class FactorResolution:
    factor: EmissionFactor
    flags: tuple[Flag, ...]

    @property
    def is_proxy(self) -> bool:
        return any(f is not Flag.EXACT for f in self.flags)


# region -> parent, walked upward on a miss. Extend as regions are added.
REGION_PARENTS = {
    "IN-MH": "IN", "IN-TN": "IN", "IN-GJ": "IN", "IN-KA": "IN", "IN-UP": "IN",
    "IN-NORTH": "IN", "IN-WEST": "IN", "IN-SOUTH": "IN", "IN-EAST": "IN",
    "IN-NEAST": "IN",
    "IN": "GLOBAL", "GB": "GLOBAL", "US": "GLOBAL", "EU": "GLOBAL",
}


class FactorProvider(Protocol):
    """Swap in a commercial provider later without touching the engine."""
    def resolve(self, activity_key: str, region: str, reporting_year: int,
                gas: str) -> FactorResolution: ...


class InMemoryFactorRegistry:
    """Reference implementation. Ships EMPTY - values come from ingestion."""

    def __init__(self, factors: Iterable[EmissionFactor] = ()):
        self._rows: list[EmissionFactor] = [f for f in factors]

    def add(self, factor: EmissionFactor) -> None:
        self._rows.append(factor)

    def __len__(self) -> int:
        return len(self._rows)

    def _candidates(self, key, region, gas):
        return [f for f in self._rows
                if f.activity_key == key and f.region == region
                and f.gas == gas and f.superseded_by is None]

    def resolve(self, activity_key: str, region: str, reporting_year: int,
                gas: str) -> FactorResolution:
        """Five-step fallback. Step five RAISES - it never returns zero."""
        # 1 exact
        rows = self._candidates(activity_key, region, gas)
        exact = [f for f in rows if f.reference_year == reporting_year]
        if exact:
            return FactorResolution(exact[0], (Flag.EXACT,))

        # 2 same region, nearest PRIOR year (never a future factor)
        prior = sorted((f for f in rows if f.reference_year < reporting_year),
                       key=lambda f: f.reference_year, reverse=True)
        if prior:
            return FactorResolution(prior[0], (Flag.YEAR_MISMATCH,))

        # 3 walk up the region hierarchy
        parent, seen = REGION_PARENTS.get(region), {region}
        while parent and parent not in seen:
            seen.add(parent)
            rows = self._candidates(activity_key, parent, gas)
            if rows:
                best = sorted(rows, key=lambda f: abs(f.reference_year - reporting_year))[0]
                flags = [Flag.GLOBAL_PROXY if parent == "GLOBAL" else Flag.REGIONAL_PROXY]
                if best.reference_year != reporting_year:
                    flags.append(Flag.YEAR_MISMATCH)
                return FactorResolution(best, tuple(flags))
            parent = REGION_PARENTS.get(parent)

        # 5 no match -> LOUD
        raise FactorNotFoundError(
            f"No emission factor for activity_key={activity_key!r} "
            f"region={region!r} year={reporting_year} gas={gas!r}. "
            f"A missing factor is NOT zero. Surface this row to the user as "
            f"'Factor unavailable', exclude it from totals, and list it in the "
            f"report's exclusions table."
        )


def assert_basis_compatible(factor: EmissionFactor, activity_dimension: str,
                            denominator_dimension: str) -> None:
    """Guard against the ~40x silent NCV error.

    ENERGY_BASIS means the factor is published per unit of FUEL ENERGY, so the
    activity must be bridged to energy with a sourced calorific value.
    PHYSICAL_BASIS means the factor already embeds any calorific value and the
    activity is used directly against the factor's own denominator.

    The trap this catches: a physical-basis factor whose denominator is an
    energy unit (e.g. kgCO2e per kWh) being handed a MASS or VOLUME activity.
    That silently needs an NCV, which means the factor was mislabelled.
    Electricity in kWh against a per-kWh factor is legitimate and allowed.
    """
    if factor.ef_basis == ENERGY_BASIS:
        if denominator_dimension != "energy":
            raise EfBasisMismatchError(
                f"Factor {factor.version_id} is declared energy-basis but its "
                f"denominator {factor.denominator_unit!r} is "
                f"{denominator_dimension}, not energy. The factor row is "
                f"misconfigured.")
        return

    if denominator_dimension == "energy" and activity_dimension != "energy":
        raise EfBasisMismatchError(
            f"Factor {factor.version_id} is physical-basis with an energy "
            f"denominator ({factor.denominator_unit}), but the activity was "
            f"supplied as {activity_dimension}. Bridging those needs a "
            f"calorific value, which means this factor should be declared "
            f"energy-basis. Refusing rather than silently applying an NCV.")
