"""Landfill CH4, IPCC 2006 Volume 5 Chapter 3, Tier 1 First Order Decay.

A landfill does not emit in proportion to what was buried this year. Waste
buried a decade ago is still decaying, and waste buried this year emits nothing
at all until January. That is why there is no emission factor per tonne of
waste landfilled anywhere in this library: a factor per tonne would attribute a
site's whole history to one year's tonnage.

The model carries a running stock of decomposable carbon:

  Eq 3.2  DDOCm deposited  = W x DOC x DOCf x MCF
  Eq 3.4  DDOCm accumulated(T) = deposited(T) + accumulated(T-1) x e^-k
  Eq 3.5  DDOCm decomposed(T)  = accumulated(T-1) x (1 - e^-k)
  Eq 3.6  CH4 generated(T)     = decomposed(T) x F x 16/12
  Eq 3.1  CH4 emitted(T)       = (generated(T) - recovered(T)) x (1 - OX)

Recovered methane is subtracted BEFORE oxidation, as Section 3.2.3 requires:
only gas that was not captured can be oxidised in the cover.

No CO2 is returned. IPCC reports none from a disposal site: the carbon that
degrades is biogenic, and the fossil carbon in the waste does not degrade.

Defaults are read from `data/ipcc/solid_waste.json`, which cites the table each
one came from.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional, Sequence

from ..quantities import D, ZERO

PARAMETERS_PATH = (Path(__file__).resolve().parent.parent.parent
                   / "data" / "ipcc" / "solid_waste.json")

# Stated under Equations 3.3 and 3.6.
C_TO_CH4 = D(16) / D(12)


@dataclass(frozen=True)
class SolidWasteParameters:
    source_name: str
    source_url: str
    read_from: str
    values: Mapping[str, object]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "SolidWasteParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["source_name"], data["source_url"], data["read_from"], data)

    @property
    def doc_f(self) -> Decimal:
        return D(str(self.values["doc_f"]["value"]))

    @property
    def methane_fraction(self) -> Decimal:
        return D(str(self.values["f"]["value"]))

    def mcf(self, site_type: str) -> Decimal:
        table = self.values["mcf"]["values"]
        try:
            return D(str(table[site_type]))
        except KeyError:
            raise KeyError(
                f"No Table 3.1 methane correction factor for site type {site_type!r}. "
                f"Site types: {', '.join(table)}. Use 'uncategorised' only where the "
                f"site genuinely cannot be classified."
            ) from None

    def oxidation_factor(self, covered_with_oxidising_material: bool = False) -> Decimal:
        table = self.values["oxidation_factor"]["values"]
        key = "managed_covered_with_oxidising_material" if covered_with_oxidising_material else "default"
        return D(str(table[key]))

    def doc(self, component: str) -> Decimal:
        """Table 2.4, as a fraction of wet waste rather than a percentage."""
        table = self.values["doc"]["msw_components"]
        try:
            return D(str(table[component]["default"])) / D(100)
        except KeyError:
            raise KeyError(
                f"No Table 2.4 DOC content for MSW component {component!r}. Components: "
                f"{', '.join(table)}. Industrial streams take doc() from "
                f"industrial_doc() instead."
            ) from None

    def industrial_doc(self, industry: str) -> Decimal:
        table = self.values["doc"]["industrial_waste"]
        try:
            return D(str(table[industry])) / D(100)
        except KeyError:
            raise KeyError(
                f"No Table 2.5 DOC content for industry {industry!r}. Industries: "
                f"{', '.join(table)}."
            ) from None

    def k(self, component: str, climate_zone: str) -> Decimal:
        groups = self.values["k"]["group_for_component"]
        not_published = self.values["k"]["group_not_published"]
        if component in not_published:
            raise KeyError(f"{not_published[component]} (component {component!r})")
        try:
            group = groups[component]
        except KeyError:
            raise KeyError(
                f"No Table 3.3 decay group for {component!r}. Components with one: "
                f"{', '.join(groups)}. Pass k explicitly for anything else."
            ) from None
        try:
            return D(str(self.values["k"]["values"][group][climate_zone]["value"]))
        except KeyError:
            raise KeyError(
                f"No Table 3.3 climate zone {climate_zone!r}. Zones: "
                f"{', '.join(self.values['k']['climate_zones'])}."
            ) from None

    def composition(self, region: str) -> Mapping[str, Optional[Decimal]]:
        table = self.values["msw_composition"]["regions"]
        try:
            shares = table[region]
        except KeyError:
            raise KeyError(
                f"No Table 2.3 default composition for region {region!r}. Regions: "
                f"{', '.join(table)}."
            ) from None
        return {component: (None if value is None else D(str(value)) / D(100))
                for component, value in shares.items()}


@dataclass(frozen=True)
class WasteStream:
    """One waste component going to one kind of site, year by year.

    `tonnes_by_year` is the history of what was buried, not just this year:
    with a single year the model has nothing to decay and returns nothing.
    """
    component: str
    site_type: str
    tonnes_by_year: Mapping[int, Decimal | str | float]
    doc: Decimal | str | float | None = None
    doc_f: Decimal | str | float | None = None
    k: Decimal | str | float | None = None
    half_life_years: Decimal | str | float | None = None
    covered_with_oxidising_material: bool = False
    industrial: bool = False


@dataclass(frozen=True)
class SolidWasteResult:
    ch4_emitted_kg: Decimal
    ch4_generated_kg: Decimal
    ch4_recovered_kg: Decimal
    inventory_year: int
    by_component: Mapping[str, Decimal] = field(default_factory=dict)
    remaining_carbon_tonnes: Decimal = ZERO
    parameters_applied: Mapping[str, Mapping[str, Decimal]] = field(default_factory=dict)


def solid_waste_ch4(
    streams: Sequence[WasteStream],
    *,
    inventory_year: int,
    climate_zone: str,
    recovered_ch4_kg: Decimal | str | float = 0,
    parameters: Optional[SolidWasteParameters] = None,
) -> SolidWasteResult:
    """Methane emitted from a disposal site in one year, in kilograms of CH4.

    Tonnages are in tonnes and the result is in kilograms, because that is how
    the rest of this library reports gas masses.

    `recovered_ch4_kg` is the gas captured and flared or used in the inventory
    year, across the whole site. It is subtracted from what the site generated
    before the cover oxidation is applied; a site that recovers more than it
    generates is a sign the two figures are not for the same site, so it
    raises rather than reporting a negative.
    """
    p = parameters or SolidWasteParameters.load()

    generated_total = ZERO
    remaining_total = ZERO
    by_component: dict[str, Decimal] = {}
    applied: dict[str, dict[str, Decimal]] = {}
    oxidation_weighted = ZERO

    for stream in streams:
        years = {int(year): D(tonnes) for year, tonnes in stream.tonnes_by_year.items()}
        if not years:
            continue
        if any(tonnes < ZERO for tonnes in years.values()):
            raise ValueError(
                f"Negative tonnage for {stream.component!r}: waste cannot be unburied.")
        if max(years) > inventory_year:
            raise ValueError(
                f"{stream.component!r} has waste deposited after the inventory year "
                f"{inventory_year}. A future year cannot contribute to this year's "
                f"emissions.")

        if stream.k is not None:
            k = D(stream.k)
        elif stream.half_life_years is not None:
            half_life = D(stream.half_life_years)
            if half_life <= ZERO:
                raise ValueError(f"Half-life must be positive, got {half_life}.")
            k = D(2).ln() / half_life
        else:
            k = p.k(stream.component, climate_zone)
        if k <= ZERO:
            raise ValueError(
                f"The decay rate for {stream.component!r} is {k}; with no decay the "
                f"site generates no methane at all, which is not what Table 3.3 says.")

        if stream.doc is not None:
            doc = D(stream.doc)
        elif stream.industrial:
            doc = p.industrial_doc(stream.component)
        else:
            doc = p.doc(stream.component)

        doc_f = D(stream.doc_f) if stream.doc_f is not None else p.doc_f
        mcf = p.mcf(stream.site_type)
        decay = (-k).exp()

        accumulated = ZERO
        decomposed_this_year = ZERO
        for year in range(min(years), inventory_year + 1):
            # Eq 3.5 uses last year's stock: this year's burial does not decay.
            decomposed = accumulated * (D(1) - decay)
            # Eq 3.2 and 3.4.
            deposited = years.get(year, ZERO) * doc * doc_f * mcf
            accumulated = deposited + accumulated * decay
            decomposed_this_year = decomposed

        # Eq 3.6.
        generated_tonnes = decomposed_this_year * p.methane_fraction * C_TO_CH4
        generated_kg = generated_tonnes * D(1000)

        generated_total += generated_kg
        remaining_total += accumulated
        by_component[stream.component] = by_component.get(stream.component, ZERO) + generated_kg
        oxidation_weighted += generated_kg * p.oxidation_factor(
            stream.covered_with_oxidising_material)
        applied[stream.component] = {"k": k, "doc": doc, "doc_f": doc_f, "mcf": mcf}

    recovered = D(recovered_ch4_kg)
    if recovered > generated_total:
        raise ValueError(
            f"More methane recovered ({recovered} kg) than the site generated "
            f"({generated_total} kg). Check the recovery figure and the deposition "
            f"history are for the same site and the same year.")

    # Eq 3.1. Where streams sit under different covers, the oxidation applied is
    # the average weighted by how much each stream generated.
    oxidation = (oxidation_weighted / generated_total) if generated_total > ZERO else ZERO
    emitted = (generated_total - recovered) * (D(1) - oxidation)

    return SolidWasteResult(
        ch4_emitted_kg=emitted,
        ch4_generated_kg=generated_total,
        ch4_recovered_kg=recovered,
        inventory_year=inventory_year,
        by_component=by_component,
        remaining_carbon_tonnes=remaining_total,
        parameters_applied=applied,
    )


def streams_from_composition(
    tonnes_by_year: Mapping[int, Decimal | str | float],
    *,
    region: str,
    site_type: str,
    parameters: Optional[SolidWasteParameters] = None,
) -> list[WasteStream]:
    """Split a bulk MSW history into components using Table 2.3's regional defaults.

    Only for a site with no composition of its own. The published rows are
    incomplete - most add to well under 100 percent - so this returns streams
    for the components the table actually gives and leaves the rest out rather
    than scaling the shares up to 100, which would invent waste nobody weighed.
    Components with no published decay rate (nappies, rubber and leather) are
    left out too; a site that has them should pass its own k.
    """
    p = parameters or SolidWasteParameters.load()
    shares = p.composition(region)
    groups = p.values["k"]["group_for_component"]

    streams: list[WasteStream] = []
    for component, share in shares.items():
        if share is None or share == ZERO or component not in groups:
            continue
        streams.append(WasteStream(
            component=component,
            site_type=site_type,
            tonnes_by_year={int(year): D(tonnes) * share
                            for year, tonnes in tonnes_by_year.items()},
        ))
    return streams
