"""HTTP contract for the organisation inventory.

The browser sends activity records and the GWP set the customer reports on;
this returns the calculation from ghg_core, gas by gas, with the provenance of
every factor. There is no second engine and no fallback arithmetic: if a factor
or a unit cannot be resolved, the line comes back unavailable with the reason,
and the totals leave it out.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from ghg_core.engine import ActivityRecord, CalculationRun

from .inventory import GWP_SETS, activities_for, load_catalogue_map, run_inventory


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", protected_namespaces=())


# --- request ----------------------------------------------------------------

class InventoryRecord(_Strict):
    record_id: str = Field(min_length=1, max_length=64)
    activity_key: str = Field(min_length=1, max_length=200)
    scope: Literal["1", "2", "3", "memo"]
    ghg_category: str = Field(min_length=1, max_length=16)
    region: str = Field(min_length=2, max_length=8)
    value: Optional[Decimal] = None
    unit: Optional[str] = Field(default=None, max_length=32)
    facility_id: Optional[str] = Field(default=None, max_length=120)
    scope2_view: Optional[Literal["location", "market"]] = None
    period_month: Optional[str] = Field(default=None, max_length=7)
    note: str = Field(default="", max_length=400)


class InventoryRequest(_Strict):
    records: list[InventoryRecord] = Field(default_factory=list, max_length=5000)
    gwp_set: Literal["AR5", "AR6"] = "AR5"
    reporting_year: int = Field(ge=1990, le=2100)
    scope2_view: Literal["location", "market"] = "location"


# --- response ---------------------------------------------------------------

class LineOut(_Strict):
    record_id: str
    activity_key: str
    scope: str
    ghg_category: str
    status: str
    message: str
    emissions_kgco2e: str
    gas_breakdown: dict[str, str]
    gwp_applied: dict[str, str]
    factor_value: Optional[str]
    factor_source: Optional[str]
    factor_reference_year: Optional[int]
    factor_version_id: Optional[str]
    resolution_flags: list[str]
    data_quality_tier: str


class TotalsOut(_Strict):
    scope1: str
    scope2_location: str
    scope2_market: str
    scope2_headline: str
    scope3: str
    scope3_by_category: dict[str, str]
    total_scope12: str
    total_all: str
    memo: dict[str, str]


class InventoryResponse(_Strict):
    run_id: str
    engine_version: str
    gwp_set: str
    gwp_source: str
    scope2_view: str
    reporting_year: int
    lines: list[LineOut]
    totals: TotalsOut
    excluded: list[dict]


class CatalogueMappingOut(_Strict):
    catalogue_key: str
    catalogue_name: str
    unit: str
    activity_key: str
    engine_name: str
    region: str
    source: str


class ActivityOut(_Strict):
    activity_key: str
    name: str
    scope: str
    category_path: str
    unit: str
    region: str
    source: str
    reference_year: int
    gases: list[str]


def to_records(request: InventoryRequest) -> list[ActivityRecord]:
    return [
        ActivityRecord(
            record_id=item.record_id,
            activity_key=item.activity_key,
            scope=item.scope,
            ghg_category=item.ghg_category,
            region=item.region,
            value=item.value,
            unit=item.unit,
            facility_id=item.facility_id,
            scope2_view=item.scope2_view,
            note=item.note,
        )
        for item in request.records
    ]


def to_response(run: CalculationRun, request: InventoryRequest, gwp_source: str) -> InventoryResponse:
    totals = run.totals
    as_text = lambda value: str(value)  # noqa: E731 - Decimal crosses the wire as text

    return InventoryResponse(
        run_id=run.run_id,
        engine_version=run.engine_version,
        gwp_set=run.gwp_set_name,
        gwp_source=gwp_source,
        scope2_view=run.scope2_headline_view,
        reporting_year=request.reporting_year,
        lines=[
            LineOut(
                record_id=line.record_id,
                activity_key=line.activity_key,
                scope=line.scope,
                ghg_category=line.ghg_category,
                status=line.status,
                message=line.message,
                emissions_kgco2e=as_text(line.emissions_kgco2e),
                gas_breakdown={gas: as_text(value) for gas, value in line.gas_breakdown.items()},
                gwp_applied={gas: as_text(value) for gas, value in line.gwp_applied.items()},
                factor_value=None if line.factor_value is None else as_text(line.factor_value),
                factor_source=line.factor_source,
                factor_reference_year=line.factor_reference_year,
                factor_version_id=line.factor_version_id,
                resolution_flags=[str(flag) for flag in line.resolution_flags],
                data_quality_tier=line.data_quality_tier,
            )
            for line in run.line_results
        ],
        totals=TotalsOut(
            scope1=as_text(totals.scope1),
            scope2_location=as_text(totals.scope2_location),
            scope2_market=as_text(totals.scope2_market),
            scope2_headline=as_text(totals.scope2_headline),
            scope3=as_text(totals.scope3),
            scope3_by_category={k: as_text(v) for k, v in totals.scope3_by_category.items()},
            total_scope12=as_text(totals.scope1 + totals.scope2_headline),
            total_all=as_text(totals.scope1 + totals.scope2_headline + totals.scope3),
            memo={k: as_text(v) for k, v in totals.memo.items()},
        ),
        excluded=run.excluded_records,
    )


def calculate_inventory(request: InventoryRequest, gwp_source: str) -> InventoryResponse:
    run = run_inventory(
        to_records(request),
        gwp_set_name=request.gwp_set,
        reporting_year=request.reporting_year,
        scope2_view=request.scope2_view,
    )
    return to_response(run, request, gwp_source)


def list_activities(scope: Optional[str], region: Optional[str], search: Optional[str],
                    limit: int) -> list[ActivityOut]:
    matches = activities_for(scope, region)
    if search:
        needle = search.lower()
        matches = tuple(a for a in matches if needle in a.name.lower()
                        or needle in a.category_path.lower())
    return [
        ActivityOut(
            activity_key=a.activity_key, name=a.name, scope=a.scope,
            category_path=a.category_path, unit=a.unit, region=a.region,
            source=a.source, reference_year=a.reference_year, gases=list(a.gases),
        )
        for a in matches[:limit]
    ]


def catalogue_mappings() -> list[CatalogueMappingOut]:
    """Which published factor calculates each catalogue source, per unit.

    The browser attaches these as a user picks a source, so a row that CAN be
    calculated is, without anyone having to hunt through the factor library. A
    source absent from this list has no published factor and stays honestly
    uncalculated.
    """
    return [
        CatalogueMappingOut(
            catalogue_key=mapping.catalogue_key,
            catalogue_name=mapping.catalogue_name,
            unit=mapping.unit,
            activity_key=mapping.activity_key,
            engine_name=mapping.engine_name,
            region=mapping.region,
            source=mapping.source,
        )
        for mapping in load_catalogue_map()
    ]


__all__ = ["GWP_SETS", "InventoryRequest", "InventoryResponse", "ActivityOut",
           "CatalogueMappingOut", "calculate_inventory", "catalogue_mappings",
           "list_activities"]
