"""ghg_core - the INVTY GHG calculation core.

Pure, deterministic, dependency-light. No database, no network, no UI.
Ships with ZERO emission factor values: they are ingested from named
publications through the ingestion pipeline. See docs/calculation-methodology.md
"""
from .engine import (ENGINE_VERSION, ActivityRecord, CalculationRun, LineResult,
                     Totals, calculate, derive_td_losses, intensity)
from .errors import (AmbiguousBoundaryError, EfBasisMismatchError,
                     FactorNotFoundError, FuelPropertyRequiredError,
                     GasReferenceMismatchError, GhgCoreError, GwpNotFoundError,
                     IncomparableFactorsError, IncompatibleUnitsError,
                     ProductRouteRequiredError, UnknownUnitError,
                     DoubleCountError)
from .factors import (ALLOCATION_METHODS, CRADLE_TO_GATE, CRADLE_TO_GRAVE,
                      ENERGY_BASIS, GATE_TO_GATE, PCF_CLASS_FALLBACK,
                      PCF_EEIO_FALLBACK, PCF_PREFIX, PHYSICAL_BASIS,
                      SYSTEM_BOUNDARIES, TIER_A, TIER_B, TIER_C,
                      EmissionFactor, Flag, InMemoryFactorRegistry,
                      assert_comparable)
from .gwp import GwpSet, load_gwp_set
from .quantities import D, round_sig
from .screening import (AI_ESTIMATE, CREATION_STAGES, QUANTITY_UNITS, STAGES,
                        VERIFIED_REGISTRY, LineResult as ScreeningLineResult,
                        Range, ScreeningLine, ScreeningResult, screen_product)
from .units import FuelProperty, convert, gcv_kcal_per_kg_to_mj_per_kg, normalise_unit

__version__ = ENGINE_VERSION
