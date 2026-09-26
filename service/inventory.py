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
CATALOGUE_MAP = REPO_ROOT / "data" / "catalogue_engine_map.csv"

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

    Per-gas rows are preferred, because they can be expressed under either GWP
    set. Where a publisher gives only a CO2e composite - waste, materials, hotel
    stays - that composite is loaded instead and keeps the publisher's own
    basis, which the report states rather than pretending otherwise.
    """
    registry = InMemoryFactorRegistry()
    activities: dict[str, dict] = {}

    desnz = FACTOR_DIR / "desnz_2025.csv"
    if desnz.exists():
        # Work out which activities publish a gas split. Where one exists it is
        # used, because it can be expressed under either GWP set. Where the
        # publisher gives only a CO2e composite - waste, materials, hotel stays -
        # that composite is loaded instead and carries the publisher's own basis,
        # which the report has to state.
        rows = list(csv.DictReader(desnz.open(encoding="utf-8")))
        has_gas_split = {
            _desnz_activity_key(row["factor_id"])
            for row in rows if IMPORT_GASES.get(row["gas"]) and row["gas_mass_kg_per_unit"]
        }

        for row in rows:
            gas = IMPORT_GASES.get(row["gas"])
            key_for_row = _desnz_activity_key(row["factor_id"])
            composite_only = row["gas"] == "CO2e" and key_for_row not in has_gas_split

            if gas is None and not composite_only:
                continue
            if composite_only:
                gas = "CO2e"
                mass = _decimal(row["value_kgco2e_per_unit"])
            else:
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
                numerator_unit="kgCO2e" if gas == "CO2e" else f"kg{gas}",
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

    india = FACTOR_DIR / "india_transport.csv"
    if india.exists():
        for row in csv.DictReader(india.open(encoding="utf-8")):
            value = _decimal(row["gas_mass_kg_per_unit"])
            if value is None:
                continue
            key = row["factor_id"]
            registry.add(EmissionFactor(
                version_id=key, activity_key=key, region=row["geography"],
                reference_year=int(row["publication_year"] or 0), gas="CO2",
                value=value, numerator_unit="kgCO2", denominator_unit=row["unit"],
                ef_basis=PHYSICAL_BASIS, source_name=row["source"],
                source_table_ref=row["source_version"],
                source_url="https://indiaghgp.org/transport-emission-factors",
                factor_set_id="indiaghgp-road",
            ))
            activities[key] = {
                "name": row["name"], "scope": row["scope"],
                "category_path": row["category_path"], "unit": row["unit"],
                "region": row["geography"], "source": row["source"],
                "year": int(row["publication_year"] or 0), "gases": {"CO2"},
            }

    # IPCC 2006 Volume 2 defaults, per tonne of fuel. These cover what DESNZ
    # does not: anthracite, lignite, sub-bituminous coal, charcoal, bagasse and
    # the other solid biomass an Indian plant burns, waste as a fuel, and the
    # works gases of an integrated steel mill. Gas by gas, so either GWP set
    # applies; biomass CO2 arrives as a separate memo activity and never joins
    # a scope total.
    ipcc_energy = FACTOR_DIR / "ipcc_energy.csv"
    if ipcc_energy.exists():
        for row in csv.DictReader(ipcc_energy.open(encoding="utf-8")):
            value = _decimal(row["gas_mass_kg_per_unit"])
            if value is None:
                continue
            key = row["factor_id"].rsplit(".", 1)[0] if row["scope"] != "memo"                 else row["factor_id"]
            registry.add(EmissionFactor(
                version_id=row["factor_id"], activity_key=key, region=row["geography"],
                reference_year=int(row["publication_year"] or 0), gas=row["gas"],
                value=value, numerator_unit=f"kg{row['gas']}",
                denominator_unit=row["unit"],
                ef_basis=PHYSICAL_BASIS, source_name=row["source"],
                source_table_ref=row["source_version"],
                source_url="https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html",
                factor_set_id="ipcc-2006-energy",
            ))
            entry = activities.setdefault(key, {
                "name": row["name"].rsplit(" — ", 1)[0], "scope": row["scope"],
                "category_path": row["category_path"], "unit": row["unit"],
                "region": row["geography"], "source": row["source"],
                "year": int(row["publication_year"] or 0), "gases": set(),
            })
            entry["gases"].add(row["gas"])

    epa = FACTOR_DIR / "epa_supply_chain.csv"
    if epa.exists():
        for row in csv.DictReader(epa.open(encoding="utf-8")):
            value = _decimal(row["value_kgco2e_per_unit"])
            if value is None:
                continue
            key = row["factor_id"]
            registry.add(EmissionFactor(
                version_id=key,
                activity_key=key,
                region=row["geography"],
                reference_year=int(row["publication_year"] or 0),
                gas="CO2e",
                value=value,
                numerator_unit="kgCO2e",
                denominator_unit=row["unit"],
                ef_basis=PHYSICAL_BASIS,
                source_name=row["source"],
                source_table_ref=row["source_version"],
                source_url="https://catalog.data.gov/dataset/supply-chain-greenhouse-gas-emission-factors-v1-3-by-naics-6",
                factor_set_id="epa-useeio-v1.3",
            ))
            activities[key] = {
                "name": row["name"], "scope": row["scope"],
                "category_path": row["category_path"], "unit": row["unit"],
                "region": row["geography"], "source": row["source"],
                "year": int(row["publication_year"] or 0), "gases": {"CO2e"},
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
        # CO2e last: it is the publisher's composite, used only where no gas
        # split is published. Where a split exists the three gases resolve and
        # the composite is absent, so there is no double counting.
        gases=("CO2", "CH4", "N2O", "CO2e"),
        scope2_headline_view=scope2_view,
    )


@dataclass(frozen=True)
class CatalogueMapping:
    """Which published factor calculates one catalogue source, in one unit."""
    catalogue_key: str
    catalogue_name: str
    unit: str
    activity_key: str
    engine_name: str
    region: str
    source: str


@functools.lru_cache(maxsize=1)
def load_catalogue_map() -> tuple[CatalogueMapping, ...]:
    """The join between what a user may pick and what the registry can resolve.

    Written by `scripts/map_catalogue_to_engine.py`, which transcribes it rather
    than guessing: a source with no row here has no published factor in any
    ingested set, and stays uncalculated by design.

    A row whose activity key is not in the registry is dropped, so the browser
    is never offered a mapping the engine would then refuse.
    """
    if not CATALOGUE_MAP.exists():
        return ()
    registry, _ = load_registry()
    known = registry.activity_keys()
    mappings = []
    with CATALOGUE_MAP.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            if row["engine_activity_key"] not in known:
                continue
            mappings.append(CatalogueMapping(
                catalogue_key=row["catalogue_key"],
                catalogue_name=row["catalogue_name"],
                unit=row["unit"],
                activity_key=row["engine_activity_key"],
                engine_name=row["engine_name"],
                region=row["engine_region"],
                source=row["engine_source"],
            ))
    return tuple(mappings)
