"""The in-browser engine answers exactly as the calculation server does.

When the website has no server behind it, the browser runs service.browser_api
under Pyodide. A figure must never depend on where it was calculated, so every
endpoint is checked against the FastAPI app, request for request.
"""
import json

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")

from fastapi.testclient import TestClient  # noqa: E402

from service.app import app  # noqa: E402
from service.browser_api import handle  # noqa: E402

client = TestClient(app)

DIESEL = "desnz.2025.1_101_1011_8"
GRID_IN = "cea.grid.weighted_average_incl_res.incl_imports.2025_26"


def inventory(records, gwp_set="AR5"):
    return {"records": records, "gwp_set": gwp_set, "reporting_year": 2025,
            "scope2_view": "location"}


def browser(method, path, query="", body=None):
    answer = json.loads(handle(method, path, query, json.dumps(body) if body is not None else None))
    return answer["status"], answer["body"]


@pytest.mark.parametrize("path, query", [
    ("/v1/inventory/catalogue-map", ""),
    ("/v1/inventory/gwp-sets", ""),
    ("/v1/inventory/unit-choices", ""),
    ("/v1/inventory/activities", "scope=1&search=diesel&limit=20"),
    ("/v1/methods", ""),
])
def test_reads_match_the_server(path, query):
    server = client.get(f"{path}?{query}" if query else path)
    assert browser("GET", path, query) == (server.status_code, server.json())


@pytest.mark.parametrize("body", [
    inventory([{"record_id": "r1", "activity_key": DIESEL, "scope": "1", "ghg_category": "1.1",
                "region": "UK", "value": "1000", "unit": "litres"}]),
    inventory([{"record_id": "e1", "activity_key": GRID_IN, "scope": "2", "ghg_category": "2.1",
                "region": "IN", "value": "1000", "unit": "kWh", "scope2_view": "location"}], "AR6"),
    inventory([{"record_id": "x", "activity_key": "no.such.factor", "scope": "1",
                "ghg_category": "1.1", "region": "IN", "value": "5", "unit": "kg"}]),
])
def test_inventory_runs_match_the_server(body):
    server = client.post("/v1/inventory/calculate", json=body)
    status, answer = browser("POST", "/v1/inventory/calculate", body=body)
    assert status == server.status_code
    assert answer == server.json()


@pytest.mark.parametrize("body", [
    {"method": "enteric_fermentation", "dairy_cattle": 100, "other_cattle": 50},
    {"method": "enteric_fermentation", "dairy_cattle": 100, "gwp_set": "AR6"},
    {"method": "managed_soils", "synthetic_fertiliser_n": 10000, "leaching_occurs": False},
    {"method": "lime_and_urea", "urea": 100},
    {"method": "no_such_method"},
])
def test_method_runs_match_the_server(body):
    server = client.post("/v1/methods/calculate", json=body)
    status, answer = browser("POST", "/v1/methods/calculate", body=body)
    assert status == server.status_code
    if status == 200:
        assert answer == server.json()


def test_an_invalid_inventory_is_refused_not_calculated():
    status, answer = browser("POST", "/v1/inventory/calculate", body={"records": "nope"})
    assert status == 422 and answer["detail"]


def test_an_unknown_path_is_not_found():
    assert browser("GET", "/v1/pcf/estimate")[0] == 404


# --- the AI estimate, split around the model call made by the browser ----------

from test_pcf_service import decomposition_dict  # noqa: E402

KETTLE = {"product": "electric kettle", "region": "IN", "details": ""}


def claude_message(payload: dict, stop_reason: str = "end_turn") -> dict:
    """A Messages API response as the browser SDK's toJSON gives it."""
    return {"id": "msg_test", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
            "stop_reason": stop_reason,
            "content": [{"type": "thinking", "thinking": "", "signature": "x"},
                        {"type": "text", "text": json.dumps(payload, default=str)}],
            "usage": {"input_tokens": 10, "output_tokens": 10}}


def test_the_browser_asks_the_model_exactly_what_the_server_would():
    status, answer = browser("POST", "/v1/pcf/browser-request", body=KETTLE)
    assert status == 200 and answer["assistant"] == "INSITY EDGE AI"
    params = answer["params"]
    assert params["model"] == "claude-opus-5-5"
    assert params["thinking"] == {"type": "adaptive"}
    assert params["output_config"]["format"]["type"] == "json_schema"
    assert answer["use_beta"] and params["fallbacks"] == "default"
    # Visitor text arrives fenced, never as an instruction.
    assert "<<<VISITOR_PRODUCT>>>\nelectric kettle" in params["messages"][0]["content"]


def test_the_answer_is_computed_by_the_engine_not_the_model():
    status, answer = browser("POST", "/v1/pcf/browser-assemble",
                             body={"request": KETTLE, "message": claude_message(decomposition_dict())})
    assert status == 200, answer
    assert answer["lines"] and answer["totals"]
    assert answer["method"]["assistant"] == "INSITY EDGE AI"


def test_a_refused_or_non_product_answer_is_shown_under_the_brand():
    refused = claude_message(decomposition_dict(), stop_reason="refusal")
    status, answer = browser("POST", "/v1/pcf/browser-assemble",
                             body={"request": KETTLE, "message": refused})
    assert status == 422 and answer["detail"]["code"] == "ai_refused"
    assert "INSITY EDGE AI" in answer["detail"]["message"]
    assert "Claude" not in answer["detail"]["message"]

    not_product = decomposition_dict()
    not_product["product"]["is_product"] = False
    not_product["lines"] = []
    status, answer = browser("POST", "/v1/pcf/browser-assemble",
                             body={"request": KETTLE, "message": claude_message(not_product)})
    assert status == 422 and answer["detail"]["code"] == "not_a_product"


def gemini_reply(payload: dict, finish: str = "STOP") -> dict:
    """A generateContent response, as the browser receives it."""
    return {"candidates": [{"finishReason": finish, "content": {"parts": [
        {"text": "thinking", "thought": True},
        {"text": json.dumps(payload, default=str)}]}}]}


def test_the_browser_asks_gemini_what_the_server_would():
    status, answer = browser("POST", "/v1/pcf/gemini-request", body=KETTLE)
    assert status == 200 and answer["models"][0] == "gemini-3.8-flash"
    assert answer["body"]["generationConfig"]["responseMimeType"] == "application/json"
    assert "<<<VISITOR_PRODUCT>>>\nelectric kettle" in answer["body"]["contents"][0]["parts"][0]["text"]


def test_a_gemini_answer_is_computed_by_the_engine():
    status, answer = browser("POST", "/v1/pcf/gemini-assemble", body={
        "request": KETTLE, "status": 200, "model": "gemini-3.8-flash",
        "data": gemini_reply(decomposition_dict())})
    assert status == 200, answer
    assert answer["lines"] and answer["method"]["assistant"] == "INSITY EDGE AI"


def test_a_gemini_failure_is_shown_under_the_brand():
    status, answer = browser("POST", "/v1/pcf/gemini-assemble", body={
        "request": KETTLE, "status": 429, "model": "gemini-3.8-flash", "data": {"error": {}}})
    assert status == 429 and answer["detail"]["code"] == "ai_quota_exceeded"
    assert "Gemini" not in answer["detail"]["message"]
