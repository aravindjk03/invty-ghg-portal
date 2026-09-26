"""Enteric fermentation CH4, IPCC 2006 Volume 4 Chapter 10, Tier 1.

Equation 10.19: emissions = EF for the livestock category x head count, where
the factor is kilograms of CH4 per head per year.

Cattle factors differ by region because animal size and milk yield differ; the
other species differ between developed and developing economies. Both tables
are read from `data/ipcc/enteric_fermentation.json`, which cites the page each
came from. Poultry has no Tier 1 factor at all — IPCC records insufficient data
— so asking for one raises rather than returning zero, because zero would quietly
understate an inventory that includes a poultry unit.

The result is a mass of CH4, so the report applies the chosen GWP set to it.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional

from ..quantities import D, ZERO

PARAMETERS_PATH = (Path(__file__).resolve().parent.parent.parent
                   / "data" / "ipcc" / "enteric_fermentation.json")

CATTLE_CATEGORIES = ("dairy", "other")


class FactorNotPublished(KeyError):
    """IPCC publishes no Tier 1 factor for this animal. Not the same as zero."""


@dataclass(frozen=True)
class EntericParameters:
    source_name: str
    source_url: str
    read_from: str
    cattle_by_region: Mapping[str, Mapping[str, Decimal]]
    other_livestock: Mapping[str, Mapping[str, Decimal]]
    not_published: Mapping[str, str]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "EntericParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        cattle = {
            region: {category: D(str(values[category])) for category in CATTLE_CATEGORIES}
            for region, values in data["cattle_by_region"].items()
        }
        other = {
            animal: {economy: D(str(values[economy])) for economy in ("developed", "developing")}
            for animal, values in data["other_livestock"].items()
        }
        return cls(data["source_name"], data["source_url"], data["read_from"],
                   cattle, other, data["not_published"])

    def cattle_factor(self, region: str, category: str) -> Decimal:
        if category not in CATTLE_CATEGORIES:
            raise KeyError(f"Cattle category must be 'dairy' or 'other', not {category!r}.")
        try:
            return self.cattle_by_region[region][category]
        except KeyError:
            raise KeyError(
                f"No Tier 1 cattle factor for region {region!r}. Regions in Table 10.11: "
                f"{', '.join(sorted(self.cattle_by_region))}."
            ) from None

    def livestock_factor(self, animal: str, economy: str = "developing") -> Decimal:
        if animal in self.not_published:
            raise FactorNotPublished(
                f"IPCC publishes no Tier 1 enteric factor for {animal!r}: "
                f"{self.not_published[animal]} Report this source another way rather "
                f"than treating it as zero.")
        try:
            return self.other_livestock[animal][economy]
        except KeyError:
            raise KeyError(
                f"No Tier 1 factor for {animal!r} in a {economy!r} economy. Animals in "
                f"Table 10.10: {', '.join(sorted(self.other_livestock))}."
            ) from None


@dataclass(frozen=True)
class Herd:
    """Head counts present over the year, by animal."""
    dairy_cattle: Decimal = ZERO
    other_cattle: Decimal = ZERO
    other_animals: Mapping[str, Decimal] = field(default_factory=dict)


@dataclass(frozen=True)
class EntericResult:
    ch4_kg: Decimal
    by_animal: Mapping[str, Decimal] = field(default_factory=dict)
    factors_applied: Mapping[str, Decimal] = field(default_factory=dict)


def enteric_ch4(
    herd: Herd,
    *,
    cattle_region: str = "indian_subcontinent",
    economy: str = "developing",
    parameters: Optional[EntericParameters] = None,
) -> EntericResult:
    """Annual enteric methane for a herd, in kilograms of CH4."""
    p = parameters or EntericParameters.load()
    by_animal: dict[str, Decimal] = {}
    factors: dict[str, Decimal] = {}
    total = ZERO

    for label, head, category in (("dairy_cattle", herd.dairy_cattle, "dairy"),
                                  ("other_cattle", herd.other_cattle, "other")):
        count = D(head)
        if count == ZERO:
            continue
        factor = p.cattle_factor(cattle_region, category)
        emitted = count * factor
        by_animal[label] = emitted
        factors[label] = factor
        total += emitted

    for animal, head in herd.other_animals.items():
        count = D(head)
        if count == ZERO:
            continue
        factor = p.livestock_factor(animal, economy)
        emitted = count * factor
        by_animal[animal] = emitted
        factors[animal] = factor
        total += emitted

    return EntericResult(ch4_kg=total, by_animal=by_animal, factors_applied=factors)
