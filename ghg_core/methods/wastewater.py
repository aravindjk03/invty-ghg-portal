"""Wastewater CH4 and N2O, IPCC 2006 Volume 5 Chapter 6, Tier 1.

Wastewater emissions cannot be read off a factor per cubic metre. Methane
depends on the ORGANIC LOAD (BOD or COD) and on how anaerobic each treatment
step is; nitrous oxide depends on the NITROGEN discharged. A factor per m3 would
assume a strength of effluent nobody measured — which is why the per-m3 values
that were in this library were removed.

Equations implemented:
  6.2  EF_j = Bo x MCF_j
  6.3  TOW = P x BOD x 0.001 x I x 365
  6.7  N2O = N_effluent x EF_effluent x 44/28
  6.8  N_effluent from population and protein

Defaults are read from `data/ipcc/wastewater.json`, which cites the table each
one came from. Results are masses of CH4 and N2O, so the report applies the GWP
set the customer reports on.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional, Sequence

from ..quantities import D, ZERO

PARAMETERS_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "ipcc" / "wastewater.json"

N_TO_N2O = D(44) / D(28)


@dataclass(frozen=True)
class WastewaterParameters:
    source_name: str
    source_url: str
    read_from: str
    bo_per_kg_bod: Decimal
    bo_per_kg_cod: Decimal
    cod_to_bod_factor: Decimal
    mcf: Mapping[str, Decimal]
    ef_effluent: Decimal
    protein_nitrogen_fraction: Decimal
    non_consumed_protein: Mapping[str, Decimal]
    industrial_commercial_protein: Decimal

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "WastewaterParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        methane, nitrous = data["methane"], data["nitrous_oxide"]
        return cls(
            source_name=data["source_name"],
            source_url=data["source_url"],
            read_from=data["read_from"],
            bo_per_kg_bod=D(str(methane["bo_per_kg_bod"]["value"])),
            bo_per_kg_cod=D(str(methane["bo_per_kg_cod"]["value"])),
            cod_to_bod_factor=D(str(methane["cod_to_bod_factor"])),
            mcf={name: D(str(item["value"])) for name, item in methane["mcf"].items()},
            ef_effluent=D(str(nitrous["ef_effluent"]["value"])),
            protein_nitrogen_fraction=D(str(nitrous["protein_nitrogen_fraction"]["value"])),
            # The block also carries the IPCC symbol for the term, which is not
            # a value and must not be coerced into one.
            non_consumed_protein={economy: D(str(nitrous["non_consumed_protein"][economy]))
                                  for economy in ("developed", "developing")},
            industrial_commercial_protein=D(str(nitrous["industrial_commercial_protein"]["value"])),
        )

    def mcf_for(self, system: str) -> Decimal:
        try:
            return self.mcf[system]
        except KeyError:
            raise KeyError(
                f"No IPCC default MCF for treatment system {system!r}. Choose one of: "
                f"{', '.join(sorted(self.mcf))} — or ingest the value from {self.source_name}."
            ) from None


@dataclass(frozen=True)
class TreatmentPathway:
    """One treatment or discharge route, and the share of the load that takes it."""
    system: str
    share_of_load: Decimal          # 0-1
    methane_recovered_kg: Decimal = ZERO


@dataclass(frozen=True)
class WastewaterCH4Result:
    ch4_kg: Decimal
    organic_load_kg_bod: Decimal
    by_pathway: Mapping[str, Decimal] = field(default_factory=dict)


def organic_load_from_population(
    population: Decimal | int,
    bod_per_person_g_day: Decimal | str | float,
    correction_for_industrial: Decimal | str | float = 1,
) -> Decimal:
    """Equation 6.3: total organics in domestic wastewater, kg BOD per year.

    `bod_per_person_g_day` is country-specific and IPCC does not publish one
    value for everywhere, so it is asked for rather than assumed.
    """
    return (D(population) * D(bod_per_person_g_day) * D("0.001")
            * D(correction_for_industrial) * D(365))


def wastewater_ch4(
    organic_load: Decimal | str | float,
    pathways: Sequence[TreatmentPathway],
    *,
    load_basis: str = "BOD",
    sludge_removed_kg: Decimal | str | float = 0,
    parameters: Optional[WastewaterParameters] = None,
) -> WastewaterCH4Result:
    """Methane from wastewater, in kilograms of CH4.

    `organic_load` is kg BOD/year (domestic) or kg COD/year (industrial); say
    which with `load_basis`. Organics removed as sludge never reach the
    treatment step and are subtracted first, as Equation 6.1 requires.
    """
    p = parameters or WastewaterParameters.load()

    basis = load_basis.upper()
    if basis not in ("BOD", "COD"):
        raise ValueError(f"load_basis must be BOD or COD, not {load_basis!r}.")

    load = D(organic_load) - D(sludge_removed_kg)
    if load < ZERO:
        raise ValueError(
            "Sludge removed exceeds the organic load: check the two figures are "
            "on the same basis and the same period.")

    shares = sum(D(pathway.share_of_load) for pathway in pathways)
    if pathways and abs(shares - D(1)) > D("0.001"):
        raise ValueError(
            f"Treatment pathway shares sum to {shares}, not 1. Every part of the "
            f"load has to go somewhere before the total means anything.")

    bo = p.bo_per_kg_bod if basis == "BOD" else p.bo_per_kg_cod
    total = ZERO
    by_pathway: dict[str, Decimal] = {}

    for pathway in pathways:
        emitted = load * D(pathway.share_of_load) * bo * p.mcf_for(pathway.system)
        emitted -= D(pathway.methane_recovered_kg)
        if emitted < ZERO:
            emitted = ZERO          # recovery cannot make a source a sink
        by_pathway[pathway.system] = by_pathway.get(pathway.system, ZERO) + emitted
        total += emitted

    return WastewaterCH4Result(
        ch4_kg=total,
        organic_load_kg_bod=load if basis == "BOD" else load * p.cod_to_bod_factor,
        by_pathway=by_pathway,
    )


def nitrogen_in_effluent(
    population: Decimal | int,
    protein_kg_per_person_year: Decimal | str | float,
    *,
    economy: str = "developing",
    industrial_discharges_to_sewer: bool = True,
    sludge_nitrogen_kg: Decimal | str | float = 0,
    parameters: Optional[WastewaterParameters] = None,
) -> Decimal:
    """Equation 6.8: nitrogen in the discharged effluent, kg N per year."""
    p = parameters or WastewaterParameters.load()
    try:
        non_consumed = p.non_consumed_protein[economy]
    except KeyError:
        raise KeyError(
            f"economy must be 'developed' or 'developing', not {economy!r}.") from None

    industrial = p.industrial_commercial_protein if industrial_discharges_to_sewer else D(1)
    nitrogen = (D(population) * D(protein_kg_per_person_year)
                * p.protein_nitrogen_fraction * non_consumed * industrial)
    return nitrogen - D(sludge_nitrogen_kg)


def wastewater_n2o(
    nitrogen_discharged_kg: Decimal | str | float,
    parameters: Optional[WastewaterParameters] = None,
) -> Decimal:
    """Equation 6.7: N2O from effluent nitrogen, in kilograms of N2O."""
    p = parameters or WastewaterParameters.load()
    return D(nitrogen_discharged_kg) * p.ef_effluent * N_TO_N2O
