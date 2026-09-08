"""INVTY GHG Accounting Portal - Database and Persistence Layer.

Exports Base, models, engine/session helpers, repository, and seed functions.
"""
from __future__ import annotations

from .base import (
    Base,
    create_db_engine,
    create_session_factory,
    get_database_url,
    init_db,
)
from .immutability import (
    AppendOnlyRecordError,
    ImmutableRecordError,
)
from .models import (
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
from .repository import (
    load_fuel_properties,
    load_gwp_set,
    load_registry,
    save_calculation_run,
)
from .seed import (
    seed_activity_catalogue,
    seed_gwp_from_json,
)

__all__ = [
    "Base",
    "create_db_engine",
    "create_session_factory",
    "get_database_url",
    "init_db",
    "ImmutableRecordError",
    "AppendOnlyRecordError",
    "ActivityCatalogue",
    "ActivityRecord",
    "CalculationRun",
    "EmissionFactor",
    "Facility",
    "FuelProperty",
    "GwpSet",
    "GwpValue",
    "Inventory",
    "LineResult",
    "Organisation",
    "load_registry",
    "load_fuel_properties",
    "load_gwp_set",
    "save_calculation_run",
    "seed_activity_catalogue",
    "seed_gwp_from_json",
]
