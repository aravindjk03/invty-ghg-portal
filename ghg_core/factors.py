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

from .errors import (AmbiguousBoundaryError, EfBasisMismatchError,
                     FactorNotFoundError, IncomparableFactorsError,
                     ProductRouteRequiredError)
from .quantities import D

ENERGY_BASIS = "energy"      # factor is per unit of ENERGY -> needs an NCV
PHYSICAL_BASIS = "physical"  # factor already embeds the NCV -> must NOT re-apply

# ---------------------------------------------------------------------------
# Product carbon (PCF) vocabulary.
#
# A cradle-to-gate material intensity IS an emission factor, so it lives in this
# same registry rather than a parallel one. What it needs beyond a fuel factor
# is a production route, a system boundary, and the allocation method its SOURCE
# used. See docs/product-carbon-and-mitigation-spec.md
# ---------------------------------------------------------------------------
PCF_PREFIX = "pcf."

CRADLE_TO_GATE = "cradle_to_gate"
CRADLE_TO_GRAVE = "cradle_to_grave"
GATE_TO_GATE = "gate_to_gate"
SYSTEM_BOUNDARIES = (CRADLE_TO_GATE, CRADLE_TO_GRAVE, GATE_TO_GATE)

# ISO 14067 allocation hierarchy. "unstated" is legitimate and must survive to
# the UI: a source that does not declare its allocation must never be assumed
# to have used mass.
ALLOCATION_METHODS = ("subdivision", "system_expansion", "mass", "energy",
                      "stoichiometric", "economic", "unstated")

TIER_A = "A"   # named LCA/EPD for this material + route + region
TIER_B = "B"   # material-class average, route unknown
TIER_C = "C"   # EEIO / spend-based screening proxy

# Tier B and Tier C landing keys, matching data/product_carbon_catalogue.csv.
PCF_CLASS_FALLBACK = {
    "chem": "pcf.class.chemicals_average",
    "metal": "pcf.class.metals_average",
    "polymer": "pcf.class.polymers_average",
    "constr": "pcf.class.construction_average",
    "auto": "pcf.class.automobile_average",
    "daily": "pcf.class.daily_products_average",
}
PCF_EEIO_FALLBACK = "pcf.proxy.eeio_spend"


class Flag(str, Enum):
    EXACT = "exact"
    YEAR_MISMATCH = "factor_year_mismatch"
    REGIONAL_PROXY = "regional_proxy"
    GLOBAL_PROXY = "global_proxy"
    ROUTE_UNKNOWN = "route_unknown"      # fell back to a class average (Tier B)
    EEIO_PROXY = "eeio_proxy"            # fell back to spend-based EEIO (Tier C)


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
    # Product carbon fields. Optional on a fuel/energy factor, MANDATORY on a
    # pcf.* row - enforced below.
    production_route: Optional[str] = None
    system_boundary: Optional[str] = None
    allocation_method: Optional[str] = None   # as used BY THE SOURCE, not by us

    @property
    def is_product_factor(self) -> bool:
        return self.activity_key.startswith(PCF_PREFIX)

    @property
    def tier(self) -> Optional[str]:
        """Data quality tier, derived from the key. None for non-product rows."""
        if not self.is_product_factor:
            return None
        if self.activity_key.startswith("pcf.proxy."):
            return TIER_C
        if self.activity_key.startswith("pcf.class."):
            return TIER_B
        return TIER_A

    def __post_init__(self):
        object.__setattr__(self, "value", D(self.value))
        if self.system_boundary is not None and self.system_boundary not in SYSTEM_BOUNDARIES:
            raise ValueError(
                f"system_boundary must be one of {SYSTEM_BOUNDARIES}, got "
                f"{self.system_boundary!r}.")
        if self.allocation_method is not None and self.allocation_method not in ALLOCATION_METHODS:
            raise ValueError(
                f"allocation_method must be one of {ALLOCATION_METHODS}, got "
                f"{self.allocation_method!r}. Use 'unstated' when the source "
                f"does not declare one - never assume 'mass'.")
        if self.is_product_factor:
            if not self.production_route:
                raise ValueError(
                    f"Product factor {self.activity_key} has no production_route. "
                    f"A material name is not a key: the same name covers routes "
                    f"whose footprints differ several-fold.")
            if not self.system_boundary:
                raise ValueError(
                    f"Product factor {self.activity_key} has no system_boundary. "
                    f"cradle-to-gate and cradle-to-grave are different "
                    f"measurements and must not be conflated.")
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
                gas: str, *, production_route: Optional[str] = None,
                system_boundary: Optional[str] = None) -> FactorResolution: ...


class InMemoryFactorRegistry:
    """Reference implementation. Ships EMPTY - values come from ingestion."""

    def __init__(self, factors: Iterable[EmissionFactor] = ()):
        self._rows: list[EmissionFactor] = [f for f in factors]

    def add(self, factor: EmissionFactor) -> None:
        self._rows.append(factor)

    def __len__(self) -> int:
        return len(self._rows)

    def _candidates(self, key, region, gas, production_route=None,
                    system_boundary=None):
        rows = [f for f in self._rows
                if f.activity_key == key and f.region == region
                and f.gas == gas and f.superseded_by is None]
        if production_route is not None:
            rows = [f for f in rows if f.production_route == production_route]
        if system_boundary is not None:
            rows = [f for f in rows if f.system_boundary == system_boundary]
        elif rows:
            # Boundary not pinned by the caller. If the surviving rows straddle
            # more than one boundary, picking one would be a guess.
            boundaries = {f.system_boundary for f in rows if f.system_boundary}
            if len(boundaries) > 1:
                raise AmbiguousBoundaryError(
                    f"{key!r} in {region!r} matched rows across boundaries "
                    f"{sorted(boundaries)}. These are different measurements "
                    f"and cannot be chosen between here - pass system_boundary.")
        return rows

    def resolve(self, activity_key: str, region: str, reporting_year: int,
                gas: str, *, production_route: Optional[str] = None,
                system_boundary: Optional[str] = None) -> FactorResolution:
        """Fallback ladder. The final step RAISES - it never returns zero.

        Fuel and energy factors walk the original five steps. Product (pcf.*)
        factors additionally require a production route, and gain two further
        rungs below the regional proxy: a material-class average (Tier B) and
        a spend-based EEIO proxy (Tier C). Every rung sets its flag so the UI
        can never render a Tier C screening estimate as a Tier A measurement.
        """
        is_product = activity_key.startswith(PCF_PREFIX)
        if is_product and not production_route and not self._is_fallback_key(activity_key):
            raise ProductRouteRequiredError(
                f"Product factor {activity_key!r} requested without a "
                f"production_route. The same material name spans routes whose "
                f"footprints differ several-fold; resolving without one would "
                f"return whichever row happened to be first.")

        # 1 exact
        rows = self._candidates(activity_key, region, gas, production_route,
                                system_boundary)
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
            rows = self._candidates(activity_key, parent, gas, production_route,
                                    system_boundary)
            if rows:
                best = sorted(rows, key=lambda f: abs(f.reference_year - reporting_year))[0]
                flags = [Flag.GLOBAL_PROXY if parent == "GLOBAL" else Flag.REGIONAL_PROXY]
                if best.reference_year != reporting_year:
                    flags.append(Flag.YEAR_MISMATCH)
                return FactorResolution(best, tuple(flags))
            parent = REGION_PARENTS.get(parent)

        # 4 and 5 - product-only rungs. A class average has no route, and an
        # EEIO proxy has neither route nor material specificity. Both are
        # legitimate answers ONLY because they arrive flagged.
        if is_product and not self._is_fallback_key(activity_key):
            downgraded = self._resolve_product_fallback(
                activity_key, region, reporting_year, gas, system_boundary)
            if downgraded is not None:
                return downgraded

        # 6 no match -> LOUD
        raise FactorNotFoundError(
            f"No emission factor for activity_key={activity_key!r} "
            f"region={region!r} year={reporting_year} gas={gas!r}"
            + (f" route={production_route!r}" if production_route else "") + ". "
            f"A missing factor is NOT zero. Surface this row to the user as "
            f"'Factor unavailable', exclude it from totals, and list it in the "
            f"report's exclusions table."
        )

    @staticmethod
    def _is_fallback_key(activity_key: str) -> bool:
        """Class-average and EEIO keys are themselves route-less by design."""
        return (activity_key.startswith("pcf.class.")
                or activity_key.startswith("pcf.proxy."))

    @staticmethod
    def _family_of(activity_key: str) -> Optional[str]:
        parts = activity_key.split(".")
        return parts[1] if len(parts) > 2 else None

    def _resolve_product_fallback(self, activity_key, region, reporting_year,
                                  gas, system_boundary) -> Optional[FactorResolution]:
        """Tier B then Tier C. Returns None if neither is available."""
        ladder = []
        family = self._family_of(activity_key)
        class_key = PCF_CLASS_FALLBACK.get(family) if family else None
        if class_key:
            ladder.append((class_key, Flag.ROUTE_UNKNOWN))
        ladder.append((PCF_EEIO_FALLBACK, Flag.EEIO_PROXY))

        for fallback_key, tier_flag in ladder:
            for candidate_region in self._region_chain(region):
                rows = self._candidates(fallback_key, candidate_region, gas,
                                        None, system_boundary)
                if not rows:
                    continue
                best = sorted(
                    rows, key=lambda f: abs(f.reference_year - reporting_year))[0]
                flags = [tier_flag]
                if candidate_region != region:
                    flags.append(Flag.GLOBAL_PROXY if candidate_region == "GLOBAL"
                                 else Flag.REGIONAL_PROXY)
                if best.reference_year != reporting_year:
                    flags.append(Flag.YEAR_MISMATCH)
                return FactorResolution(best, tuple(flags))
        return None

    @staticmethod
    def _region_chain(region: str) -> list[str]:
        chain, seen, cur = [region], {region}, REGION_PARENTS.get(region)
        while cur and cur not in seen:
            chain.append(cur)
            seen.add(cur)
            cur = REGION_PARENTS.get(cur)
        return chain


def assert_comparable(factors: Iterable[EmissionFactor]) -> None:
    """Guard before ranking product factors against each other.

    Two things make a comparison meaningless regardless of how correct each
    number is on its own:

    - differing system boundary. A cradle-to-gate BEV ranked against a
      cradle-to-grave ICE car misleads every reader, because the use phase is
      where an ICE vehicle spends its carbon.
    - differing allocation method. A cracker's output slate split by mass and
      the same plant split by economic value give materially different answers
      for the same physical process.

    Call this wherever a route comparison or a "lowest first" ordering is
    built. Silence here becomes a chart that is wrong in a way no unit test
    on the individual numbers would catch.
    """
    rows = [f for f in factors]
    if len(rows) < 2:
        return

    boundaries = {f.system_boundary for f in rows if f.system_boundary}
    if len(boundaries) > 1:
        raise IncomparableFactorsError(
            f"Refusing to compare factors across system boundaries "
            f"{sorted(boundaries)}. These measure different things. Separate "
            f"them in the UI and say why.")

    methods = {f.allocation_method for f in rows if f.allocation_method}
    if len(methods) > 1:
        raise IncomparableFactorsError(
            f"Refusing to compare factors across allocation methods "
            f"{sorted(methods)}. The co-product split drives the result, so "
            f"these are not like for like. Flag the difference to the user.")

    tiers = {f.tier for f in rows if f.tier}
    if len(tiers) > 1:
        raise IncomparableFactorsError(
            f"Refusing to compare factors across data tiers {sorted(tiers)}. "
            f"A Tier C screening proxy ranked beside a Tier A measurement "
            f"reads as though both were measured.")


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
