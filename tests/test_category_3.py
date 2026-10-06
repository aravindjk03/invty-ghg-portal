"""Scope 3 Category 3: fuel- and energy-related activity not in Scope 1 or 2.

Two things belong here that nobody should have to type in twice: the upstream
emissions of every fuel already recorded in Scope 1, and the electricity lost
between the power station and the meter that the site paid for and never
received.

The portal claimed to derive these and did not. These tests hold the claim.

EVERY NUMBER HERE IS A FIXTURE, chosen to be checkable by hand.
"""
from decimal import Decimal

import pytest

pytest.importorskip("pydantic")

from service.inventory import wtt_counterparts
from service.inventory_api import InventoryRecord, InventoryRequest, calculate_inventory

DIESEL_LITRES = "desnz.2025.1_101_1012_8"
INDIAN_GRID = "cea.grid.weighted_average_incl_res.incl_imports.2025_26"


def diesel(**kw):
    base = dict(record_id="d", activity_key=DIESEL_LITRES, scope="1",
                ghg_category="1.1", region="UK", value=Decimal(45000), unit="L")
    base.update(kw)
    return InventoryRecord(**base)


def electricity(**kw):
    base = dict(record_id="e", activity_key=INDIAN_GRID, scope="2",
                ghg_category="2.1", region="IN", value=Decimal(576000), unit="kWh")
    base.update(kw)
    return InventoryRecord(**base)


def run(*records, **kw):
    request = InventoryRequest(records=list(records), gwp_set="AR5",
                               reporting_year=2025, **kw)
    return calculate_inventory(request, gwp_source="fixture")


def category(response, code="3.3") -> Decimal:
    return Decimal(response.totals.scope3_by_category.get(code, "0"))


# --- the upstream emissions of a fuel already recorded ------------------------

def test_a_fuel_in_scope_1_brings_its_upstream_emissions_with_it():
    """A plant that has recorded its diesel has already said everything needed."""
    response = run(diesel())
    assert category(response) > 0
    kinds = [item.kind for item in response.derived]
    assert kinds == ["wtt_fuel"]


def test_the_upstream_factor_is_the_one_published_in_the_SAME_unit():
    """DESNZ publishes one activity per unit and they all share a name. Matching
    on the name alone would hand a row recorded in litres the factor published
    per tonne."""
    pairs = wtt_counterparts()
    assert pairs[DIESEL_LITRES] == "desnz.2025.11_101_1012_8"


def test_upstream_is_smaller_than_combustion_but_not_negligible():
    # Getting diesel to the gate is roughly a fifth of burning it. A derived
    # line far outside that band means the wrong factor was attached.
    response = run(diesel())
    ratio = category(response) / Decimal(response.totals.scope1)
    assert Decimal("0.1") < ratio < Decimal("0.4")


def test_a_fuel_with_no_published_upstream_factor_says_so():
    response = run(diesel(activity_key="ipcc.2006.energy.bagasse"))
    reasons = [item for item in response.not_derived if item.kind == "wtt_fuel"]
    assert reasons and "no published well-to-tank factor" in reasons[0].reason
    # and it names the fuel, so a reader can tell which of their rows it was
    assert "bagasse" in reasons[0].reason
    assert not [item for item in response.derived if item.kind == "wtt_fuel"]


# --- what the grid lost on the way --------------------------------------------

def test_transmission_losses_use_the_generation_needed_not_the_consumption():
    """To deliver C at a loss rate L the grid must generate C / (1 - L), so the
    loss is C x L / (1 - L). The naive C x L understates, and India's rate is
    high enough for that to matter."""
    response = run(electricity(), td_loss_rate=Decimal("0.17"),
                   td_loss_rate_source="CEA, fixture")
    lost = next(item for item in response.derived if item.kind == "td_losses")
    # 576000 x 0.17 / 0.83 = 117975.9..., not 576000 x 0.17 = 97920.
    assert lost.basis.startswith("117,976 kWh")
    # The sentence is rounded; the line itself is not.
    assert "79645.41" in response.totals.scope3_by_category["3.3"]


def test_no_loss_rate_means_no_line_and_a_reason():
    response = run(electricity())
    assert not [item for item in response.derived if item.kind == "td_losses"]
    reasons = [item for item in response.not_derived if item.kind == "td_losses"]
    assert reasons and "loss rate published for your grid" in reasons[0].reason


def test_a_loss_rate_with_no_source_is_not_used():
    """The same rule the rest of the engine follows: a number with nowhere to
    trace it to is indistinguishable from an invented one."""
    response = run(electricity(), td_loss_rate=Decimal("0.17"))
    assert not [item for item in response.derived if item.kind == "td_losses"]


def test_a_market_instrument_row_does_not_get_its_own_loss_line():
    """Location-based and market-based are two views of the SAME kilowatt
    hours. Deriving losses from both would count the loss twice."""
    response = run(electricity(scope2_view="market"),
                   td_loss_rate=Decimal("0.17"), td_loss_rate_source="CEA, fixture")
    assert not [item for item in response.derived if item.kind == "td_losses"]


def test_the_upstream_of_grid_electricity_is_reported_as_not_derivable():
    response = run(electricity())
    reasons = [item for item in response.not_derived if item.kind == "wtt_electricity"]
    assert reasons and "No published set" in reasons[0].reason


# --- the derived lines are the engine's, not a second calculation -------------

def test_derived_lines_are_calculated_by_the_engine_like_any_other():
    response = run(diesel(), electricity(), td_loss_rate=Decimal("0.17"),
                   td_loss_rate_source="CEA, fixture")
    derived_ids = {item.record_id for item in response.derived}
    for line in response.lines:
        if line.record_id in derived_ids:
            assert line.status == "calculated"
            assert line.factor_source
            assert line.ghg_category == "3.3"


def test_deriving_does_not_change_scope_1_or_scope_2():
    """Category 3 sits beside them, never inside them."""
    plain = run(diesel(), electricity())
    with_losses = run(diesel(), electricity(), td_loss_rate=Decimal("0.17"),
                      td_loss_rate_source="CEA, fixture")
    assert plain.totals.scope1 == with_losses.totals.scope1
    assert plain.totals.scope2_location == with_losses.totals.scope2_location
    assert category(with_losses) > category(plain)


def test_a_refrigerant_leak_is_not_asked_for_a_well_to_tank_factor():
    """A fugitive release has upstream emissions too, but they belong to
    Category 1 as a purchased good. Reporting "no well-to-tank factor covers
    this fuel" about a cylinder of HFC-134a is noise about something that was
    never missing."""
    response = run(diesel(
        activity_key="desnz.2025.14_204_2060_3", ghg_category="1.4"))
    assert not [item for item in response.not_derived if item.kind == "wtt_fuel"]
    assert not [item for item in response.derived if item.kind == "wtt_fuel"]


# --- the upstream of electricity, which nobody publishes for India ------------

def test_a_supplied_upstream_factor_for_electricity_is_used_and_cited():
    response = run(electricity(), electricity_wtt_factor=Decimal("0.09"),
                   electricity_wtt_source="DISCOM disclosure 2025")
    # 576000 kWh x 0.09 = 51840 kgCO2e, by hand.
    assert category(response) == Decimal("51840.00")
    line = next(item for item in response.lines
                if item.record_id.endswith("::wtt-elec"))
    assert "Supplied by the reporting company" in line.factor_source
    assert "DISCOM disclosure 2025" in line.factor_source


def test_without_a_source_the_upstream_of_electricity_is_left_out_and_said_to_be():
    response = run(electricity(), electricity_wtt_factor=Decimal("0.09"))
    assert not [item for item in response.derived if item.kind == "wtt_electricity"]
    reasons = [item for item in response.not_derived if item.kind == "wtt_electricity"]
    assert reasons and "with its source" in reasons[0].reason


def test_a_market_row_does_not_get_its_own_upstream_line():
    """Location and market are two views of the same kilowatt hours."""
    response = run(electricity(scope2_view="market"),
                   electricity_wtt_factor=Decimal("0.09"),
                   electricity_wtt_source="DISCOM disclosure 2025")
    assert not [item for item in response.derived if item.kind == "wtt_electricity"]


def test_an_inventory_with_no_electricity_says_nothing_about_its_upstream():
    response = run(diesel())
    assert not [item for item in response.not_derived if item.kind == "wtt_electricity"]


def test_a_derived_line_never_takes_an_id_another_line_is_using():
    """A line's id is how the browser puts a figure back on a row. Two lines
    with one id means a row quietly showing somebody else's number, and record
    ids come from the browser — they could be anything, including something
    that looks exactly like a derived one."""
    response = run(diesel(record_id="a"), diesel(record_id="a::wtt"))
    ids = [line.record_id for line in response.lines]
    assert len(ids) == len(set(ids)), ids
    assert "a::wtt-2" in ids
