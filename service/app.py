"""FastAPI entry point for the Product Carbon service.

Run from the repository root:

    npm run dev:pcf
"""
from __future__ import annotations

import logging
import threading
from decimal import Decimal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from ghg_core import ENGINE_VERSION, InMemoryFactorRegistry

from .cache import DecompositionCache, cache_key
from .catalogue import Catalogue
from .config import Settings, ai_credentials_present, load_env_file
from .estimator import AIEstimator, ClaudeEstimator, EstimatorError, prompt_fingerprint
from .models import estimate_cost_usd
from .pipeline import build_response
from .ratelimit import SlidingWindowLimiter
from .schemas import EstimateRequest, EstimateResponse

log = logging.getLogger("invty.pcf")

load_env_file()
settings = Settings.from_env()
catalogue = Catalogue.load()
fingerprint = prompt_fingerprint(catalogue)
cache = DecompositionCache(settings.cache_path, settings.cache_ttl_seconds)
limiter = SlidingWindowLimiter(settings.rate_limit_per_hour, window_seconds=3600)

# The verified factor registry ships EMPTY. Values arrive only through the
# ingestion pipeline (spec §12 step 4). Until then every line is an AI estimate,
# and the page says so.
registry = InMemoryFactorRegistry()


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


def get_estimator() -> AIEstimator:
    global _estimator
    if _estimator is None:
        _estimator = ClaudeEstimator(settings.profile, effort=settings.effort,
                                     thinking_budget=settings.thinking_budget,
                                     max_tokens=settings.max_tokens)
    return _estimator


app = FastAPI(title="INVTY Product Carbon Service", version=ENGINE_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "ai_configured": ai_credentials_present(),
        "model": settings.model,
        "model_label": settings.profile.label,
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
             usage=None, cost: Decimal = Decimal(0)) -> EstimateResponse:
    profile = settings.profile
    return build_response(request, decomposition, catalogue, registry,
                          model=profile.model, model_label=profile.label,
                          effort=settings.effort if profile.supports_effort else None,
                          year=settings.reporting_year, cache_hit=cache_hit,
                          usage=usage, cost_usd=cost)


@app.post("/v1/pcf/estimate", response_model=EstimateResponse)
def estimate(request: EstimateRequest, http: Request) -> EstimateResponse:
    key = cache_key(settings.model, fingerprint, request)

    # A cached answer costs nothing, so it is served before any key or limit check.
    cached = cache.get(key)
    if cached is not None:
        spend.record_hit()
        return _respond(request, cached, cache_hit=True)

    if not ai_credentials_present():
        raise HTTPException(status_code=503, detail={
            "code": "ai_not_configured",
            "message": "AI is not configured on the server. Add ANTHROPIC_API_KEY to "
                       "service/.env and restart the Product Carbon service.",
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
        result = get_estimator().decompose(request, catalogue)
    except EstimatorError as exc:
        raise HTTPException(status_code=exc.status,
                            detail={"code": exc.code, "message": exc.message}) from exc
    except Exception as exc:  # noqa: BLE001 - never leak a stack trace to the page
        log.exception("estimate failed")
        raise HTTPException(status_code=502, detail={
            "code": "ai_unavailable",
            "message": "The estimate could not be completed. Try again shortly.",
        }) from exc

    cost = estimate_cost_usd(settings.profile, result.usage)
    spend.record_call(cost)
    cache.put(key, settings.model, result.decomposition)
    log.info("estimate model=%s in=%d out=%d cache_read=%d cost_usd=%s",
             settings.model, result.usage.input_tokens, result.usage.output_tokens,
             result.usage.cache_read_input_tokens, cost)
    return _respond(request, result.decomposition, cache_hit=False,
                    usage=result.usage, cost=cost)
