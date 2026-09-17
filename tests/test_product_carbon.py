"""Product carbon reference: routes, boundaries, tiers and comparability.

Spec: docs/product-carbon-and-mitigation-spec.md

EVERY NUMBER IN THIS FILE IS AN INVENTED TEST FIXTURE. They are round values
chosen so the arithmetic is checkable by hand. None of them is an emission
factor and none may be copied into the registry, the catalogue, or anywhere
else. Real values arrive only through the ingestion pipeline from a named
publication.
"""
import csv
from pathlib import Path

import pytest
from decimal import Decimal

from ghg_core import (ActivityRecord, EmissionFactor, FactorNotFoundError,
                      InMemoryFactorRegistry, calculate)
from ghg_core.errors import (AmbiguousBoundaryError, IncomparableFactorsError,
                             ProductRouteRequiredError)
from ghg_core.factors import (ALLOCATION_METHODS, CRADLE_TO_GATE,
                              CRADLE_TO_GRAVE, PCF_CLASS_FALLBACK,
                              PCF_EEIO_FALLBACK, PHYSICAL_BASIS,
                              SYSTEM_BOUNDARIES, TIER_A, TIER_B, TIER_C, Flag,
                              InMemoryFactorRegistry as _Reg,
                              assert_comparable)
from conftest import ef

CATALOGUE = (Path(__file__).resolve().parents[1] / "data"
             / "product_carbon_catalogue.csv")


def pf(**kw):
    """A product factor fixture with the PCF fields defaulted."""
    base = dict(gas="CO2", numerator_unit="kgCO2e", denominator_unit="kg",
                ef_basis=PHYSICAL_BASIS, system_boundary=CRADLE_TO_GATE,
                allocation_method="subdivision")
    base.update(kw)
    return ef(**base)


@pytest.fixture
def pcf_registry():
    r = InMemoryFactorRegistry()
    # Two routes for the same material, deliberately far apart - which is the
    # whole reason a material name cannot be a key.
    r.add(pf(version_id="nh3-smr", activity_key="pcf.chem.ammonia.smr",
             region="IN", reference_year=2026, value="2",
             production_route="smr"))
    r.add(pf(version_id="nh3-coal", activity_key="pcf.chem.ammonia.coal_gasification",
             region="IN", reference_year=2026, value="4",
             production_route="coal_gasification"))
    return r


# --- the keying rule -------------------------------------------------------

def test_product_request_without_a_route_raises(pcf_registry):
    """A material name is never a key."""
    with pytest.raises(ProductRouteRequiredError) as e:
        pcf_registry.resolve("pcf.chem.ammonia.smr", "IN", 2026, "CO2")
    assert "production_route" in str(e.value)


def test_route_selects_the_right_row(pcf_registry):
    smr = pcf_registry.resolve("pcf.chem.ammonia.smr", "IN", 2026, "CO2",
                               production_route="smr")
    coal = pcf_registry.resolve("pcf.chem.ammonia.coal_gasification", "IN", 2026,
                                "CO2", production_route="coal_gasification")
    assert smr.factor.value == Decimal("2")
    assert coal.factor.value == Decimal("4")
    assert Flag.EXACT in smr.flags


def test_factor_without_a_route_is_rejected_at_construction():
    with pytest.raises(ValueError, match="no production_route"):
        pf(version_id="v", activity_key="pcf.chem.ammonia.smr", region="IN",
           reference_year=2026, value="1", production_route=None)


def test_factor_without_a_boundary_is_rejected_at_construction():
    with pytest.raises(ValueError, match="no system_boundary"):
        pf(version_id="v", activity_key="pcf.chem.ammonia.smr", region="IN",
           reference_year=2026, value="1", production_route="smr",
           system_boundary=None)


def test_non_product_factors_still_need_no_route():
    """The route requirement must not leak onto fuel and energy factors."""
    f = ef(version_id="d", activity_key="fuel.diesel.stationary", region="IN",
           reference_year=2026, gas="CO2", value="2.5", numerator_unit="kgCO2",
           denominator_unit="L", ef_basis=PHYSICAL_BASIS)
    assert f.production_route is None
    assert f.tier is None


# --- schema validation -----------------------------------------------------

def test_invalid_boundary_is_rejected():
    with pytest.raises(ValueError, match="system_boundary must be one of"):
        pf(version_id="v", activity_key="pcf.chem.x.y", region="IN",
           reference_year=2026, value="1", production_route="y",
           system_boundary="well_to_wheel")


def test_invalid_allocation_method_is_rejected():
    with pytest.raises(ValueError, match="allocation_method must be one of"):
        pf(version_id="v", activity_key="pcf.chem.x.y", region="IN",
           reference_year=2026, value="1", production_route="y",
           allocation_method="whatever_seemed_reasonable")


def test_unstated_allocation_is_legitimate():
    """A source that declares nothing must not be assumed to have used mass."""
    f = pf(version_id="v", activity_key="pcf.chem.x.y", region="IN",
           reference_year=2026, value="1", production_route="y",
           allocation_method="unstated")
    assert f.allocation_method == "unstated"


# --- tier derivation and the fallback ladder -------------------------------

def test_tier_is_derived_from_the_key():
    a = pf(version_id="a", activity_key="pcf.chem.ammonia.smr", region="IN",
           reference_year=2026, value="1", production_route="smr")
    b = pf(version_id="b", activity_key="pcf.class.chemicals_average",
           region="IN", reference_year=2026, value="1",
           production_route="class_average", allocation_method="unstated")
    c = pf(version_id="c", activity_key="pcf.proxy.eeio_spend", region="IN",
           reference_year=2026, value="1", production_route="eeio_spend",
           denominator_unit="INR", allocation_method="economic")
    assert (a.tier, b.tier, c.tier) == (TIER_A, TIER_B, TIER_C)


def test_falls_back_to_class_average_and_flags_route_unknown(pcf_registry):
    pcf_registry.add(pf(version_id="cls", activity_key="pcf.class.chemicals_average",
                        region="IN", reference_year=2026, value="3",
                        production_route="class_average",
                        allocation_method="unstated"))
    res = pcf_registry.resolve("pcf.chem.methanol.coal", "IN", 2026, "CO2",
                               production_route="coal")
    assert Flag.ROUTE_UNKNOWN in res.flags
    assert res.factor.tier == TIER_B
    assert res.is_proxy


def test_falls_back_to_eeio_and_flags_it(pcf_registry):
    pcf_registry.add(pf(version_id="eeio", activity_key="pcf.proxy.eeio_spend",
                        region="IN", reference_year=2026, value="0.5",
                        production_route="eeio_spend", denominator_unit="INR",
                        allocation_method="economic"))
    res = pcf_registry.resolve("pcf.chem.methanol.coal", "IN", 2026, "CO2",
                               production_route="coal")
    assert Flag.EEIO_PROXY in res.flags
    assert res.factor.tier == TIER_C


def test_class_average_is_preferred_over_eeio(pcf_registry):
    """Tier B must be exhausted before Tier C."""
    pcf_registry.add(pf(version_id="cls", activity_key="pcf.class.chemicals_average",
                        region="IN", reference_year=2026, value="3",
                        production_route="class_average",
                        allocation_method="unstated"))
    pcf_registry.add(pf(version_id="eeio", activity_key="pcf.proxy.eeio_spend",
                        region="IN", reference_year=2026, value="0.5",
                        production_route="eeio_spend", denominator_unit="INR",
                        allocation_method="economic"))
    res = pcf_registry.resolve("pcf.chem.methanol.coal", "IN", 2026, "CO2",
                               production_route="coal")
    assert res.factor.tier == TIER_B


def test_tier_c_never_presents_as_tier_a(pcf_registry):
    """The flag is the only thing standing between a screening estimate and a
    number the reader believes was measured."""
    pcf_registry.add(pf(version_id="eeio", activity_key="pcf.proxy.eeio_spend",
                        region="IN", reference_year=2026, value="0.5",
                        production_route="eeio_spend", denominator_unit="INR",
                        allocation_method="economic"))
    res = pcf_registry.resolve("pcf.metal.steel.bf_bof", "IN", 2026, "CO2",
                               production_route="bf_bof")
    assert Flag.EXACT not in res.flags
    assert res.factor.tier != TIER_A


def test_missing_material_raises_and_never_returns_zero(pcf_registry):
    with pytest.raises(FactorNotFoundError) as e:
        pcf_registry.resolve("pcf.chem.unobtanium.synthesis", "IN", 2026, "CO2",
                             production_route="synthesis")
    assert "NOT zero" in str(e.value)


def test_exact_route_beats_the_class_average(pcf_registry):
    """A real row must never be shadowed by a fallback."""
    pcf_registry.add(pf(version_id="cls", activity_key="pcf.class.chemicals_average",
                        region="IN", reference_year=2026, value="3",
                        production_route="class_average",
                        allocation_method="unstated"))
    res = pcf_registry.resolve("pcf.chem.ammonia.smr", "IN", 2026, "CO2",
                               production_route="smr")
    assert res.factor.value == Decimal("2")
    assert Flag.EXACT in res.flags


# --- system boundary -------------------------------------------------------

def test_ambiguous_boundary_raises():
    """Two boundaries for one route is not something to choose between."""
    r = InMemoryFactorRegistry()
    for vid, boundary, val in (("ctg", CRADLE_TO_GATE, "6"),
                               ("ctgr", CRADLE_TO_GRAVE, "30")):
        r.add(pf(version_id=vid, activity_key="pcf.auto.vehicle.bev_compact",
                 region="IN", reference_year=2026, value=val,
                 production_route="bev_compact", system_boundary=boundary,
                 denominator_unit="unit"))
    with pytest.raises(AmbiguousBoundaryError):
        r.resolve("pcf.auto.vehicle.bev_compact", "IN", 2026, "CO2",
                  production_route="bev_compact")


def test_pinning_the_boundary_resolves_it():
    r = InMemoryFactorRegistry()
    for vid, boundary, val in (("ctg", CRADLE_TO_GATE, "6"),
                               ("ctgr", CRADLE_TO_GRAVE, "30")):
        r.add(pf(version_id=vid, activity_key="pcf.auto.vehicle.bev_compact",
                 region="IN", reference_year=2026, value=val,
                 production_route="bev_compact", system_boundary=boundary,
                 denominator_unit="unit"))
    res = r.resolve("pcf.auto.vehicle.bev_compact", "IN", 2026, "CO2",
                    production_route="bev_compact",
                    system_boundary=CRADLE_TO_GRAVE)
    assert res.factor.value == Decimal("30")


# --- comparability guard ---------------------------------------------------

def test_refuses_to_compare_across_boundaries():
    """A cradle-to-gate BEV against a cradle-to-grave ICE misleads every reader."""
    bev = pf(version_id="bev", activity_key="pcf.auto.vehicle.bev_compact",
             region="IN", reference_year=2026, value="6",
             production_route="bev_compact", denominator_unit="unit")
    ice = pf(version_id="ice", activity_key="pcf.auto.vehicle.ice_petrol_hatchback",
             region="IN", reference_year=2026, value="4",
             production_route="ice_petrol_hatchback", denominator_unit="unit",
             system_boundary=CRADLE_TO_GRAVE)
    with pytest.raises(IncomparableFactorsError, match="system boundaries"):
        assert_comparable([bev, ice])


def test_refuses_to_compare_across_allocation_methods():
    a = pf(version_id="a", activity_key="pcf.chem.ethylene.naphtha_cracking",
           region="IN", reference_year=2026, value="2",
           production_route="naphtha_cracking", allocation_method="mass")
    b = pf(version_id="b", activity_key="pcf.chem.ethylene.ethane_cracking",
           region="IN", reference_year=2026, value="1",
           production_route="ethane_cracking", allocation_method="economic")
    with pytest.raises(IncomparableFactorsError, match="allocation methods"):
        assert_comparable([a, b])


def test_refuses_to_compare_across_tiers():
    a = pf(version_id="a", activity_key="pcf.metal.steel.eaf_scrap", region="IN",
           reference_year=2026, value="1", production_route="eaf_scrap")
    c = pf(version_id="c", activity_key="pcf.class.metals_average", region="IN",
           reference_year=2026, value="2", production_route="class_average")
    with pytest.raises(IncomparableFactorsError, match="data tiers"):
        assert_comparable([a, c])


def test_like_for_like_comparison_is_allowed():
    rows = [
        pf(version_id="bf", activity_key="pcf.metal.steel.bf_bof", region="IN",
           reference_year=2026, value="2", production_route="bf_bof"),
        pf(version_id="eaf", activity_key="pcf.metal.steel.eaf_scrap", region="IN",
           reference_year=2026, value="1", production_route="eaf_scrap"),
    ]
    assert_comparable(rows)          # must not raise


def test_a_single_factor_is_trivially_comparable():
    assert_comparable([pf(version_id="a", activity_key="pcf.metal.steel.bf_bof",
                          region="IN", reference_year=2026, value="2",
                          production_route="bf_bof")])


# --- end to end through the engine ----------------------------------------

def _record(route, value="1000"):
    return ActivityRecord(
        record_id="r1", activity_key=f"pcf.chem.ammonia.{route}", scope="3",
        ghg_category="3.1", region="IN", value=Decimal(value), unit="kg",
        production_route=route)


def test_calculate_uses_the_requested_route(pcf_registry, gwp):
    """The route must survive the trip through calculate(), not just resolve()."""
    smr = calculate([_record("smr")], pcf_registry, gwp, reporting_year=2026)
    coal = calculate([_record("coal_gasification")], pcf_registry, gwp,
                     reporting_year=2026)
    assert smr.totals.scope3 == Decimal("2000")     # 1000 kg x 2
    assert coal.totals.scope3 == Decimal("4000")    # 1000 kg x 4
    assert coal.totals.scope3 == smr.totals.scope3 * 2


def test_calculate_carries_provenance_to_the_line(pcf_registry, gwp):
    run = calculate([_record("smr")], pcf_registry, gwp, reporting_year=2026)
    line = run.line_results[0]
    assert line.factor_source
    assert line.factor_reference_year == 2026
    assert line.status == "calculated"


def test_calculate_without_a_route_excludes_the_record_and_never_counts_it(
        pcf_registry, gwp):
    """A route-less product record must not quietly pick a route, and must not
    quietly become zero either.

    One malformed record does not kill an entire inventory run - it lands in
    excluded_records, exactly like a missing factor, so the UI renders it as
    'Factor unavailable' rather than as a number.
    """
    bad = ActivityRecord(
        record_id="r1", activity_key="pcf.chem.ammonia.smr", scope="3",
        ghg_category="3.1", region="IN", value=Decimal("1000"), unit="kg")

    run = calculate([bad], pcf_registry, gwp, reporting_year=2026)

    assert run.line_results[0].status == "unavailable"
    assert run.line_results[0].factor_value is None
    assert run.excluded_records[0]["record_id"] == "r1"
    assert run.excluded_records[0]["reason"] == "ProductRouteRequiredError"
    # The record contributed nothing - it was excluded, not silently valued.
    assert run.totals.scope3 == Decimal("0")


def test_product_calculation_is_deterministic(pcf_registry, gwp):
    a = calculate([_record("smr")], pcf_registry, gwp, reporting_year=2026)
    b = calculate([_record("smr")], pcf_registry, gwp, reporting_year=2026)
    assert a.run_id == b.run_id
    assert a.totals.scope3 == b.totals.scope3


# --- the shipped catalogue must agree with the code -----------------------

def catalogue_rows():
    if not CATALOGUE.exists():
        pytest.skip("product carbon catalogue not present in this checkout")
    with CATALOGUE.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def test_catalogue_keys_all_map_to_a_known_family():
    """Every material must reach a Tier B fallback. A key whose family is not
    in PCF_CLASS_FALLBACK would silently skip Tier B and land on the EEIO
    proxy - a quiet two-tier downgrade."""
    orphans = []
    for row in catalogue_rows():
        key = row["material_key"]
        if _Reg._is_fallback_key(key):
            continue
        family = _Reg._family_of(key)
        if family not in PCF_CLASS_FALLBACK:
            orphans.append(key)
    assert not orphans, f"keys with no class fallback: {orphans}"


def test_catalogue_declares_valid_boundaries_and_allocation():
    bad = []
    for row in catalogue_rows():
        if row["system_boundary"] not in SYSTEM_BOUNDARIES:
            bad.append((row["material_key"], "boundary", row["system_boundary"]))
        if row["allocation_method_expected"] not in ALLOCATION_METHODS:
            bad.append((row["material_key"], "allocation",
                        row["allocation_method_expected"]))
    assert not bad, bad


def test_catalogue_tier_matches_the_key_derived_tier():
    """tier_target in the CSV must agree with what EmissionFactor.tier derives."""
    mismatches = []
    for row in catalogue_rows():
        key, declared = row["material_key"], row["tier_target"]
        if key.startswith("pcf.proxy."):
            derived = TIER_C
        elif key.startswith("pcf.class."):
            derived = TIER_B
        else:
            derived = TIER_A
        if declared != derived:
            mismatches.append((key, declared, derived))
    assert not mismatches, mismatches


def test_catalogue_ships_the_fallback_rows_the_ladder_needs():
    keys = {r["material_key"] for r in catalogue_rows()}
    missing = set(PCF_CLASS_FALLBACK.values()) - keys
    assert not missing, f"class-average rows missing: {missing}"
    assert PCF_EEIO_FALLBACK in keys


def test_catalogue_carries_no_coefficient_values():
    """The catalogue is a taxonomy, not a factor table. A value column
    appearing here would be an invented emission factor."""
    rows = catalogue_rows()
    assert rows, "catalogue is empty"
    forbidden = {"value", "factor_value", "kgco2e", "intensity", "co2e"}
    present = {c.lower() for c in rows[0].keys()}
    assert not (forbidden & present), f"value column present: {forbidden & present}"
    assert all(r["status"] == "TO_INGEST" for r in rows)


def test_catalogue_every_row_names_a_source():
    unsourced = [r["material_key"] for r in catalogue_rows()
                 if not r["primary_source"].strip()]
    assert not unsourced, f"rows with no source: {unsourced}"


def test_catalogue_has_no_duplicate_keys():
    keys = [r["material_key"] for r in catalogue_rows()]
    dupes = {k for k in keys if keys.count(k) > 1}
    assert not dupes, f"duplicate keys: {dupes}"


def test_catalogue_excludes_non_redistributable_sources():
    """We have no ecoinvent licence and this is a public tool."""
    banned = ("ecoinvent", "gabi", "sphera")
    offenders = []
    for row in catalogue_rows():
        blob = f"{row['primary_source']} {row['india_specific_source']}".lower()
        for name in banned:
            if name in blob:
                offenders.append((row["material_key"], name))
    assert not offenders, offenders
