"""Request, AI-output and response models.

The AI output schema is the load-bearing part. It has fields for per-line
quantities and per-unit factors, and NO field for any total, subtotal, share
or ranking. Aggregates are computed by ghg_core.screening from the lines, so
the model has nowhere to put a figure that could disagree with the arithmetic.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Region = Literal["IN", "GLOBAL", "GB", "US", "EU"]
REGION_NAMES: dict[str, str] = {
    "IN": "India", "GLOBAL": "Global average", "GB": "United Kingdom",
    "US": "United States", "EU": "European Union",
}

Category = Literal["chemicals", "metals", "polymers", "construction", "automobile",
                   "electronics", "textiles", "food", "machinery", "daily_products",
                   "other"]
Stage = Literal["raw_materials", "manufacturing", "distribution", "use", "end_of_life"]
Unit = Literal["kg", "t", "kWh", "MJ", "L", "m3", "km", "t.km", "unit"]
Confidence = Literal["high", "medium", "low"]


class _Strict(BaseModel):
    # protected_namespaces=() because this API legitimately has model / model_label fields.
    model_config = ConfigDict(extra="forbid", protected_namespaces=())


# --- request ---------------------------------------------------------------

class EstimateRequest(_Strict):
    product: str = Field(min_length=2, max_length=300)
    region: Region = "IN"
    details: str = Field(default="", max_length=600)


# --- what the AI returns -----------------------------------------------------

class ProductInterpretation(_Strict):
    interpreted_as: str
    category: Category
    declared_unit: str
    is_ambiguous: bool
    clarification: str


class LifecycleAssumptions(_Strict):
    region: str
    service_life_years: Decimal
    use_profile: str
    end_of_life_route: str


class AILine(_Strict):
    stage: Stage
    component: str
    quantity: Decimal
    quantity_unit: Unit
    factor_low: Decimal
    factor_central: Decimal
    factor_high: Decimal
    factor_basis: str
    reference: str
    catalogue_key: str
    production_route: str


class ReductionOpportunity(_Strict):
    lever: str
    stage: Stage
    rationale: str


class Analysis(_Strict):
    summary: str
    creation_drivers: list[str]
    use_phase_drivers: list[str]
    reduction_opportunities: list[ReductionOpportunity]
    data_gaps: list[str]
    confidence: Confidence


class Decomposition(_Strict):
    product: ProductInterpretation
    assumptions: LifecycleAssumptions
    lines: list[AILine]
    analysis: Analysis


def _obj(properties: dict) -> dict:
    """Structured outputs require every property listed and nothing extra."""
    return {"type": "object", "properties": properties,
            "required": list(properties), "additionalProperties": False}


_S = {"type": "string"}
_N = {"type": "number"}
_B = {"type": "boolean"}


def _enum(values) -> dict:
    return {"type": "string", "enum": list(values.__args__)}


DECOMPOSITION_SCHEMA: dict = _obj({
    "product": _obj({
        "interpreted_as": _S, "category": _enum(Category), "declared_unit": _S,
        "is_ambiguous": _B, "clarification": _S,
    }),
    "assumptions": _obj({
        "region": _S, "service_life_years": _N, "use_profile": _S,
        "end_of_life_route": _S,
    }),
    "lines": {"type": "array", "items": _obj({
        "stage": _enum(Stage), "component": _S, "quantity": _N,
        "quantity_unit": _enum(Unit), "factor_low": _N, "factor_central": _N,
        "factor_high": _N, "factor_basis": _S, "reference": _S,
        "catalogue_key": _S, "production_route": _S,
    })},
    "analysis": _obj({
        "summary": _S,
        "creation_drivers": {"type": "array", "items": _S},
        "use_phase_drivers": {"type": "array", "items": _S},
        "reduction_opportunities": {"type": "array", "items": _obj({
            "lever": _S, "stage": _enum(Stage), "rationale": _S,
        })},
        "data_gaps": {"type": "array", "items": _S},
        "confidence": _enum(Confidence),
    }),
})


# --- what the API returns (every number is a string) -------------------------

class DisplayRange(_Strict):
    low: str
    central: str
    high: str
    unit: str


class RangeOut(_Strict):
    low: str
    central: str
    high: str
    display: DisplayRange


class LineOut(_Strict):
    line_id: str
    stage: Stage
    component: str
    quantity: str
    quantity_unit: Unit
    factor: RangeOut                      # kgCO2e per quantity_unit
    emissions: RangeOut                   # kgCO2e
    share_of_lifecycle_pct: Optional[str]
    provenance: Literal["ai_estimate", "verified_registry"]
    tier: Optional[str]
    factor_version_id: Optional[str]
    factor_basis: str
    reference: str
    catalogue_key: str
    production_route: str


class ExcludedLine(_Strict):
    component: str
    stage: str
    reason: str


class Totals(_Strict):
    creation: RangeOut
    use: RangeOut
    end_of_life: RangeOut
    lifecycle: RangeOut


class UsageOut(_Strict):
    input_tokens: int
    output_tokens: int
    cache_read_input_tokens: int
    cache_creation_input_tokens: int


class Method(_Strict):
    provider: Literal["anthropic", "gemini"]
    model: str
    model_label: str
    effort: Optional[str]                 # None for models without an effort setting
    engine_version: str
    generated_at: str
    reporting_year: int
    cache_hit: bool                       # True: served from cache, no AI call made
    usage: Optional[UsageOut]             # None on a cache hit
    estimated_cost_usd: str               # "0" on a cache hit or a free tier
    cost_basis: Literal["estimated", "free_tier"]
    fallback_from: list[str] = []         # providers tried first that could not answer


class EstimateResponse(_Strict):
    estimate_id: str
    request: EstimateRequest
    product: ProductInterpretation
    assumptions: LifecycleAssumptions
    totals: Totals
    stages: dict[str, RangeOut]
    stage_shares_pct: dict[str, Optional[str]]
    lines: list[LineOut]
    hotspot_line_ids: list[str]
    verified_share_pct: Optional[str]
    excluded: list[ExcludedLine]
    analysis: Analysis
    method: Method
