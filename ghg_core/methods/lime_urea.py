"""CO2 from liming and from urea application, IPCC 2006 Volume 4 Chapter 11.

Two small Tier 1 methods that are easy to leave out of an inventory and awkward
to defend once they are:

  Equation 11.12  CO2-C = (M_limestone x EF_limestone) + (M_dolomite x EF_dolomite)
  Equation 11.13  CO2-C = M_urea x EF_urea

Both equations give carbon, and both sections then say to multiply by 44/12 to
express it as CO2, so that is done here — a caller never has to remember it.

Urea is counted twice on purpose, as two different gases: the carbon leaves as
CO2 here, and the nitrogen goes into Equation 11.1 in `managed_soils`, where it
produces N2O. Reporting only one of the two understates the inventory.

The factors are read from `data/ipcc/lime_and_urea.json`, which cites the page
each came from. They are tonnes of C per tonne of product, which is the same
number as kilograms of C per kilogram of product — the ratio is dimensionless —
so the result comes back in whatever mass unit went in, and the caller is told
which in `mass_unit`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional

from ..quantities import D, ZERO

PARAMETERS_PATH = (Path(__file__).resolve().parent.parent.parent
                   / "data" / "ipcc" / "lime_and_urea.json")

# Stated in both sections: multiply CO2-C by 44/12 to convert it into CO2.
C_TO_CO2 = D(44) / D(12)


@dataclass(frozen=True)
class CarbonateParameters:
    """IPCC Tier 1 carbon contents, with the source they were read from."""
    source_name: str
    source_url: str
    read_from: str
    values: Mapping[str, Decimal]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "CarbonateParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        values = {name: D(str(item["value"]))
                  for group in ("lime", "urea")
                  for name, item in data[group].items()}
        return cls(data["source_name"], data["source_url"], data["read_from"], values)

    def get(self, name: str) -> Decimal:
        try:
            return self.values[name]
        except KeyError:
            raise KeyError(
                f"No IPCC carbon content published for {name!r}. Published materials: "
                f"{', '.join(sorted(self.values))}. Ingest another from {self.source_name} "
                f"- do not estimate one."
            ) from None


@dataclass(frozen=True)
class CarbonateResult:
    co2: Decimal
    mass_unit: str
    components: Mapping[str, Decimal] = field(default_factory=dict)


def liming_co2(
    limestone: Decimal | str | float = 0,
    dolomite: Decimal | str | float = 0,
    *,
    mass_unit: str = "tonne",
    parameters: Optional[CarbonateParameters] = None,
) -> CarbonateResult:
    """Equation 11.12: CO2 from agricultural liming.

    `limestone` and `dolomite` are masses of the material applied in a year.
    Limestone and dolomite carry different carbon, so a site that applies both
    has to say how much of each; a single "lime" figure cannot be split here.
    """
    p = parameters or CarbonateParameters.load()

    limestone_c = D(limestone) * p.get("limestone")
    dolomite_c = D(dolomite) * p.get("dolomite")
    carbon = limestone_c + dolomite_c

    return CarbonateResult(
        co2=carbon * C_TO_CO2,
        mass_unit=mass_unit,
        components={
            "limestone_c": limestone_c,
            "dolomite_c": dolomite_c,
            "total_co2_c": carbon,
            "limestone_ef": p.get("limestone"),
            "dolomite_ef": p.get("dolomite"),
        },
    )


def urea_co2(
    urea: Decimal | str | float,
    *,
    mass_unit: str = "tonne",
    urea_fraction_of_solution: Decimal | str | float = 1,
    parameters: Optional[CarbonateParameters] = None,
) -> CarbonateResult:
    """Equation 11.13: CO2 from applying urea to soils.

    Where urea arrives as part of a fertiliser solution, pass the mass of the
    solution and its urea fraction. The chapter's guidance is that an unknown
    fraction should be treated as 1 rather than assumed away, so that is the
    default.
    """
    p = parameters or CarbonateParameters.load()

    fraction = D(urea_fraction_of_solution)
    if not (ZERO < fraction <= D(1)):
        raise ValueError(
            f"Urea fraction must be between 0 and 1, got {fraction}. If the fraction "
            f"is unknown, leave it at 1: Section 11.4.1 says treating the whole "
            f"solution as urea is better than under-estimating.")

    urea_mass = D(urea) * fraction
    carbon = urea_mass * p.get("urea")

    return CarbonateResult(
        co2=carbon * C_TO_CO2,
        mass_unit=mass_unit,
        components={
            "urea_mass": urea_mass,
            "total_co2_c": carbon,
            "urea_ef": p.get("urea"),
        },
    )


def urea_nitrogen(urea_mass: Decimal | str | float) -> Decimal:
    """Nitrogen in a mass of urea, for the managed-soils N2O calculation.

    CO(NH2)2 is 28/60.06 nitrogen by weight — 46.6% — which is why fertiliser
    urea is sold as 46% N. The same urea therefore appears in two places in an
    inventory: as CO2 here and as an N input to Equation 11.1.
    """
    return D(urea_mass) * (D(28) / D("60.06"))
