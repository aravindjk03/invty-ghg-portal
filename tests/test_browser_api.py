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
