"""Lifecycle screening estimates for a single product.

This is the arithmetic behind the Product Carbon page. Each line is one
lifecycle input - a material, an energy draw during manufacture, electricity
over the product's service life - carrying a quantity and an emission factor
expressed PER UNIT OF THAT QUANTITY, with an explicit low / central / high.

Where those lines come from is not this module's concern. Today most are
proposed by an AI model and arrive flagged ``ai_estimate``; a line whose factor
was resolved from the verified registry arrives flagged ``verified_registry``.
Either way, every total, subtotal and share on the page is computed HERE,
deterministically, in Decimal. The model never produces an aggregate.

Ranges are summed endpoint-to-endpoint (all lows together, all highs together).
That is a transparent, deliberately wide bracket - not a statistical confidence
interval - and it must be labelled as a range wherever it is shown.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Optional

from .quantities import D, ZERO

# Lifecycle stages, per ISO 14067 and the GHG Protocol Product Standard.
RAW_MATERIALS = "raw_materials"
MANUFACTURING = "manufacturing"
DISTRIBUTION = "distribution"
USE = "use"
END_OF_LIFE = "end_of_life"
STAGES = (RAW_MATERIALS, MANUFACTURING, DISTRIBUTION, USE, END_OF_LIFE)

# "Creation" is everything that happens before the product reaches its user.
CREATION_STAGES = (RAW_MATERIALS, MANUFACTURING, DISTRIBUTION)

# The factor on a line is always kgCO2e per ONE of these. Because quantity and
# factor share a denominator by construction, no unit conversion happens here,
# which removes the 1000x kg/t class of error from this path entirely.
QUANTITY_UNITS = ("kg", "t", "kWh", "MJ", "L", "m3", "km", "t.km", "unit")

AI_ESTIMATE = "ai_estimate"
VERIFIED_REGISTRY = "verified_registry"
PROVENANCES = (AI_ESTIMATE, VERIFIED_REGISTRY)


@dataclass(frozen=True)
class Range:
    low: Decimal
    central: Decimal
    high: Decimal

    @staticmethod
    def zero() -> "Range":
        return Range(ZERO, ZERO, ZERO)

    def __add__(self, other: "Range") -> "Range":
        return Range(self.low + other.low, self.central + other.central,
                     self.high + other.high)


@dataclass(frozen=True)
class ScreeningLine:
    line_id: str
    stage: str
    component: str
    quantity: Decimal
    quantity_unit: str
    factor_low: Decimal            # kgCO2e per quantity_unit
    factor_central: Decimal
    factor_high: Decimal
    provenance: str
    factor_basis: str = ""
    reference: str = ""
    factor_version_id: Optional[str] = None
    tier: Optional[str] = None

    def __post_init__(self):
        for name in ("quantity", "factor_low", "factor_central", "factor_high"):
            object.__setattr__(self, name, D(getattr(self, name)))
        if self.stage not in STAGES:
            raise ValueError(f"line {self.line_id}: stage must be one of {STAGES}, "
                             f"got {self.stage!r}")
        if self.quantity_unit not in QUANTITY_UNITS:
            raise ValueError(f"line {self.line_id}: quantity_unit must be one of "
                             f"{QUANTITY_UNITS}, got {self.quantity_unit!r}")
        if self.provenance not in PROVENANCES:
            raise ValueError(f"line {self.line_id}: provenance must be one of "
                             f"{PROVENANCES}, got {self.provenance!r}")
        if self.quantity < 0:
            raise ValueError(f"line {self.line_id}: quantity cannot be negative. "
                             f"Credits, offsets and removals never net against a "
                             f"footprint.")
        if min(self.factor_low, self.factor_central, self.factor_high) < 0:
            raise ValueError(f"line {self.line_id}: emission factors cannot be "
                             f"negative. Credits never net against a footprint.")
        if not (self.factor_low <= self.factor_central <= self.factor_high):
            raise ValueError(f"line {self.line_id}: factor range must satisfy "
                             f"low <= central <= high, got {self.factor_low} / "
                             f"{self.factor_central} / {self.factor_high}.")

    @property
    def emissions(self) -> Range:
        return Range(self.quantity * self.factor_low,
                     self.quantity * self.factor_central,
                     self.quantity * self.factor_high)


@dataclass(frozen=True)
class LineResult:
    line: ScreeningLine
    emissions: Range
    share_of_lifecycle: Optional[Decimal]   # of the central lifecycle total


@dataclass(frozen=True)
class ScreeningResult:
    lines: tuple[LineResult, ...]
    stages: dict[str, Range]
    stage_shares: dict[str, Optional[Decimal]]   # of the central lifecycle total
    creation: Range
    use: Range
    end_of_life: Range
    lifecycle: Range
    verified_share: Optional[Decimal]       # central lifecycle from verified factors
    hotspots: tuple[LineResult, ...]


def _share(part: Decimal, whole: Decimal) -> Optional[Decimal]:
    """Never divides by zero. A zero whole gives None, not Infinity or 0."""
    return None if whole == 0 else part / whole


def screen_product(lines: Iterable[ScreeningLine], hotspot_count: int = 3) -> ScreeningResult:
    rows = list(lines)
    ids = [r.line_id for r in rows]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise ValueError(f"duplicate line_id(s) {dupes}: each lifecycle input "
                         f"must be counted once.")

    stages = {s: Range.zero() for s in STAGES}
    for r in rows:
        stages[r.stage] = stages[r.stage] + r.emissions

    creation = Range.zero()
    for s in CREATION_STAGES:
        creation = creation + stages[s]
    lifecycle = creation + stages[USE] + stages[END_OF_LIFE]

    results = tuple(
        LineResult(line=r, emissions=r.emissions,
                   share_of_lifecycle=_share(r.emissions.central, lifecycle.central))
        for r in rows)

    verified_central = sum((r.emissions.central for r in rows
                            if r.provenance == VERIFIED_REGISTRY), ZERO)

    # Stable ordering: largest central first, then line_id, so ties never
    # reorder between two identical runs.
    ranked = sorted(results, key=lambda lr: (-lr.emissions.central, lr.line.line_id))
    hotspots = tuple(lr for lr in ranked if lr.emissions.central > 0)[:hotspot_count]

    return ScreeningResult(
        lines=results,
        stages=stages,
        stage_shares={k: _share(v.central, lifecycle.central) for k, v in stages.items()},
        creation=creation,
        use=stages[USE],
        end_of_life=stages[END_OF_LIFE],
        lifecycle=lifecycle,
        verified_share=_share(verified_central, lifecycle.central),
        hotspots=hotspots,
    )
