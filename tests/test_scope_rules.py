"""Scope routing rules from docs/source-catalogue-and-routing.md.

These encode the traps that make a total wrong rather than the code broken.
"""
import csv
from pathlib import Path

import pytest
from decimal import Decimal

from ghg_core import ActivityRecord, calculate
from ghg_core.engine import MEMO_BIOGENIC, SCOPE_1, SCOPE_2, SCOPE_3, MEMO

CATALOGUE = Path(__file__).resolve().parents[1] / "data" / "emission_source_catalogue.csv"


def catalogue_rows():
    if not CATALOGUE.exists():
        pytest.skip("catalogue not present in this checkout")
    with CATALOGUE.open() as f:
        return list(csv.DictReader(f))


def find(key):
    for r in catalogue_rows():
        if r["activity_key"] == key:
            return r
    raise AssertionError(f"{key} missing from the catalogue")


# ---- the routing traps, asserted against the shipped catalogue ----

def test_owned_ev_charged_on_site_is_scope_2():
    r = find("elec.ev_charging_onsite")
    assert r["scope"] == "2", "An EV has no tailpipe combustion; its energy is purchased."


def test_self_generated_and_exported_power_are_not_scope_2():
    for key in ("elec.selfgen_solar_onsite", "elec.selfgen_wind_onsite", "elec.exported"):
        assert find(key)["scope"] == "memo", f"{key} must not be Scope 2"


def test_montreal_protocol_gases_are_outside_the_scopes():
    for key in ("memo.montreal_r22", "memo.montreal_cfc"):
        assert find(key)["scope"] == "memo"


def test_biogenic_memo_exists_for_both_scope_1_and_scope_3():
    assert find("memo.biogenic_co2")["scope"] == "memo"
    assert find("memo.biogenic_co2_scope3")["scope"] == "memo"


def test_biomass_rows_exclude_co2_but_keep_ch4_and_n2o():
    for r in catalogue_rows():
        if r["activity_key"].startswith("fuel.biomass."):
            assert "CO2" not in r["gases"].split(","), r["activity_key"]
            assert "CH4" in r["gases"], r["activity_key"]


def test_process_rows_are_gas_specific_not_blanket():
    """Mineral calcination is CO2 only; nitric/adipic acid are N2O only."""
    assert find("process.cement_clinker")["gases"] == "CO2"
    assert find("process.lime_calcination")["gases"] == "CO2"
    assert find("process.nitric_acid")["gases"] == "N2O"
    assert find("process.adipic_acid")["gases"] == "N2O"
    assert find("process.aluminium_pfc")["gases"] == "PFC"


def test_hydrogen_combustion_does_not_emit_co2():
    assert "CO2" not in find("fuel.hydrogen.grey")["gases"]


def test_acetylene_torch_is_combustion_not_fugitive():
    assert find("combustion.acetylene")["ghg_category"] == "1.1"


def test_aviation_routing():
    """Owned aircraft is Scope 1; a commercial ticket is Scope 3.6."""
    assert find("mobile.atf_own_aircraft")["scope"] == "1"
    assert find("cat6.air_domestic_economy")["ghg_category"] == "3.6"


def test_category_3_is_auto_derived_and_takes_no_user_input():
    for r in catalogue_rows():
        if r["ghg_category"] == "3.3":
            assert r["default_unit"] in ("auto", "kWh"), r["activity_key"]


def test_every_catalogue_row_has_a_scope_and_category():
    for r in catalogue_rows():
        assert r["scope"] in {"1", "2", "3", "memo"}, r
        assert r["ghg_category"], r


def test_catalogue_activity_keys_are_unique():
    keys = [r["activity_key"] for r in catalogue_rows()]
    dupes = {k for k in keys if keys.count(k) > 1}
    assert not dupes, f"duplicate activity_key: {dupes}"


def test_every_catalogue_unit_is_in_the_unit_registry():
    """A unit in the catalogue that the engine cannot parse is a launch blocker."""
    from ghg_core.units import normalise_unit
    from ghg_core.errors import UnknownUnitError
    unknown = set()
    for r in catalogue_rows():
        for u in r["allowed_units"].split("|"):
            u = u.strip()
            if not u or u in ("auto", "varies", "toggle", "fraction", "ratio",
                              "index", "tCO2e", "parcel", "outlet", "pax.km",
                              "head.yr", "m2.yr", "ha", "night", "day", "unit"):
                continue
            try:
                normalise_unit(u)
            except UnknownUnitError:
                unknown.add(u)
    assert not unknown, f"units in the catalogue the engine cannot parse: {sorted(unknown)}"
