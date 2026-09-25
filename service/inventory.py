"""The organisation inventory, calculated by ghg_core.

One engine for the whole product. The browser no longer does its own
arithmetic: it sends the activity records here, and this module resolves each
one against the ingested factor tables, applies the chosen GWP set gas by gas,
and returns the result with its provenance.

Factors come from `data/factors/*.csv`, written by `scripts/ingest_factors.py`
straight from the publishers' workbooks. GWP sets come from `data/gwp/*.json`,
read from the IPCC tables. Nothing here contains a number of its own.
"""
from __future__ import annotations

import csv
import functools
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, Optional

from ghg_core.engine import ActivityRecord, CalculationRun, calculate
from ghg_core.factors import PHYSICAL_BASIS, EmissionFactor, InMemoryFactorRegistry
from ghg_core.gwp import GwpSet, load_gwp_set
from ghg_core.quantities import D

REPO_ROOT = Path(__file__).resolve().parent.parent
FACTOR_DIR = REPO_ROOT / "data" / "factors"
GWP_DIR = REPO_ROOT / "data" / "gwp"

# The gas label used by the ingested tables -> the engine's gas name.
IMPORT_GASES = {"CO2": "CO2", "CH4": "CH4", "N2O": "N2O"}

GWP_SETS = ("AR5", "AR6")


@dataclass(frozen=True)
class SelectableActivity:
    """One activity a user may record, as offered by the picker."""
    activity_key: str
    name: str
    scope: str
    category_path: str
    unit: str
    region: str
    source: str
    reference_year: int
    gases: tuple[str, ...]


def _decimal(raw: str) -> Optional[Decimal]:
    try:
        return D(raw) if raw not in ("", None) else None
    except (InvalidOperation, ValueError):
        return None


def _desnz_activity_key(factor_id: str) -> str:
    """DESNZ ids end in a gas index: 1_101_1011_8_1 is one gas of activity ..._8."""
    body = factor_id.split("desnz.2025.", 1)[-1]
    parts = body.rsplit("_", 1)
    return f"desnz.2025.{parts[0]}" if len(parts) == 2 else factor_id


@functools.lru_cache(maxsize=1)
def load_registry() -> tuple[InMemoryFactorRegistry, tuple[SelectableActivity, ...]]:
    """Build the factor registry and the list of activities a user can pick.

    Only the per-gas rows are loaded. The publishers' CO2e composites are left
    out on purpose: they carry the publisher's own GWP basis, which would defeat
    the point of letting the customer choose one.
    """
    registry = InMemoryFactorRegistry()
    activities: dict[str, dict] = {}

    desnz = FACTOR_DIR / "desnz_2025.csv"
    if desnz.exists():
        for row in csv.DictReader(desnz.open(encoding="utf-8")):
            gas = IMPORT_GASES.get(row["gas"])
            if gas is None:                       # skips the CO2e composite
                continue
            mass = _decimal(row["gas_mass_kg_per_unit"])
            if mass is None:
                continue

            key = _desnz_activity_key(row["factor_id"])
            registry.add(EmissionFactor(
                version_id=row["factor_id"],
                activity_key=key,
                region=row["geography"],
                reference_year=int(row["publication_year"] or 0),
                gas=gas,
                value=mass,
                numerator_unit=f"kg{gas}",
                denominator_unit=row["unit"],
                ef_basis=PHYSICAL_BASIS,
                source_name=row["source"],
                source_table_ref=row["source_version"],
                source_url="https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
                factor_set_id="desnz-2025",
            ))
            entry = activities.setdefault(key, {
                "name": row["name"], "scope": row["scope"],
                "category_path": row["category_path"], "unit": row["unit"],
                "region": row["geography"], "source": row["source"],
                "year": int(row["publication_year"] or 0), "gases": set(),
            })
            entry["gases"].add(gas)

    cea = FACTOR_DIR / "cea_grid.csv"
    if cea.exists():
        for row in csv.DictReader(cea.open(encoding="utf-8")):
            mass = _decimal(row["gas_mass_kg_per_unit"])
            if mass is None:
                continue
            key = row["factor_id"]
            registry.add(EmissionFactor(
                version_id=key,
                activity_key=key,
                region=row["geography"],
                reference_year=int(row["publication_year"] or 0),
                gas="CO2",
                value=mass,
                numerator_unit="kgCO2",
                denominator_unit=row["unit"],
                ef_basis=PHYSICAL_BASIS,
                source_name=row["source"],
                source_table_ref=row["source_version"],
                source_url="https://cea.nic.in/cdm-co2-baseline-database/?lang=en",
                factor_set_id="cea-v22",
            ))
            activities[key] = {
                "name": row["name"], "scope": row["scope"],
                "category_path": row["category_path"], "unit": row["unit"],
                "region": row["geography"], "source": row["source"],
                "year": int(row["publication_year"] or 0), "gases": {"CO2"},
            }

    selectable = tuple(sorted(
        (SelectableActivity(
            activity_key=key, name=value["name"], scope=value["scope"],
            category_path=value["category_path"], unit=value["unit"],
            region=value["region"], source=value["source"],
            reference_year=value["year"], gases=tuple(sorted(value["gases"])),
        ) for key, value in activities.items()),
        key=lambda item: (item.scope, item.category_path, item.name),
    ))
    return registry, selectable


@functools.lru_cache(maxsize=4)
def load_gwp(name: str) -> GwpSet:
    """AR5 or AR6, read from the ingested IPCC tables."""
    upper = name.upper()
    if upper not in GWP_SETS:
        raise ValueError(f"GWP set must be one of {', '.join(GWP_SETS)}, not {name!r}.")
    return load_gwp_set(GWP_DIR / f"{upper.lower()}.json")


def activities_for(scope: Optional[str] = None, region: Optional[str] = None) -> tuple[SelectableActivity, ...]:
    _, activities = load_registry()
    return tuple(
        activity for activity in activities
        if (scope is None or activity.scope == scope)
        and (region is None or activity.region == region))


def run_inventory(
    records: Iterable[ActivityRecord],
    *,
    gwp_set_name: str,
    reporting_year: int,
    scope2_view: str = "location",
) -> CalculationRun:
    """Calculate an inventory under the chosen GWP set."""
    registry, _ = load_registry()
    return calculate(
        list(records),
        registry,
        load_gwp(gwp_set_name),
        reporting_year=reporting_year,
        scope2_headline_view=scope2_view,
    )
