"""FastAPI entry point for the Product Carbon service.

Run from the repository root:

    npm run dev:pcf
"""
from __future__ import annotations

import logging
import threading
import time
from decimal import Decimal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from ghg_core import ENGINE_VERSION, InMemoryFactorRegistry

from .cache import DecompositionCache, cache_key
from .catalogue import Catalogue
from .config import Settings, ai_credentials_present, gemini_api_key, load_env_file
from .estimator import AIEstimator, ClaudeEstimator, EstimatorError, prompt_fingerprint
from .fallback import FallbackEstimator, ProviderStep
from .gemini import GeminiEstimator
from .models import PROFILES, ModelProfile, estimate_cost_usd
from .pipeline import build_response
from .ratelimit import SlidingWindowLimiter
from .schemas import EstimateRequest, EstimateResponse

log = logging.getLogger("invty.pcf")

load_env_file()
settings = Settings.from_env()
catalogue = Catalogue.load()
cache = DecompositionCache(settings.cache_path, settings.cache_ttl_seconds)
limiter = SlidingWindowLimiter(settings.rate_limit_per_hour, window_seconds=3600)

# The verified factor registry ships EMPTY. Values arrive only through the
# ingestion pipeline (spec §12 step 4). Until then every line is an AI estimate,
# and the page says so.
registry = InMemoryFactorRegistry()

# The AI is only shown catalogue materials that have a verified factor. With the
# registry empty that is none, which keeps every prompt thousands of tokens shorter.
prompt_catalogue = catalogue.restricted_to(registry.activity_keys())
fingerprint = prompt_fingerprint(prompt_catalogue)

KEY_NAMES = {"gemini": "GEMINI_API_KEY", "anthropic": "ANTHROPIC_API_KEY"}


class _Spend:
    """Running totals since the service started, for the operator."""

    def __init__(self):
        self.ai_calls = 0
        self.cache_hits = 0
        self.usd = Decimal(0)
        self._lock = threading.Lock()

    def record_call(self, cost: Decimal) -> None:
        with self._lock:
            self.ai_calls += 1
            self.usd += cost

    def record_hit(self) -> None:
        with self._lock:
            self.cache_hits += 1


spend = _Spend()
_estimator: AIEstimator | None = None


def _configured(profile: ModelProfile) -> bool:
    return ai_credentials_present(profile.provider)


def _build(profile: ModelProfile) -> AIEstimator:
    if profile.provider == "gemini":
        return GeminiEstimator(profile, api_key=gemini_api_key(), max_tokens=settings.max_tokens)
    return ClaudeEstimator(profile, effort=settings.effort,
                           thinking_budget=settings.thinking_budget,
                           max_tokens=settings.max_tokens)


def get_estimator() -> AIEstimator:
    global _estimator
    if _estimator is None:
        _estimator = FallbackEstimator([
            ProviderStep(profile=p, configured=(lambda p=p: _configured(p)),
                         build=(lambda p=p: _build(p)))
            for p in settings.profiles
        ])
    return _estimator


_ANTHROPIC_STATUS_TTL = 600.0
_anthropic_status: dict = {"checked": 0.0, "status": None}


def probe_anthropic(model: str) -> str:
    """'ready' | 'no_credit' | 'key_rejected' | 'unknown'. Uses token counting,
    which Anthropic does not charge for, and sends a two-token message."""
    import anthropic
    try:
        anthropic.Anthropic(timeout=10.0, max_retries=0).messages.count_tokens(
            model=model, messages=[{"role": "user", "content": "ok"}])
        return "ready"
    except anthropic.AuthenticationError:
        return "key_rejected"
    except anthropic.BadRequestError as exc:
        return "no_credit" if "credit balance" in str(exc).lower() else "unknown"
    except Exception:  # noqa: BLE001 - a status probe must never break /health
        return "unknown"


def provider_status(profile: ModelProfile) -> str:
    """'needs_key' | 'ready' | 'no_credit' | 'key_rejected' | 'unknown'. The
    Anthropic account check is cached for ten minutes."""
    if not _configured(profile):
        return "needs_key"
    if profile.provider != "anthropic":
        return "ready"
    now = time.monotonic()
    if _anthropic_status["status"] is None or now - _anthropic_status["checked"] > _ANTHROPIC_STATUS_TTL:
        _anthropic_status.update(status=probe_anthropic(profile.model), checked=now)
    return _anthropic_status["status"]


def _credentials_ok() -> bool:
    return any(_configured(p) for p in settings.profiles)


def _setup_hint() -> str:
    keys = " or ".join(KEY_NAMES[p.provider] for p in settings.profiles)
    return f"Add {keys} to service/.env and restart the Product Carbon service."


app = FastAPI(title="INVTY Product Carbon Service", version=ENGINE_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health() -> dict:
    primary = settings.profile
    return {
        "status": "ok",
        "ai_configured": _credentials_ok(),
        "provider": primary.provider,
        "billing": primary.billing,
        "model": primary.model,
        "model_label": primary.label,
        "providers": [
            {"provider": p.provider, "model": p.model, "label": p.label,
             "billing": p.billing, "configured": _configured(p),
             "status": provider_status(p)}
            for p in settings.profiles
        ],
        "engine_version": ENGINE_VERSION,
        "catalogue_rows": len(catalogue),
        "verified_factors": len(registry),
        "cache_enabled": cache.enabled,
        "rate_limit_per_hour": settings.rate_limit_per_hour,
        "ai_calls": spend.ai_calls,
        "cache_hits": spend.cache_hits,
        "estimated_spend_usd": str(spend.usd.quantize(Decimal("0.0001"))),
    }


def _respond(request: EstimateRequest, decomposition, *, cache_hit: bool,
             answered_by: ModelProfile, usage=None, cost: Decimal = Decimal(0),
             fallback_from: tuple[str, ...] = ()) -> EstimateResponse:
    return build_response(request, decomposition, catalogue, registry,
                          model=answered_by.model, model_label=answered_by.label,
                          effort=settings.effort if answered_by.supports_effort else None,
                          year=settings.reporting_year, cache_hit=cache_hit,
                          usage=usage, cost_usd=cost, provider=answered_by.provider,
                          cost_basis=answered_by.billing, fallback_from=fallback_from)


@app.post("/v1/pcf/estimate", response_model=EstimateResponse)
def estimate(request: EstimateRequest, http: Request) -> EstimateResponse:
    key = cache_key(settings.cache_identity, fingerprint, request)

    # A cached answer costs nothing, so it is served before any key or limit check.
    hit = cache.lookup(key)
    if hit is not None:
        decomposition, model = hit
        spend.record_hit()
        return _respond(request, decomposition, cache_hit=True,
                        answered_by=PROFILES.get(model, settings.profile))

    if not _credentials_ok():
        raise HTTPException(status_code=503, detail={
            "code": "ai_not_configured",
            "message": f"AI is not configured on the server. {_setup_hint()}",
        })

    client_id = http.client.host if http.client else "unknown"
    allowed, retry_after = limiter.check(client_id)
    if not allowed:
        minutes = max(1, round(retry_after / 60))
        raise HTTPException(status_code=429, headers={"Retry-After": str(retry_after)}, detail={
            "code": "rate_limited",
            "message": f"You have reached the limit of {settings.rate_limit_per_hour} new "
                       f"estimates an hour. Try again in about {minutes} minute"
                       f"{'' if minutes == 1 else 's'}. Products already estimated still load.",
        })

    try:
        result = get_estimator().decompose(request, prompt_catalogue)
    except EstimatorError as exc:
        raise HTTPException(status_code=exc.status,
                            detail={"code": exc.code, "message": exc.message}) from exc
    except Exception as exc:  # noqa: BLE001 - never leak a stack trace to the page
        log.exception("estimate failed")
        raise HTTPException(status_code=502, detail={
            "code": "ai_unavailable",
            "message": "The estimate could not be completed. Try again shortly.",
        }) from exc

    answered_by = result.profile or settings.profile
    cost = estimate_cost_usd(answered_by, result.usage)
    spend.record_call(cost)
    cache.put(key, answered_by.model, result.decomposition)
    log.info("estimate provider=%s model=%s fallback_from=%s in=%d out=%d cache_read=%d cost_usd=%s",
             answered_by.provider, answered_by.model, ",".join(result.fallback_from) or "-",
             result.usage.input_tokens, result.usage.output_tokens,
             result.usage.cache_read_input_tokens, cost)
    return _respond(request, result.decomposition, cache_hit=False, answered_by=answered_by,
                    usage=result.usage, cost=cost, fallback_from=result.fallback_from)
