"""Repository functions connecting database persistence to ghg_core.

Implements load_registry(session, region, year) and persistence helpers
for ActivityRecord, CalculationRun, FuelProperty, and GwpSet.
"""
from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Any, Optional, Sequence
from sqlalchemy import select, update
from sqlalchemy.orm import Session

import ghg_core.factors
from ghg_core import InMemoryFactorRegistry
from ghg_core.factors import REGION_PARENTS
from ghg_core.gwp import GwpSet
from ghg_core.units import FuelProperty as CoreFuelProperty

from .models import (
    ActivityRecord as ActivityRecordModel,
    CalculationRun as CalculationRunModel,
    EmissionFactor as EmissionFactorModel,
    FuelProperty as FuelPropertyModel,
    GwpSet as GwpSetModel,
    GwpValue as GwpValueModel,
    LineResult as LineResultModel,
)


def _clean_for_json(val: Any) -> Any:
    """Convert Decimal to string and Enum to value at the JSON boundary (Rule 48)."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return str(val)
    if isinstance(val, Enum):
        return val.value
    if isinstance(val, (list, tuple)):
        return [_clean_for_json(x) for x in val]
    if isinstance(val, dict):
        return {str(k): _clean_for_json(v) for k, v in val.items()}
    return val


def load_registry(
    session: Session,
    region: Optional[str] = None,
    year: Optional[int] = None
) -> InMemoryFactorRegistry:
    """Read active factor rows from database and return a ghg_core.InMemoryFactorRegistry.
    
    Hard requirement: Only active (non-superseded) factors are loaded.
    If region is specified, factors for that region, its ancestor hierarchy, and GLOBAL
    are queried. If year is specified, factors up to that reference year are loaded.
    """
    stmt = select(EmissionFactorModel).where(EmissionFactorModel.superseded_by.is_(None))

    if region is not None:
        target_regions = {region, "GLOBAL"}
        curr = region
        while curr in REGION_PARENTS:
            curr = REGION_PARENTS[curr]
            target_regions.add(curr)
        stmt = stmt.where(EmissionFactorModel.region.in_(target_regions))

    if year is not None:
        stmt = stmt.where(EmissionFactorModel.reference_year <= year)

    rows = session.scalars(stmt).all()

    factors: list[ghg_core.factors.EmissionFactor] = []
    for row in rows:
        ef = ghg_core.factors.EmissionFactor(
            version_id=row.version_id,
            activity_key=row.activity_key,
            region=row.region,
            reference_year=row.reference_year,
            gas=row.gas,
            value=row.value,
            numerator_unit=row.numerator_unit,
            denominator_unit=row.denominator_unit,
            ef_basis=row.ef_basis,
            source_name=row.source_name,
            source_table_ref=row.source_table_ref,
            source_url=row.source_url,
            factor_set_id=row.factor_set_id,
            superseded_by=row.superseded_by,
            uncertainty_pct=row.uncertainty_pct,
        )
        factors.append(ef)

    return InMemoryFactorRegistry(factors)


def load_fuel_properties(session: Session) -> dict[str, CoreFuelProperty]:
    """Load fuel properties from the database into a dictionary keyed by fuel_key."""
    stmt = select(FuelPropertyModel)
    rows = session.scalars(stmt).all()
    fuels: dict[str, CoreFuelProperty] = {}
    for r in rows:
        fuels[r.fuel_key] = CoreFuelProperty(
            fuel_key=r.fuel_key,
            source_name=r.source_name,
            source_ref=r.source_ref,
            reference_year=r.reference_year,
            density_kg_per_m3=r.density_kg_per_m3,
            ncv_mj_per_kg=r.ncv_mj_per_kg,
            gas_reference=r.gas_reference,
            basis=r.basis,
        )
    return fuels


def load_gwp_set(session: Session, set_name: str) -> GwpSet:
    """Load a GwpSet and its constituent gas values from the database."""
    stmt = select(GwpSetModel).where(GwpSetModel.name == set_name)
    gwp_row = session.scalars(stmt).one_or_none()
    if gwp_row is None:
        raise ValueError(f"GwpSet '{set_name}' not found in database.")

    val_stmt = select(GwpValueModel).where(GwpValueModel.gwp_set_name == set_name)
    val_rows = session.scalars(val_stmt).all()
    mapping = {v.gas: v.value for v in val_rows}

    return GwpSet.from_mapping(
        name=gwp_row.name,
        horizon_years=gwp_row.horizon_years,
        source_name=gwp_row.source_name,
        source_url=gwp_row.source_url,
        values=mapping,
    )


def save_calculation_run(
    session: Session,
    inventory_id: str,
    run: ghg_core.engine.CalculationRun,
    is_current: bool = True
) -> CalculationRunModel:
    """Persist an append-only CalculationRun and its LineResult records to the database."""
    if is_current:
        # Mark prior runs for this inventory as not current
        session.execute(
            update(CalculationRunModel)
            .where(CalculationRunModel.inventory_id == inventory_id)
            .values(is_current=False)
        )

    calc_run_row = CalculationRunModel(
        id=run.run_id,
        inventory_id=inventory_id,
        engine_version=run.engine_version,
        gwp_set_name=run.gwp_set_name,
        factor_set_pins=_clean_for_json(run.factor_set_pins),
        scope2_headline_view=run.scope2_headline_view,
        totals_scope1=run.totals.scope1,
        totals_scope2_location=run.totals.scope2_location,
        totals_scope2_market=run.totals.scope2_market,
        totals_scope2_headline=run.totals.scope2_headline,
        totals_scope3=run.totals.scope3,
        totals_grand_total=run.totals.grand_total,
        totals_scope3_by_category=_clean_for_json(run.totals.scope3_by_category),
        totals_memo=_clean_for_json(run.totals.memo),
        excluded_records=_clean_for_json(run.excluded_records),
        is_current=is_current,
    )
    session.add(calc_run_row)

    for lr in run.line_results:
        lr_row = LineResultModel(
            run_id=calc_run_row.id,
            record_id=lr.record_id,
            activity_key=lr.activity_key,
            scope=lr.scope,
            ghg_category=lr.ghg_category,
            normalised_value=lr.normalised_value,
            normalised_unit=lr.normalised_unit,
            factor_version_id=lr.factor_version_id,
            factor_value=lr.factor_value,
            factor_source=lr.factor_source,
            factor_reference_year=lr.factor_reference_year,
            gas_breakdown=_clean_for_json(lr.gas_breakdown),
            gwp_applied=_clean_for_json(lr.gwp_applied),
            emissions_kgco2e=lr.emissions_kgco2e,
            biogenic_co2_kg=lr.biogenic_co2_kg,
            memo_bucket=lr.memo_bucket,
            scope2_view=lr.scope2_view,
            resolution_flags=_clean_for_json(lr.resolution_flags),
            data_quality_tier=lr.data_quality_tier,
            status=lr.status,
            message=lr.message,
        )
        session.add(lr_row)

    session.flush()
    return calc_run_row
