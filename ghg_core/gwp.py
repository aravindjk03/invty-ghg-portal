"""Global Warming Potential sets.

GWP values are VERSIONED, INGESTED DATA - not constants. They change between
IPCC assessment reports, and fossil vs non-fossil methane carry different
values under AR6. Recalculating under a different set creates a NEW run; it
never overwrites the old one.

Nothing in this module contains a GWP number. Load them from a published
source through `GwpSet.from_mapping` or `load_gwp_set`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Mapping

from .errors import GwpNotFoundError
from .quantities import D

CO2 = "CO2"
CH4_FOSSIL = "CH4_fossil"
CH4_NONFOSSIL = "CH4_nonfossil"
N2O = "N2O"


@dataclass(frozen=True)
class GwpSet:
    """One assessment report's 100-year GWP values."""
    name: str                 # e.g. "AR6"
    horizon_years: int        # 100
    source_name: str
    source_url: str
    values: Mapping[str, Decimal] = field(default_factory=dict)

    def gwp(self, gas: str) -> Decimal:
        if gas == CO2:
            return D(1)
        try:
            v = self.values[gas]
        except KeyError:
            raise GwpNotFoundError(
                f"No GWP for gas {gas!r} in set {self.name!r}. Ingest it from "
                f"{self.source_name} - do not estimate or recall a value."
            ) from None
        if v is None:
            raise GwpNotFoundError(
                f"GWP for {gas!r} in {self.name!r} is a placeholder (null). "
                f"Ingest the published value from {self.source_name}."
            )
        return D(v)

    @classmethod
    def from_mapping(cls, name, horizon_years, source_name, source_url, values):
        return cls(name, horizon_years, source_name, source_url,
                   {k: (None if v is None else D(v)) for k, v in values.items()})


def load_gwp_set(path: str | Path) -> GwpSet:
    """Load a GWP set from an ingested JSON file.

    The file must name its source. A set with no source_url is rejected,
    because an unsourced GWP is indistinguishable from an invented one.
    """
    data = json.loads(Path(path).read_text())
    for req in ("name", "horizon_years", "source_name", "source_url", "values"):
        if req not in data:
            raise ValueError(f"GWP set file is missing required key {req!r}")
    if not data["source_url"]:
        raise ValueError("A GWP set must carry a source_url.")
    return GwpSet.from_mapping(
        data["name"], data["horizon_years"],
        data["source_name"], data["source_url"], data["values"])
