"""The methods page and the scope pages must agree on what a method covers.

A source with no factor is not a dead end: the product calculates it as an IPCC
method. Which sources those are is stated twice - beside the methods in
service/methods_api.py, and in the table the browser uses to put a link on the
row. The two drifting apart is how a user ends up told that a cement works
cannot calculate its clinker.
"""
import pathlib
import re

import pytest

pytest.importorskip("pydantic")

from service.methods_api import METHOD_CATALOGUE

BROWSER_TABLE = (pathlib.Path(__file__).resolve().parents[1]
                 / "frontend" / "src" / "data" / "methodSources.ts")


def _browser_routes() -> dict[str, str]:
    text = BROWSER_TABLE.read_text(encoding="utf-8")
    block = text.split("METHOD_FOR_SOURCE: Record<string, MethodKey> = {")[1].split("};")[0]
    return dict(re.findall(r"'([^']+)':\s*'([^']+)'", block))


def _server_routes() -> dict[str, str]:
    return {source: method["key"]
            for method in METHOD_CATALOGUE
            for source in method.get("computes", ())}


def test_both_sides_route_the_same_sources_to_the_same_method():
    server, browser = _server_routes(), _browser_routes()
    assert server == browser, (
        f"only the service routes {sorted(set(server) - set(browser))}; "
        f"only the browser routes {sorted(set(browser) - set(server))}; "
        f"they disagree on "
        f"{ {k: (server[k], browser[k]) for k in set(server) & set(browser) if server[k] != browser[k]} }")


def test_a_routed_source_is_one_with_no_published_factor():
    """A row must not offer a factor and a method at once.

    Both are real answers and they are not the same number, so a row showing
    both leaves the user to guess which one the report used.
    """
    from service.inventory import load_catalogue_map
    mapped = {mapping.catalogue_key for mapping in load_catalogue_map()}
    both = sorted(set(_server_routes()) & mapped)
    assert not both, f"these sources have a published factor AND a method: {both}"


def test_every_routed_source_exists_in_the_catalogue():
    import csv
    catalogue = pathlib.Path(__file__).resolve().parents[1] / "data" / "emission_source_catalogue.csv"
    with catalogue.open(encoding="utf-8", newline="") as handle:
        known = {row["activity_key"] for row in csv.DictReader(handle)}
    unknown = sorted(set(_server_routes()) - known)
    assert not unknown, f"routed sources that are not in the catalogue: {unknown}"
