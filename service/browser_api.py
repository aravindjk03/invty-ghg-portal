"""The calculation endpoints, without a web server, for running in the browser.

The static website (GitHub Pages) has no calculation server behind it unless
one is deployed. The browser then loads this module under Pyodide and calls
`handle` with what it would have sent over HTTP. It answers exactly as
service/app.py does for the same request, from the same ghg_core code and the
same factor tables, so a figure never depends on where it was calculated.

The AI product estimate is split in two around the one call that needs a key.
`/v1/pcf/browser-request` builds exactly the request the server would send to
the model, and `/v1/pcf/browser-assemble` validates the model's answer and
computes every figure from it with ghg_core, as the server does. The page makes
the model call in between with a key the visitor entered, which is held only
in that browser and never shipped with the site.
"""
from __future__ import annotations

import functools
import json
from types import SimpleNamespace
from typing import Any, Optional
from urllib.parse import parse_qs

from pydantic import BaseModel, TypeAdapter, ValidationError

from ghg_core import InMemoryFactorRegistry

from .catalogue import Catalogue
from .config import Settings
from .estimator import (EstimatorError, EstimatorNotAProduct, build_request, build_system,
                        build_user_message, parse_message, public_message)
from .inventory import GWP_SETS, load_gwp
from .inventory_api import (InventoryRequest, calculate_inventory, catalogue_mappings,
                            list_activities)
from .methods_api import MethodRequest, calculate_method, list_methods
from .pipeline import build_response
from .schemas import EstimateRequest

_METHOD_REQUEST = TypeAdapter(MethodRequest)

#: The model the browser asks, by default the current Opus. Same request
#: builder as the server, so only fields this model accepts are sent.
BROWSER_MODEL = "claude-opus-5-5"


@functools.lru_cache(maxsize=1)
def _pcf():
    """Settings, catalogue and (empty, as on the server) verified registry."""
    from .models import PROFILES

    settings = Settings.from_env()
    catalogue = Catalogue.load()
    registry = InMemoryFactorRegistry()
    return settings, catalogue, registry, catalogue.restricted_to(registry.activity_keys()), \
        PROFILES[BROWSER_MODEL]


def _as_attrs(value: Any) -> Any:
    """A Messages API response as JSON, readable the way the SDK object is."""
    if isinstance(value, dict):
        return SimpleNamespace(**{key: _as_attrs(item) for key, item in value.items()})
    if isinstance(value, list):
        return [_as_attrs(item) for item in value]
    return value


def _ai_error(exc: EstimatorError, assistant: str) -> tuple[int, dict]:
    return exc.status, {"detail": {"code": exc.code, "message": public_message(exc.code, assistant)}}


def _browser_request(body: Any) -> tuple[int, Any]:
    settings, _, _, prompt_catalogue, profile = _pcf()
    request = EstimateRequest.model_validate(body)
    use_beta, params = build_request(
        profile, effort=settings.effort, thinking_budget=0, max_tokens=settings.max_tokens,
        system=build_system(prompt_catalogue), user=build_user_message(request))
    return 200, {"use_beta": use_beta, "params": params, "assistant": settings.assistant_name}


def _browser_assemble(body: Any) -> tuple[int, Any]:
    settings, catalogue, registry, _, _ = _pcf()
    request = EstimateRequest.model_validate((body or {}).get("request"))
    try:
        decomposition = parse_message(_as_attrs((body or {}).get("message") or {}))
        if not decomposition.product.is_product:
            raise EstimatorNotAProduct("not a physical product or material")
    except EstimatorError as exc:
        return _ai_error(exc, settings.assistant_name)
    return 200, build_response(request, decomposition, catalogue, registry,
                               year=settings.reporting_year,
                               assistant=settings.assistant_name, cache_hit=False)


def _dump(value: Any) -> Any:
    """JSON-ready, serialised the way FastAPI serialises a response model."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_dump(item) for item in value]
    return TypeAdapter(type(value)).dump_python(value, mode="json")


def _query(query: str) -> dict[str, Optional[str]]:
    return {key: values[-1] for key, values in parse_qs(query or "").items()}


def _gwp_sets() -> list[dict]:
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


def _route(method: str, path: str, query: dict, body: Any) -> tuple[int, Any]:
    if method == "GET" and path == "/health":
        return 200, {"status": "ok", "engine": "browser"}

    if method == "GET" and path == "/v1/inventory/activities":
        try:
            limit = int(query.get("limit") or 200)
        except ValueError:
            return 422, {"detail": "limit must be a whole number."}
        return 200, list_activities(query.get("scope"), query.get("region"),
                                    query.get("search"), max(1, min(limit, 2000)))

    if method == "GET" and path == "/v1/inventory/catalogue-map":
        return 200, catalogue_mappings()

    if method == "GET" and path == "/v1/inventory/gwp-sets":
        return 200, _gwp_sets()

    if method == "POST" and path == "/v1/inventory/calculate":
        request = InventoryRequest.model_validate(body)
        gwp = load_gwp(request.gwp_set)
        try:
            return 200, calculate_inventory(request, f"{gwp.source_name} ({gwp.source_url})")
        except ValueError as exc:
            return 422, {"detail": {"code": "unsourced_factor", "message": str(exc)}}

    if method == "GET" and path == "/v1/methods":
        return 200, list_methods()

    if method == "POST" and path == "/v1/methods/calculate":
        request = _METHOD_REQUEST.validate_python(body)
        try:
            return 200, calculate_method(request)
        except (KeyError, ValueError) as exc:
            return 422, {"detail": str(exc).strip("'")}

    if method == "POST" and path == "/v1/pcf/browser-request":
        return _browser_request(body)

    if method == "POST" and path == "/v1/pcf/browser-assemble":
        return _browser_assemble(body)

    return 404, {"detail": "Not Found"}


def handle(method: str, path: str, query: str = "", body: Optional[str] = None) -> str:
    """Answer one request. Returns JSON text: {"status": <int>, "body": <json>}."""
    try:
        payload = json.loads(body) if body else None
        status, result = _route(method.upper(), path, _query(query), payload)
    except ValidationError as exc:
        status, result = 422, {"detail": json.loads(exc.json(include_url=False))}
    except json.JSONDecodeError:
        status, result = 422, {"detail": "The request body is not valid JSON."}
    return json.dumps({"status": status, "body": _dump(result)})
