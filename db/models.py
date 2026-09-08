"""SQLAlchemy 2.0 ORM Models for the INVTY GHG Accounting Portal.

All monetary, emission, and factor columns strictly enforce NUMERIC(20, 6).
All inventory reporting periods strictly use DATE, never timestamptz.
Immutability and append-only constraints are enforced by attached event listeners.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base
from .immutability import attach_immutability_listeners


def utcnow() -> datetime:
    """Return timezone-naive UTC timestamp."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def default_uuid() -> str:
    """Generate a RFC 4122 UUID v4 string."""
    return str(uuid.uuid4())


class ActivityCatalogue(Base):
    """Available activity sources seeded from emission_source_catalogue.csv.
    
    Serves as the contract between UI forms and the factor registry.
    """
    __tablename__ = "activity_catalogue"

    activity_key: Mapped[str] = mapped_column(String(100), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_name: Mapped[str] = mapped_column(String(100), nullable=False)
    scope: Mapped[str] = mapped_column(String(10), nullable=False)
    ghg_category: Mapped[str] = mapped_column(String(20), nullable=False)
    category_name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    allowed_units: Mapped[str] = mapped_column(String(255), nullable=False)
    gases: Mapped[str] = mapped_column(String(100), nullable=False)
    factor_source: Mapped[str] = mapped_column(String(100), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    factors: Mapped[list[EmissionFactor]] = relationship(
        "EmissionFactor", back_populates="catalogue_entry"
    )


class EmissionFactor(Base):
    """Mirrors ghg_core.factors.EmissionFactor.
    
    IMMUTABLE: A revision is a NEW row with the old one marked superseded.
    Direct updates to factor values are blocked by immutability listeners.
    """
    __tablename__ = "emission_factor"

    version_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    activity_key: Mapped[str] = mapped_column(
        String(100), ForeignKey("activity_catalogue.activity_key"), nullable=False, index=True
    )
    region: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    reference_year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    gas: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    numerator_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    denominator_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    ef_basis: Mapped[str] = mapped_column(String(20), nullable=False)  # "energy" | "physical"
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_table_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    factor_set_id: Mapped[str] = mapped_column(String(100), nullable=False)
    superseded_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    uncertainty_pct: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    # Relationships
    catalogue_entry: Mapped[ActivityCatalogue] = relationship(
        "ActivityCatalogue", back_populates="factors"
    )


class FuelProperty(Base):
    """A dated, sourced physical property of one fuel (density, NCV, basis).
    
    Mirrors ghg_core.units.FuelProperty.
    """
    __tablename__ = "fuel_property"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fuel_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    reference_year: Mapped[int] = mapped_column(Integer, nullable=False)
    density_kg_per_m3: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    ncv_mj_per_kg: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    gas_reference: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # standard | normal
    basis: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # as_received | air_dried | equilibrated | daf
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class GwpSet(Base):
    """Versioned Global Warming Potential assessment report set (e.g. AR6, AR5, AR4).
    
    Mirrors ghg_core.gwp.GwpSet.
    """
    __tablename__ = "gwp_set"

    name: Mapped[str] = mapped_column(String(50), primary_key=True)  # e.g. "AR6"
    horizon_years: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    values: Mapped[list[GwpValue]] = relationship(
        "GwpValue", back_populates="gwp_set", cascade="all, delete-orphan"
    )


class GwpValue(Base):
    """Individual gas 100-year GWP multiplier within a GwpSet."""
    __tablename__ = "gwp_value"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gwp_set_name: Mapped[str] = mapped_column(
        String(50), ForeignKey("gwp_set.name", ondelete="CASCADE"), nullable=False, index=True
    )
    gas: Mapped[str] = mapped_column(String(50), nullable=False)  # CO2, CH4_fossil, N2O, SF6, etc.
    value: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    gwp_set: Mapped[GwpSet] = relationship("GwpSet", back_populates="values")

    __table_args__ = (
        UniqueConstraint("gwp_set_name", "gas", name="uq_gwp_value_set_gas"),
    )


class Organisation(Base):
    """Legal reporting entity."""
    __tablename__ = "organisation"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(50), default="IN", nullable=False)
    sector_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sector_scheme: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    revenue: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    revenue_currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    employees: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    lead_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    facilities: Mapped[list[Facility]] = relationship(
        "Facility", back_populates="organisation", cascade="all, delete-orphan"
    )
    inventories: Mapped[list[Inventory]] = relationship(
        "Inventory", back_populates="organisation", cascade="all, delete-orphan"
    )


class Facility(Base):
    """Operating site, manufacturing plant, or office inside organizational boundary."""
    __tablename__ = "facility"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    organisation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organisation.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    country: Mapped[str] = mapped_column(String(50), nullable=False)
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    grid_region: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    floor_area: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    production_volume: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    production_unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    organisation: Mapped[Organisation] = relationship("Organisation", back_populates="facilities")


class Inventory(Base):
    """Inventory container for one reporting period and consolidation boundary."""
    __tablename__ = "inventory"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    organisation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("organisation.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # HARD REQUIREMENT: Reporting periods are DATE columns, never timestamptz
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    consolidation_approach: Mapped[str] = mapped_column(
        String(50), default="operational_control", nullable=False
    )
    base_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gwp_set: Mapped[str] = mapped_column(String(50), default="AR6", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    track: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    organisation: Mapped[Organisation] = relationship("Organisation", back_populates="inventories")
    activity_records: Mapped[list[ActivityRecord]] = relationship(
        "ActivityRecord", back_populates="inventory", cascade="all, delete-orphan"
    )
    calculation_runs: Mapped[list[CalculationRun]] = relationship(
        "CalculationRun", back_populates="inventory", cascade="all, delete-orphan"
    )


class ActivityRecord(Base):
    """User-entered activity record. Mirrors ghg_core.engine.ActivityRecord."""
    __tablename__ = "activity_record"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    inventory_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inventory.id", ondelete="CASCADE"), nullable=False, index=True
    )
    facility_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("facility.id", ondelete="SET NULL"), nullable=True, index=True
    )
    scope: Mapped[str] = mapped_column(String(10), nullable=False)  # "1" | "2" | "3" | "memo"
    ghg_category: Mapped[str] = mapped_column(String(20), nullable=False)  # "1.1", "3.4", etc.
    activity_key: Mapped[str] = mapped_column(
        String(100), ForeignKey("activity_catalogue.activity_key"), nullable=False, index=True
    )
    method: Mapped[str] = mapped_column(String(50), default="average_data", nullable=False)
    value: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)  # None == incomplete, NOT zero
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fuel_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    biogenic_fraction: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    biogenic_basis: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "energy" | "carbon"
    memo_bucket: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    scope2_view: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "location" | "market"
    data_quality_tier: Mapped[str] = mapped_column(String(50), default="secondary", nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    currency_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    period_start: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    period_end: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    evidence_file_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    inventory: Mapped[Inventory] = relationship("Inventory", back_populates="activity_records")
    facility: Mapped[Optional[Facility]] = relationship("Facility")
    catalogue_entry: Mapped[ActivityCatalogue] = relationship("ActivityCatalogue")


class CalculationRun(Base):
    """Calculation run results. APPEND ONLY: updates and deletes are rejected."""
    __tablename__ = "calculation_run"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    inventory_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("inventory.id", ondelete="CASCADE"), nullable=False, index=True
    )
    engine_version: Mapped[str] = mapped_column(String(50), nullable=False)
    gwp_set_name: Mapped[str] = mapped_column(String(50), nullable=False)
    factor_set_pins: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    scope2_headline_view: Mapped[str] = mapped_column(String(20), default="location", nullable=False)

    # Rolled-up totals in exact NUMERIC(20, 6)
    totals_scope1: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)
    totals_scope2_location: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)
    totals_scope2_market: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)
    totals_scope2_headline: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)
    totals_scope3: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)
    totals_grand_total: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)

    totals_scope3_by_category: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    totals_memo: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    excluded_records: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    inventory: Mapped[Inventory] = relationship("Inventory", back_populates="calculation_runs")
    line_results: Mapped[list[LineResult]] = relationship(
        "LineResult", back_populates="calculation_run", cascade="all, delete-orphan"
    )


class LineResult(Base):
    """LineResult per activity record. APPEND ONLY: updates and deletes are rejected."""
    __tablename__ = "line_result"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=default_uuid)
    run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calculation_run.id", ondelete="CASCADE"), nullable=False, index=True
    )
    record_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    activity_key: Mapped[str] = mapped_column(String(100), nullable=False)
    scope: Mapped[str] = mapped_column(String(10), nullable=False)
    ghg_category: Mapped[str] = mapped_column(String(20), nullable=False)

    normalised_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    normalised_unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    factor_version_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    factor_value: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 6), nullable=True)
    factor_source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    factor_reference_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    gas_breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    gwp_applied: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    emissions_kgco2e: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)
    biogenic_co2_kg: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal(0), nullable=False)

    memo_bucket: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    scope2_view: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    resolution_flags: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=False)
    data_quality_tier: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # "calculated" | "incomplete" | "unavailable"
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    calculation_run: Mapped[CalculationRun] = relationship(
        "CalculationRun", back_populates="line_results"
    )


# Attach immutability and append-only listeners
attach_immutability_listeners(
    emission_factor_cls=EmissionFactor,
    calculation_run_cls=CalculationRun,
    line_result_cls=LineResult,
)
