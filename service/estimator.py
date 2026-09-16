"""The AI half: turn a product description into lifecycle lines.

Nothing here computes an emission total. The model proposes lines with
quantities and per-unit factor ranges; service.pipeline hands them to
ghg_core.screening, which does all arithmetic.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol

from pydantic import ValidationError

from .catalogue import Catalogue
from .models import ModelProfile, TokenUsage
from .schemas import (DECOMPOSITION_SCHEMA, REGION_NAMES, Decomposition,
                      EstimateRequest)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class EstimatorError(Exception):
    """A failure the UI can explain. `code` is stable; `message` is user-facing."""
    code = "estimator_error"
    status = 502

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class EstimatorNotConfigured(EstimatorError):
    code, status = "ai_not_configured", 503


class EstimatorRefused(EstimatorError):
    code, status = "ai_refused", 422


class EstimatorIncomplete(EstimatorError):
    code, status = "ai_incomplete", 502


class EstimatorInvalidOutput(EstimatorError):
    code, status = "ai_invalid_output", 502


class EstimatorUnavailable(EstimatorError):
    code, status = "ai_unavailable", 503


class EstimatorQuotaExceeded(EstimatorError):
    """The provider's own quota (e.g. a free-tier daily limit) is used up."""
    code, status = "ai_quota_exceeded", 429


@dataclass(frozen=True)
class EstimatorResult:
    decomposition: Decomposition
    usage: TokenUsage


class AIEstimator(Protocol):
    def decompose(self, request: EstimateRequest, catalogue: Catalogue) -> EstimatorResult: ...


SYSTEM_PROMPT = """\
You are the lifecycle analyst behind INVTY's Product Carbon page. A visitor names a product - a bag of cement, a litre of sulphuric acid, a split air conditioner, a cotton shirt, an electric scooter - and you decompose what one declared unit of it emits across its lifecycle, following ISO 14067 and the GHG Protocol Product Standard. Your readers are industrial and corporate professionals, mostly in India.

The platform does the arithmetic, not you. You return lifecycle lines; the platform multiplies each quantity by its factor and computes every total, subtotal, range and share. That division of labour shapes everything below.

Lines
- Each line is one lifecycle input: a quantity per declared unit, and an emission factor in kgCO2e per ONE quantity_unit. The factor's denominator is always that line's quantity_unit - a line measured in kg never carries a per-tonne factor.
- factor_low, factor_central and factor_high should reflect the genuine spread across production routes, regions and data sources, not a token margin. Where the route is genuinely uncertain - primary or recycled aluminium, grid or captive power - widen the range rather than silently choosing one.
- Stages: raw_materials (extracting and processing inputs), manufacturing (energy and process emissions to make the product itself), distribution (transport to the user), use (emissions during the service life: electricity, fuel, consumables, refrigerant leakage), end_of_life (disposal or recycling processing).
- Never net credits, offsets, avoided emissions or recycling benefits against the footprint. Biogenic carbon storage is not a negative line.
- Use-phase lines must reflect the region's electricity or fuel mix and a stated service life and usage pattern. If a product genuinely has no use-phase emissions, return no use lines and say so in the analysis.
- For a material or chemical sold by weight, the declared unit is 1 kg unless the visitor says otherwise; for a discrete product it is one item.

Sources
- In reference, name the publication or dataset family your factor reflects - an IPCC guideline chapter, a sector association life-cycle inventory, a national grid emission database. If you cannot point to a real source, leave reference empty. Never invent a citation; an empty reference is honest, a fabricated one is not.
- Do not cite ecoinvent, GaBi or Sphera. INVTY holds no licence for them and cannot publish figures attributed to them. Prefer public sources: IPCC guidelines, national inventories such as India's CEA CO2 Baseline Database, sector association life-cycle inventories, published EPDs, EXIOBASE.
- The catalogue below lists materials and production routes for which INVTY will hold verified factors. When a line is exactly one of these materials on exactly that route, set catalogue_key and production_route to the listed values so a verified factor can replace your estimate. Otherwise leave both empty. Do not approximate a match.

Analysis
- Write for an engineer or sustainability manager: plain, specific, no marketing tone.
- Do not state totals, percentages, or which line contributes most. The platform computes and shows those from your lines, and a figure in prose that disagrees with the computed one would mislead the reader. Explain what drives emissions and why.
- Reduction opportunities name a concrete lever and the stage it acts on.
- data_gaps lists what would most change the result if known.
- confidence is your overall confidence in the decomposition.

Ambiguity
- If the product is too vague to decompose credibly ("a machine", "chemicals"), still return a typical decomposition, set is_ambiguous to true, and say in clarification exactly what the visitor should specify. Otherwise set is_ambiguous to false and clarification to an empty string.

Catalogue (material_key | route | declared unit | name):
"""


def build_system(catalogue: Catalogue) -> str:
    return SYSTEM_PROMPT + catalogue.prompt_listing()


def build_user_message(request: EstimateRequest) -> str:
    details = request.details.strip() or "none given"
    return (f"Product: {request.product.strip()}\n"
            f"Region: {REGION_NAMES[request.region]} ({request.region})\n"
            f"Visitor's additional details: {details}")


def prompt_fingerprint(catalogue: Catalogue) -> str:
    """Changes whenever the prompt, catalogue or output schema changes, so cached
    answers produced under an older prompt are never reused."""
    material = build_system(catalogue) + json.dumps(DECOMPOSITION_SCHEMA, sort_keys=True)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:16]


def build_request(profile: ModelProfile, *, effort: str, thinking_budget: int,
                  max_tokens: int, system: str, user: str) -> tuple[bool, dict]:
    """(use_beta_endpoint, kwargs) carrying only what this model accepts.

    An unsupported field is a 400, so each capability is gated on the profile
    rather than sent optimistically.
    """
    output_config: dict = {"format": {"type": "json_schema", "schema": DECOMPOSITION_SCHEMA}}
    kwargs: dict = {
        "model": profile.model,
        "max_tokens": max_tokens,
        "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": user}],
    }
    if profile.thinking == "adaptive":
        kwargs["thinking"] = {"type": "adaptive"}
    elif thinking_budget:
        kwargs["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
    if profile.supports_effort:
        output_config["effort"] = effort
    kwargs["output_config"] = output_config

    if profile.supports_server_fallback:
        kwargs["betas"] = [FALLBACK_BETA]
        kwargs["fallbacks"] = "default"
        return True, kwargs
    return False, kwargs


def parse_message(message: Any) -> Decomposition:
    """Validate a Messages API response into a Decomposition.

    Checks stop_reason BEFORE reading content. When a server-side fallback
    fired, only text after the last `fallback` block belongs to the model that
    completed the answer - anything before it is a discarded partial.
    """
    stop = getattr(message, "stop_reason", None)
    if stop == "refusal":
        raise EstimatorRefused(
            "The AI declined to analyse this product. Try describing it differently.")
    if stop == "max_tokens":
        raise EstimatorIncomplete(
            "The analysis ran out of room before finishing. Try a more specific product.")

    blocks = list(getattr(message, "content", None) or [])
    last_fallback = max((i for i, b in enumerate(blocks)
                         if getattr(b, "type", None) == "fallback"), default=-1)
    text = "".join(b.text for b in blocks[last_fallback + 1:]
                   if getattr(b, "type", None) == "text")
    if not text.strip():
        raise EstimatorInvalidOutput("The AI returned no analysis.")

    try:
        data = json.loads(text, parse_float=Decimal)
        return Decomposition.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise EstimatorInvalidOutput(
            "The AI returned an analysis that did not match the expected structure.") from exc


class ClaudeEstimator:
    def __init__(self, profile: ModelProfile, *, effort: str, thinking_budget: int,
                 max_tokens: int, client: Any = None):
        self.profile = profile
        self.effort, self.thinking_budget, self.max_tokens = effort, thinking_budget, max_tokens
        if client is None:
            import anthropic
            client = anthropic.Anthropic(timeout=300.0)
        self._client = client

    def decompose(self, request: EstimateRequest, catalogue: Catalogue) -> EstimatorResult:
        import anthropic

        use_beta, kwargs = build_request(
            self.profile, effort=self.effort, thinking_budget=self.thinking_budget,
            max_tokens=self.max_tokens, system=build_system(catalogue),
            user=build_user_message(request))
        messages_api = self._client.beta.messages if use_beta else self._client.messages
        try:
            with messages_api.stream(**kwargs) as stream:
                message = stream.get_final_message()
        except anthropic.AuthenticationError as exc:
            raise EstimatorNotConfigured(
                "The AI key was rejected. Check ANTHROPIC_API_KEY in service/.env.") from exc
        except anthropic.PermissionDeniedError as exc:
            raise EstimatorNotConfigured(
                "The AI key does not have access to this model.") from exc
        except anthropic.RateLimitError as exc:
            raise EstimatorUnavailable(
                "The AI is rate-limited right now. Wait a minute and try again.") from exc
        except anthropic.APIConnectionError as exc:
            raise EstimatorUnavailable(
                "Could not reach the AI service. Check the network connection.") from exc
        except anthropic.APIStatusError as exc:
            raise EstimatorUnavailable(
                f"The AI service returned an error ({exc.status_code}). Try again shortly.") from exc

        return EstimatorResult(decomposition=parse_message(message),
                               usage=TokenUsage.from_sdk(getattr(message, "usage", None)))
