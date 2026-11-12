"""CH4 from rice cultivation, IPCC 2006 Volume 4 Chapter 5, Tier 1.

    Equation 5.1  CH4 = EF_i x t x A
    Equation 5.2  EF_i = EF_c x SF_w x SF_p x SF_o
    Equation 5.3  SF_o = (1 + sum(ROA_i x CFOA_i)) ^ 0.59

A flooded paddy makes methane because the soil goes without oxygen. How much
depends on how long and how continuously it stays flooded, whether it was
flooded before planting, and how much fresh organic matter was ploughed in -
which is why this is a method and not a factor per hectare. Every parameter is
read from `data/ipcc/rice_cultivation.json`, which cites the table and page.

The methane is biogenic: the report applies the non-fossil methane GWP.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping, Optional

from ...quantities import D

PARAMETERS_PATH = (Path(__file__).resolve().parents[3]
                   / "data" / "ipcc" / "rice_cultivation.json")


@dataclass(frozen=True)
class RiceParameters:
    source_name: str
    source_url: str
    data: Mapping[str, object]

    @classmethod
    def load(cls, path: Path = PARAMETERS_PATH) -> "RiceParameters":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(data["source_name"], data["source_url"], data)

    def table(self, name: str) -> Mapping[str, object]:
        return self.data[name]["values"]  # type: ignore[index]

    def pick(self, name: str, key: str) -> Decimal:
        values = self.table(name)
        if key not in values:
            raise KeyError(f"No IPCC value for {key!r} in {name}. Published: "
                           f"{', '.join(sorted(values))}.")
        return D(str(values[key]))


@dataclass(frozen=True)
class RiceResult:
    ch4_kg: Decimal
    daily_factor: Decimal
    components: Mapping[str, Decimal] = field(default_factory=dict)


def rice_ch4(
    harvested_area_ha: Decimal | str | float,
    cultivation_days: Decimal | str | float,
    *,
    water_regime: str = "irrigated_continuously_flooded",
    pre_season: str = "non_flooded_under_180_days",
    amendments_t_per_ha: Optional[Mapping[str, Decimal | str | float]] = None,
    parameters: Optional[RiceParameters] = None,
) -> RiceResult:
    """Kilograms of CH4 from one season on one kind of field (Equations 5.1-5.3).

    Run once per season and per water regime: a field cropped twice a year is
    two seasons, each with its own cultivation period.
    """
    p = parameters or RiceParameters.load()
    area, days = D(harvested_area_ha), D(cultivation_days)
    if area < 0 or days < 0:
        raise ValueError("Area and cultivation period cannot be negative.")
    if days > 365:
        raise ValueError("A cultivation period is one season, at most 365 days.")

    ef_c = D(str(p.data["baseline_ef"]["value"]))  # type: ignore[index]
    sf_w = p.pick("water_regime_during", water_regime)
    sf_p = p.pick("water_regime_before", pre_season)

    block = p.data["organic_amendments"]  # type: ignore[index]
    total = D(0)
    for name, rate in (amendments_t_per_ha or {}).items():
        rate = D(rate)
        if rate < 0:
            raise ValueError(f"The application rate of {name} cannot be negative.")
        total += rate * p.pick("organic_amendments", name)
    exponent = D(str(block["exponent"]))  # type: ignore[index]
    sf_o = D(str(float(D(1) + total) ** float(exponent)))

    ef_i = ef_c * sf_w * sf_p * sf_o
    return RiceResult(
        ch4_kg=ef_i * days * area,
        daily_factor=ef_i,
        components={"EF_c": ef_c, "SF_w": sf_w, "SF_p": sf_p, "SF_o": sf_o,
                    "EF_i_kg_ch4_per_ha_day": ef_i, "cultivation_days": days,
                    "harvested_area_ha": area},
    )
