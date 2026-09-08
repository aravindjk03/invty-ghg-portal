"""ghg_core - the INVTY GHG calculation core.

Pure, deterministic, dependency-light. No database, no network, no UI.
Ships with ZERO emission factor values: they are ingested from named
publications through the ingestion pipeline. See docs/calculation-methodology.md
"""
from .engine import (ENGINE_VERSION, ActivityRecord, CalculationRun, LineResult,
                     Totals, calculate, derive_td_losses, intensity)
from .errors import (EfBasisMismatchError, FactorNotFoundError,
                     FuelPropertyRequiredError, GasReferenceMismatchError,
                     GhgCoreError, GwpNotFoundError, IncompatibleUnitsError,
                     UnknownUnitError, DoubleCountError)
from .factors import (ENERGY_BASIS, PHYSICAL_BASIS, EmissionFactor, Flag,
                      InMemoryFactorRegistry)
from .gwp import GwpSet, load_gwp_set
from .quantities import D, round_sig
from .units import FuelProperty, convert, gcv_kcal_per_kg_to_mj_per_kg, normalise_unit

__version__ = ENGINE_VERSION
