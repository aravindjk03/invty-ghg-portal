"""FastAPI entry point for the Product Carbon service.

Run from the repository root:

    npm run dev:pcf

Public surface: /health and /v1/pcf/estimate name only the assistant brand
(INSITY EDGE AI). Which vendor model answered, token use, cost and provider
status are server-side only: in the log, and at /admin/status behind
PCF_ADMIN_TOKEN.
"""
from __future__ import annotations

import hmac
import logging
import threading
import time
from collections import Counter
from decimal import Decimal
from typing import Optional

from fastapi import Body, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from ghg_core import ENGINE_VERSION, InMemoryFactorRegistry

from .cache import DecompositionCache, cache_key
from .catalogue import Catalogue
from .config import Settings, ai_credentials_present, gemini_api_key, load_env_file
from .estimator import (AIEstimator, ClaudeEstimator, EstimatorError, EstimatorNotAProduct,
                        EstimatorNotConfigured, prompt_fingerprint)
from .fallback import FallbackEstimator, ProviderStep
from .inventory import GWP_SETS, load_gwp, load_registry
from .inventory_api import (ActivityOut, CatalogueMappingOut, InventoryRequest,
                            InventoryResponse, calculate_inventory, catalogue_mappings,
                            list_activities)
from .gemini import GeminiEstimator
from .methods_api import MethodRequest, MethodResponse, calculate_method, list_methods
from .models import PROFILES, ModelProfile, estimate_cost_usd
from .pipeline import build_response
from .ratelimit import SlidingWindowLimiter
from .schemas import Decomposition, EstimateRequest, EstimateResponse

log = logging.getLogger("invty.pcf")
if not log.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:     [pcf] %(message)s"))
    log.addHandler(_handler)
    log.setLevel(logging.INFO)
    log.propagate = False

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

# How long a request waits for an identical in-flight estimate before trying itself.
INFLIGHT_WAIT_SECONDS = 300.0


class _Spend:
    """Running totals since the service started. Operator-only."""

    def __init__(self):
        self.ai_calls = 0
        self.cache_hits = 0
        self.fallbacks = 0
        self.usd = Decimal(0)
        self.by_model: Counter = Counter()
        self._lock = threading.Lock()

    def record_call(self, model: str, cost: Decimal, fell_back: bool) -> None:
        with self._lock:
            self.ai_calls += 1
            self.usd += cost
            self.by_model[model] += 1
            self.fallbacks += int(fell_back)

    def record_hit(self) -> None:
        with self._lock:
            self.cache_hits += 1


spend = _Spend()
_estimator: AIEstimator | None = None
_inflight: dict[str, threading.Event] = {}
_inflight_lock = threading.Lock()


# --- providers --------------------------------------------------------------------------

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
    except Exception:  # noqa: BLE001 - a status probe must never break the endpoint
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


# --- public messages ----------------------------------------------------------------------

def public_error(exc: EstimatorError) -> HTTPException:
    """The page sees a brand-level message. The internal message - which may name a
    vendor, a key or a billing state - goes to the log only."""
    log.warning("estimate failed code=%s detail=%s", exc.code, exc.message)
    name = settings.assistant_name
    messages = {
        "ai_not_configured": f"{name} is not available right now. Please try again later.",
        "ai_quota_exceeded": f"{name} has reached its usage limit for now. Please try again "
                             f"later. Products already estimated still load.",
        "ai_refused": f"{name} could not analyse this request. Describe a physical product "
                      f"or material.",
        "not_a_product": f"{name} estimates physical products and materials. Try something "
                         f"like \"cotton T-shirt\" or \"50 kg bag of cement\".",
    }
    message = messages.get(exc.code, f"{name} could not complete this estimate. Please try "
                                     f"again shortly.")
    return HTTPException(status_code=exc.status, detail={"code": exc.code, "message": message})


app = FastAPI(title="IINVTY Product Carbon Service", version=ENGINE_VERSION,
              docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins),
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health() -> dict:
    """Public. No vendor, model, cost or provider detail, and no outbound calls."""
    return {
        "status": "ok",
        "assistant": settings.assistant_name,
        "ai_ready": _credentials_ok(),
        "engine_version": ENGINE_VERSION,
        "catalogue_rows": len(catalogue),
        "verified_factors": len(registry),
        "cache_enabled": cache.enabled,
        "rate_limit_per_hour": settings.rate_limit_per_hour,
    }


@app.get("/admin/status")
def admin_status(x_admin_token: Optional[str] = Header(default=None)) -> dict:
    """Operator-only: which vendor models run behind the assistant, their status,
    and spend. Disabled (404) unless PCF_ADMIN_TOKEN is set."""
    if not settings.admin_token:
        raise HTTPException(status_code=404)
    if not x_admin_token or not hmac.compare_digest(x_admin_token.encode(),
                                                    settings.admin_token.encode()):
        raise HTTPException(status_code=401, detail={"code": "unauthorized",
                                                     "message": "Admin token required."})
    return {
        "assistant": settings.assistant_name,
        "providers": [
            {"provider": p.provider, "model": p.model, "label": p.label,
             "billing": p.billing, "status": provider_status(p)}
            for p in settings.profiles
        ],
        "usage_since_start": {
            "ai_calls": spend.ai_calls,
            "cache_hits": spend.cache_hits,
            "fallbacks": spend.fallbacks,
            "by_model": dict(spend.by_model),
            "estimated_spend_usd": str(spend.usd.quantize(Decimal("0.0001"))),
        },
        "rate_limit_per_hour": settings.rate_limit_per_hour,
        "cache_enabled": cache.enabled,
    }


# --- estimate -----------------------------------------------------------------------------

def _respond(request: EstimateRequest, decomposition: Decomposition, *,
             cache_hit: bool) -> EstimateResponse:
    if not decomposition.product.is_product:
        raise public_error(EstimatorNotAProduct("not a physical product or material"))
    return build_response(request, decomposition, catalogue, registry,
                          year=settings.reporting_year, assistant=settings.assistant_name,
                          cache_hit=cache_hit)


def _from_cache(request: EstimateRequest, key: str) -> Optional[EstimateResponse]:
    hit = cache.lookup(key)
    if hit is None:
        return None
    spend.record_hit()
    return _respond(request, hit[0], cache_hit=True)


# --- the organisation inventory ------------------------------------------------------------

@app.get("/v1/inventory/activities", response_model=list[ActivityOut])
def inventory_activities(scope: Optional[str] = None, region: Optional[str] = None,
                         search: Optional[str] = None, limit: int = 200) -> list[ActivityOut]:
    """The activities a user may record, from the ingested published factor sets."""
    return list_activities(scope, region, search, max(1, min(limit, 2000)))


@app.get("/v1/inventory/catalogue-map", response_model=list[CatalogueMappingOut])
def inventory_catalogue_map() -> list[CatalogueMappingOut]:
    """Which published factor calculates each source a user may pick, per unit.

    Without this join a user could choose "Diesel - stationary", see a factor on
    the row, and still get nothing: the row named no published factor, so the
    engine refused it. The browser now attaches the factor as the source is
    chosen.
    """
    return catalogue_mappings()


@app.get("/v1/inventory/gwp-sets")
def inventory_gwp_sets() -> list[dict]:
    """Which GWP bases the customer can report on, and where each came from."""
    sets = []
    for name in GWP_SETS:
        gwp = load_gwp(name)
        sets.append({
            "name": gwp.name,
            "horizon_years": gwp.horizon_years,
            "source_name": gwp.source_name,
            "source_url": gwp.source_url,
            "gases": sorted(gwp.values),
        })
    return sets


@app.post("/v1/inventory/calculate", response_model=InventoryResponse)
def inventory_calculate(request: InventoryRequest) -> InventoryResponse:
    """Calculate the inventory under the chosen GWP set.

    Every figure comes from ghg_core. A record whose factor or unit cannot be
    resolved returns unavailable with the reason and is left out of the totals -
    a missing factor is never treated as zero.
    """
    gwp = load_gwp(request.gwp_set)
    log.info("inventory run records=%d gwp=%s year=%d view=%s",
             len(request.records), request.gwp_set, request.reporting_year, request.scope2_view)
    return calculate_inventory(request, f"{gwp.source_name} ({gwp.source_url})")


# --- the IPCC methods that are not factors per unit ----------------------------------------

@app.get("/v1/methods")
def methods_catalogue() -> list[dict]:
    """The sources that are equations rather than a factor per unit of activity.

    Served so the browser can build a form for each without hard-coding what
    the method needs or where it came from.
    """
    return list_methods()


@app.post("/v1/methods/calculate", response_model=MethodResponse)
def methods_calculate(request: MethodRequest = Body(..., discriminator="method")) -> MethodResponse:
    """Run one IPCC method and state the answer under the chosen GWP set.

    The methods return masses of CH4, N2O and CO2; the GWP set is applied here,
    which is why the same calculation can be stated under AR5 or AR6 without
    being run again. A parameter IPCC never published raises rather than
    defaulting to zero.
    """
    log.info("method run method=%s gwp=%s", request.method, request.gwp_set)
    try:
        return calculate_method(request)
    except (KeyError, ValueError) as exc:
        # These carry the reason and what to do about it, and none of them
        # contain anything the caller did not send.
        raise HTTPException(status_code=422, detail=str(exc).strip("'")) from None


@app.post("/v1/pcf/estimate", response_model=EstimateResponse)
def estimate(request: EstimateRequest, http: Request) -> EstimateResponse:
    key = cache_key(settings.cache_identity, fingerprint, request)

    # A cached answer costs nothing, so it is served before any key or limit check.
    cached = _from_cache(request, key)
    if cached is not None:
        return cached

    # Single flight: if the same product is already being estimated, wait for that
    # answer instead of paying for a second identical AI call.
    with _inflight_lock:
        event = _inflight.get(key)
        leader = event is None
        if leader:
            event = _inflight[key] = threading.Event()
    if not leader:
        event.wait(timeout=INFLIGHT_WAIT_SECONDS)
        cached = _from_cache(request, key)
        if cached is not None:
            return cached

    try:
        return _estimate_uncached(request, http, key)
    finally:
        if leader:
            with _inflight_lock:
                _inflight.pop(key, None)
            event.set()


def _estimate_uncached(request: EstimateRequest, http: Request, key: str) -> EstimateResponse:
    if not _credentials_ok():
        missing = ", ".join(f"{p.label} ({p.provider})" for p in settings.profiles)
        raise public_error(EstimatorNotConfigured(f"no provider has a key: {missing}"))

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
        raise public_error(exc) from exc
    except Exception as exc:  # noqa: BLE001 - never leak a stack trace to the page
        log.exception("estimate failed unexpectedly")
        raise public_error(EstimatorError("unexpected failure")) from exc

    answered_by = result.profile or settings.profile
    cost = estimate_cost_usd(answered_by, result.usage)
    spend.record_call(answered_by.model, cost, fell_back=bool(result.fallback_from))
    cache.put(key, answered_by.model, result.decomposition)
    log.info("estimate model=%s fallback_from=%s is_product=%s in=%d out=%d cache_read=%d "
             "cost_usd=%s", answered_by.model, ",".join(result.fallback_from) or "-",
             result.decomposition.product.is_product, result.usage.input_tokens,
             result.usage.output_tokens, result.usage.cache_read_input_tokens, cost)
    return _respond(request, result.decomposition, cache_hit=False)
