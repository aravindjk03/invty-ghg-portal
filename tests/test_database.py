"""Tests for the database persistence layer.

Verifies:
1. No numeric column is a float type (all NUMERIC(20, 6)).
2. Reporting periods are DATE columns, never timestamptz.
3. An UPDATE to an emission_factor row is rejected (immutable).
4. CalculationRun and LineResult are append-only.
5. Catalogue seeding populates activity_catalogue and leaves emission_factor completely empty.
6. load_registry returns a registry that ghg_core.calculate() uses end-to-end.
"""
from __future__ import annotations

import datetime
from decimal import Decimal
import pytest
import sqlalchemy as sa
from sqlalchemy import create_engine, select, update, delete
from sqlalchemy.orm import Session, sessionmaker

from db.base import Base, set_sqlite_pragma
from db.immutability import ImmutableRecordError, AppendOnlyRecordError
from db.models import (
    ActivityCatalogue,
    ActivityRecord,
    CalculationRun,
    EmissionFactor,
    Facility,
    FuelProperty,
    GwpSet,
    GwpValue,
    Inventory,
    LineResult,
    Organisation,
)
from db.repository import (
    load_registry,
    load_fuel_properties,
    load_gwp_set,
    save_calculation_run,
)
from db.seed import seed_activity_catalogue, seed_gwp_from_json

import ghg_core
from ghg_core import (
    ActivityRecord as CoreActivityRecord,
    InMemoryFactorRegistry,
    calculate,
    load_gwp_set as core_load_gwp_set,
)
from ghg_core.factors import ENERGY_BASIS, PHYSICAL_BASIS, Flag


@pytest.fixture
def db_engine():
    """Create an in-memory SQLite database engine with foreign keys enabled."""
    engine = create_engine("sqlite:///:memory:", echo=False)
    sa.event.listen(engine, "connect", set_sqlite_pragma)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def db_session(db_engine):
    """Provide a transactional database session."""
    SessionFactory = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, expire_on_commit=False)
    with SessionFactory() as session:
        yield session


# ============================================================================
# 1. HARD REQUIREMENT: NO NUMERIC COLUMN IS A FLOAT TYPE
# ============================================================================

def test_no_numeric_column_is_float():
    """Assert that every numeric, factor, or currency column is NUMERIC(20,6), never Float."""
    float_types = (sa.Float, sa.REAL, sa.Double)
    inspected_numerics = 0

    for table in Base.metadata.tables.values():
        for column in table.columns:
            col_type = column.type

            # Must never be a float type
            assert not isinstance(col_type, float_types), (
                f"Violation: Column '{table.name}.{column.name}' is {col_type}, which is a float! "
                "Floats introduce binary precision drift and are strictly forbidden."
            )

            # If it's Numeric / Decimal, verify exact precision=20 and scale=6
            if isinstance(col_type, sa.Numeric):
                inspected_numerics += 1
                assert col_type.precision == 20, (
                    f"Column '{table.name}.{column.name}' precision is {col_type.precision}, expected 20"
                )
                assert col_type.scale == 6, (
                    f"Column '{table.name}.{column.name}' scale is {col_type.scale}, expected 6"
                )

    # Ensure we actually inspected columns and didn't trivially pass
    assert inspected_numerics >= 18, f"Expected at least 18 NUMERIC(20,6) columns across all models, found {inspected_numerics}"


# ============================================================================
# 2. HARD REQUIREMENT: REPORTING PERIODS ARE DATE, NEVER TIMESTAMPTZ
# ============================================================================

def test_reporting_periods_are_date_never_timestamptz():
    """Assert that inventory reporting period columns are DATE, not DateTime or TIMESTAMP."""
    inv_table = Base.metadata.tables["inventory"]
    assert isinstance(inv_table.c.period_start.type, sa.Date)
    assert not isinstance(inv_table.c.period_start.type, sa.DateTime)
    assert isinstance(inv_table.c.period_end.type, sa.Date)
    assert not isinstance(inv_table.c.period_end.type, sa.DateTime)

    act_table = Base.metadata.tables["activity_record"]
    assert isinstance(act_table.c.period_start.type, sa.Date)
    assert not isinstance(act_table.c.period_start.type, sa.DateTime)
    assert isinstance(act_table.c.period_end.type, sa.Date)
    assert not isinstance(act_table.c.period_end.type, sa.DateTime)


# ============================================================================
# 3. HARD REQUIREMENT: EMISSION_FACTOR IMMUTABILITY (UPDATE IS REJECTED)
# ============================================================================

def test_emission_factor_update_rejected_orm(db_session):
    """Assert an ORM update to an emission_factor row is rejected."""
    # Seed catalogue parent row first to satisfy foreign key
    cat = ActivityCatalogue(
        activity_key="test.fuel.diesel",
        display_name="Test Diesel",
        group_name="Liquid fuel",
        scope="1",
        ghg_category="1.1",
        category_name="Stationary combustion",
        default_unit="L",
        allowed_units="L|m3",
        gases="CO2,CH4,N2O",
        factor_source="TEST",
    )
    db_session.add(cat)
    db_session.flush()

    factor = EmissionFactor(
        version_id="ef-test-v1",
        activity_key="test.fuel.diesel",
        region="IN",
        reference_year=2026,
        gas="CO2",
        value=Decimal("2.680000"),
        numerator_unit="kgCO2",
        denominator_unit="L",
        ef_basis=PHYSICAL_BASIS,
        source_name="DESNZ 2026",
        source_table_ref="Table 1.1",
        source_url="https://gov.uk/ghg",
        factor_set_id="DESNZ-2026",
    )
    db_session.add(factor)
    db_session.commit()

    # Attempt to update value on the existing row -> MUST BE REJECTED
    factor.value = Decimal("3.500000")
    with pytest.raises(ImmutableRecordError, match="immutable"):
        db_session.commit()

    db_session.rollback()


def test_emission_factor_update_rejected_sql(db_session):
    """Assert a direct SQL UPDATE statement to emission_factor is rejected."""
    cat = ActivityCatalogue(
        activity_key="test.fuel.petrol",
        display_name="Test Petrol",
        group_name="Liquid fuel",
        scope="1",
        ghg_category="1.1",
        category_name="Stationary combustion",
        default_unit="L",
        allowed_units="L",
        gases="CO2",
        factor_source="TEST",
    )
    db_session.add(cat)
    factor = EmissionFactor(
        version_id="ef-petrol-v1",
        activity_key="test.fuel.petrol",
        region="IN",
        reference_year=2026,
        gas="CO2",
        value=Decimal("2.310000"),
        numerator_unit="kgCO2",
        denominator_unit="L",
        ef_basis=PHYSICAL_BASIS,
        source_name="DESNZ",
        source_table_ref="Table 1.2",
        source_url="https://gov.uk/ghg",
        factor_set_id="DESNZ-2026",
    )
    db_session.add(factor)
    db_session.commit()

    # Direct SQL UPDATE must be blocked
    with pytest.raises(ImmutableRecordError, match="prohibited"):
        db_session.execute(
            update(EmissionFactor)
            .where(EmissionFactor.version_id == "ef-petrol-v1")
            .values(value=Decimal("4.000000"))
        )
        db_session.commit()

    db_session.rollback()


# ============================================================================
# 4. HARD REQUIREMENT: CALCULATION_RUN & LINE_RESULT APPEND ONLY
# ============================================================================

def test_calculation_run_and_line_result_append_only(db_session):
    """Assert calculation_run and line_result cannot be updated or deleted."""
    org = Organisation(name="Test Corp", country="IN")
    db_session.add(org)
    db_session.flush()

    inv = Inventory(
        organisation_id=org.id,
        period_start=datetime.date(2025, 4, 1),
        period_end=datetime.date(2026, 3, 31),
    )
    db_session.add(inv)
    db_session.flush()

    run = CalculationRun(
        inventory_id=inv.id,
        engine_version="1.0.0",
        gwp_set_name="AR6",
        factor_set_pins={"DESNZ": "2026"},
        scope2_headline_view="location",
        totals_scope1=Decimal("1500.000000"),
        totals_scope2_location=Decimal("300.000000"),
        totals_scope2_market=Decimal("0.000000"),
        totals_scope2_headline=Decimal("300.000000"),
        totals_scope3=Decimal("500.000000"),
        totals_grand_total=Decimal("2300.000000"),
    )
    db_session.add(run)
    db_session.flush()

    lr = LineResult(
        run_id=run.id,
        record_id="rec-001",
        activity_key="test.fuel.diesel",
        scope="1",
        ghg_category="1.1",
        emissions_kgco2e=Decimal("1500.000000"),
        data_quality_tier="primary",
        status="calculated",
    )
    db_session.add(lr)
    db_session.commit()

    # Updating totals on calculation run -> REJECTED
    run.totals_grand_total = Decimal("9999.000000")
    with pytest.raises(AppendOnlyRecordError):
        db_session.commit()
    db_session.rollback()

    # Updating line result -> REJECTED
    lr_query = db_session.get(LineResult, lr.id)
    lr_query.emissions_kgco2e = Decimal("0.000000")
    with pytest.raises(AppendOnlyRecordError):
        db_session.commit()
    db_session.rollback()

    # Deleting line result -> REJECTED
    lr_query = db_session.get(LineResult, lr.id)
    db_session.delete(lr_query)
    with pytest.raises(AppendOnlyRecordError):
        db_session.commit()
    db_session.rollback()


# ============================================================================
# 5. HARD REQUIREMENT: SEED CATALOGUE LEAVES EMISSION_FACTOR EMPTY
# ============================================================================

def test_seed_activity_catalogue_leaves_emission_factor_empty(db_session):
    """Assert seed_activity_catalogue loads entries and leaves emission_factor completely empty."""
    count = seed_activity_catalogue(db_session)
    assert count == 266, f"Expected 266 catalogue entries, seeded {count}"

    # Verify activity_catalogue has entries
    cat_entries = db_session.scalars(select(ActivityCatalogue)).all()
    assert len(cat_entries) == 266

    # Verify emission_factor table remains completely empty (0 rows)
    factors_count = db_session.scalar(select(sa.func.count()).select_from(EmissionFactor))
    assert factors_count == 0, f"Violation: emission_factor table should be empty, but has {factors_count} rows!"


# ============================================================================
# 6. HARD REQUIREMENT: LOAD_REGISTRY AND END-TO-END CALCULATION RUN
# ============================================================================

def test_load_registry_and_end_to_end_calculate(db_session):
    """Assert load_registry returns an InMemoryFactorRegistry and runs ghg_core.calculate() end-to-end."""
    # 1. Seed catalogue
    seed_activity_catalogue(db_session)

    # 2. Add required emission factors for stationary diesel combustion
    # Physical basis factor: kgCO2 per Litre of diesel
    co2_factor = EmissionFactor(
        version_id="ef-diesel-co2-2026",
        activity_key="fuel.diesel.stationary",
        region="IN",
        reference_year=2026,
        gas="CO2",
        value=Decimal("2.687870"),
        numerator_unit="kgCO2",
        denominator_unit="L",
        ef_basis=PHYSICAL_BASIS,
        source_name="DESNZ 2026",
        source_table_ref="Fuels Table 1.1",
        source_url="https://gov.uk/desnz-ghg-factors-2026",
        factor_set_id="DESNZ-2026",
    )
    ch4_factor = EmissionFactor(
        version_id="ef-diesel-ch4-2026",
        activity_key="fuel.diesel.stationary",
        region="IN",
        reference_year=2026,
        gas="CH4",
        value=Decimal("0.000140"),
        numerator_unit="kgCH4",
        denominator_unit="L",
        ef_basis=PHYSICAL_BASIS,
        source_name="DESNZ 2026",
        source_table_ref="Fuels Table 1.1",
        source_url="https://gov.uk/desnz-ghg-factors-2026",
        factor_set_id="DESNZ-2026",
    )
    n2o_factor = EmissionFactor(
        version_id="ef-diesel-n2o-2026",
        activity_key="fuel.diesel.stationary",
        region="IN",
        reference_year=2026,
        gas="N2O",
        value=Decimal("0.000380"),
        numerator_unit="kgN2O",
        denominator_unit="L",
        ef_basis=PHYSICAL_BASIS,
        source_name="DESNZ 2026",
        source_table_ref="Fuels Table 1.1",
        source_url="https://gov.uk/desnz-ghg-factors-2026",
        factor_set_id="DESNZ-2026",
    )
    db_session.add_all([co2_factor, ch4_factor, n2o_factor])
    db_session.commit()

    # 3. Call load_registry repository function
    registry = load_registry(db_session, region="IN", year=2026)
    assert isinstance(registry, InMemoryFactorRegistry)
    assert len(registry) == 3

    # 4. Resolve exact factor from loaded registry
    res = registry.resolve("fuel.diesel.stationary", "IN", 2026, "CO2")
    assert res.factor.value == Decimal("2.687870")
    assert res.flags == (Flag.EXACT,)

    # 5. Load GWP set
    gwp_set = core_load_gwp_set("data/gwp_TEST_FIXTURE.json")

    # 6. Construct ActivityRecord
    record = CoreActivityRecord(
        record_id="rec-dg-101",
        activity_key="fuel.diesel.stationary",
        scope="1",
        ghg_category="1.1",
        region="IN",
        value=Decimal("1000"),  # 1,000 Litres of diesel
        unit="L",
    )

    # 7. Execute ghg_core.calculate() against the loaded registry
    run = calculate(
        records=[record],
        registry=registry,
        gwp_set=gwp_set,
        reporting_year=2026,
        scope2_headline_view="location",
    )

    # Assert calculations are correct
    assert len(run.line_results) == 1
    lr = run.line_results[0]
    assert lr.status == "calculated"
    assert lr.activity_key == "fuel.diesel.stationary"
    assert lr.emissions_kgco2e > Decimal("2600")
    assert run.totals.scope1 == lr.emissions_kgco2e
    assert run.totals.grand_total == lr.emissions_kgco2e

    # 8. Persist the calculation run to database
    org = Organisation(name="Tata Motors Plant", country="IN")
    db_session.add(org)
    db_session.flush()

    inv = Inventory(
        organisation_id=org.id,
        period_start=datetime.date(2025, 4, 1),
        period_end=datetime.date(2026, 3, 31),
    )
    db_session.add(inv)
    db_session.flush()

    act_rec = ActivityRecord(
        id="rec-dg-101",
        inventory_id=inv.id,
        scope="1",
        ghg_category="1.1",
        activity_key="fuel.diesel.stationary",
        value=Decimal("1000"),
        unit="L",
    )
    db_session.add(act_rec)
    db_session.flush()

    saved_run = save_calculation_run(db_session, inv.id, run)
    db_session.commit()

    # Query back and verify persistence
    run_in_db = db_session.get(CalculationRun, saved_run.id)
    assert run_in_db is not None
    assert run_in_db.totals_scope1 == run.totals.scope1
    assert len(run_in_db.line_results) == 1
    assert run_in_db.line_results[0].emissions_kgco2e == lr.emissions_kgco2e


# ============================================================================
# 7. FUEL PROPERTY & GWP SET PERSISTENCE
# ============================================================================

def test_fuel_property_and_gwp_set_persistence(db_session):
    """Test fuel_property and gwp_set repository operations."""
    # FuelProperty persistence
    fp = FuelProperty(
        fuel_key="fuel.diesel",
        source_name="DESNZ 2026",
        source_ref="Table 1.1",
        reference_year=2026,
        density_kg_per_m3=Decimal("835.000000"),
        ncv_mj_per_kg=Decimal("42.600000"),
        basis="as_received",
    )
    db_session.add(fp)
    db_session.commit()

    loaded_fuels = load_fuel_properties(db_session)
    assert "fuel.diesel" in loaded_fuels
    assert loaded_fuels["fuel.diesel"].density_kg_per_m3 == Decimal("835.000000")
    assert loaded_fuels["fuel.diesel"].ncv_mj_per_kg == Decimal("42.600000")

    # GWP set persistence from JSON
    gwp_set_model = seed_gwp_from_json(db_session, "data/gwp_TEST_FIXTURE.json")
    assert gwp_set_model.name == "TEST-FIXTURE-NOT-FOR-PRODUCTION"

    gwp_core = load_gwp_set(db_session, "TEST-FIXTURE-NOT-FOR-PRODUCTION")
    assert gwp_core.gwp("CO2") == Decimal(1)
    assert gwp_core.gwp("CH4_fossil") == Decimal(30)
    assert gwp_core.gwp("N2O") == Decimal(270)
