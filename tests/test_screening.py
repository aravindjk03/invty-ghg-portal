"""Product lifecycle screening arithmetic.

EVERY NUMBER HERE IS AN INVENTED FIXTURE, chosen so results are checkable by
hand. None is an emission factor.
"""
from decimal import Decimal

import pytest

from ghg_core.screening import (AI_ESTIMATE, END_OF_LIFE, MANUFACTURING,
                                RAW_MATERIALS, USE, VERIFIED_REGISTRY,
                                DISTRIBUTION, ScreeningLine, screen_product)


def line(line_id, stage, qty, low, central, high, unit="kg",
         provenance=AI_ESTIMATE):
    return ScreeningLine(line_id=line_id, stage=stage, component=line_id,
                         quantity=qty, quantity_unit=unit, factor_low=low,
                         factor_central=central, factor_high=high,
                         provenance=provenance)


@pytest.fixture
def kettle():
    return [
        line("steel", RAW_MATERIALS, "2", "1", "2", "3"),        # 2 / 4 / 6
        line("assembly", MANUFACTURING, "10", "0.5", "0.5", "1", unit="kWh"),  # 5 / 5 / 10
        line("shipping", DISTRIBUTION, "100", "0.01", "0.02", "0.03", unit="t.km"),  # 1 / 2 / 3
        line("boiling", USE, "1000", "0.5", "0.8", "1", unit="kWh"),  # 500 / 800 / 1000
        line("landfill", END_OF_LIFE, "2", "0", "0.5", "1"),     # 0 / 1 / 2
    ]


def test_line_emissions_are_quantity_times_factor(kettle):
    r = screen_product(kettle)
    steel = next(lr for lr in r.lines if lr.line.line_id == "steel")
    assert (steel.emissions.low, steel.emissions.central, steel.emissions.high) == \
        (Decimal("2"), Decimal("4"), Decimal("6"))


def test_creation_is_materials_manufacturing_and_distribution(kettle):
    r = screen_product(kettle)
    assert r.creation.central == Decimal("11")     # 4 + 5 + 2
    assert r.creation.low == Decimal("8")          # 2 + 5 + 1
    assert r.creation.high == Decimal("19")        # 6 + 10 + 3


def test_use_phase_is_reported_separately_from_creation(kettle):
    r = screen_product(kettle)
    assert r.use.central == Decimal("800")
    assert r.creation.central + r.use.central != r.creation.central


def test_lifecycle_sums_every_stage_exactly_once(kettle):
    r = screen_product(kettle)
    assert r.lifecycle.central == Decimal("812")    # 11 + 800 + 1
    assert r.lifecycle.central == sum(s.central for s in r.stages.values())


def test_ranges_are_summed_endpoint_to_endpoint(kettle):
    r = screen_product(kettle)
    assert r.lifecycle.low == Decimal("508")       # 8 + 500 + 0
    assert r.lifecycle.high == Decimal("1021")     # 19 + 1000 + 2
    assert r.lifecycle.low <= r.lifecycle.central <= r.lifecycle.high


def test_shares_are_of_the_central_lifecycle_total(kettle):
    r = screen_product(kettle)
    boiling = next(lr for lr in r.lines if lr.line.line_id == "boiling")
    assert boiling.share_of_lifecycle == Decimal("800") / Decimal("812")
    assert sum(lr.share_of_lifecycle for lr in r.lines) == Decimal("1")


def test_hotspots_are_ranked_largest_first(kettle):
    r = screen_product(kettle)
    assert [h.line.line_id for h in r.hotspots] == ["boiling", "assembly", "steel"]


def test_zero_total_gives_no_share_rather_than_dividing_by_zero():
    r = screen_product([line("air", RAW_MATERIALS, "0", "0", "0", "0")])
    assert r.lifecycle.central == 0
    assert r.lines[0].share_of_lifecycle is None
    assert r.verified_share is None
    assert r.hotspots == ()


def test_verified_share_counts_only_registry_factors():
    r = screen_product([
        line("a", RAW_MATERIALS, "1", "3", "3", "3", provenance=VERIFIED_REGISTRY),
        line("b", RAW_MATERIALS, "1", "1", "1", "1"),
    ])
    assert r.verified_share == Decimal("0.75")


def test_all_ai_lines_give_zero_verified_share(kettle):
    assert screen_product(kettle).verified_share == Decimal("0")


def test_decimal_arithmetic_has_no_float_drift():
    r = screen_product([line(f"l{i}", RAW_MATERIALS, "1", "0.1", "0.1", "0.1")
                        for i in range(3)])
    assert r.lifecycle.central == Decimal("0.3")


def test_determinism(kettle):
    a, b = screen_product(kettle), screen_product(list(kettle))
    assert a.lifecycle == b.lifecycle
    assert [h.line.line_id for h in a.hotspots] == [h.line.line_id for h in b.hotspots]


def test_hotspot_ties_break_on_line_id_not_input_order():
    rows = [line("zeta", RAW_MATERIALS, "1", "5", "5", "5"),
            line("alpha", RAW_MATERIALS, "1", "5", "5", "5")]
    assert [h.line.line_id for h in screen_product(rows).hotspots] == ["alpha", "zeta"]
    assert [h.line.line_id for h in screen_product(rows[::-1]).hotspots] == ["alpha", "zeta"]


# --- guards ----------------------------------------------------------------

def test_duplicate_line_ids_are_refused():
    with pytest.raises(ValueError, match="duplicate line_id"):
        screen_product([line("x", RAW_MATERIALS, "1", "1", "1", "1"),
                        line("x", USE, "1", "1", "1", "1")])


@pytest.mark.parametrize("low,central,high", [("2", "1", "3"), ("1", "3", "2")])
def test_inverted_range_is_refused(low, central, high):
    with pytest.raises(ValueError, match="low <= central <= high"):
        line("x", RAW_MATERIALS, "1", low, central, high)


def test_negative_factor_is_refused():
    """Credits and offsets never net against a footprint."""
    with pytest.raises(ValueError, match="cannot be negative"):
        line("x", END_OF_LIFE, "1", "-1", "0", "1")


def test_negative_quantity_is_refused():
    with pytest.raises(ValueError, match="quantity cannot be negative"):
        line("x", RAW_MATERIALS, "-1", "1", "1", "1")


def test_unknown_stage_is_refused():
    with pytest.raises(ValueError, match="stage must be one of"):
        line("x", "vibes", "1", "1", "1", "1")


def test_unknown_unit_is_refused():
    """A factor per 'pieces' or 'tons' is ambiguous about its denominator."""
    with pytest.raises(ValueError, match="quantity_unit must be one of"):
        line("x", RAW_MATERIALS, "1", "1", "1", "1", unit="tons")


def test_unknown_provenance_is_refused():
    with pytest.raises(ValueError, match="provenance must be one of"):
        line("x", RAW_MATERIALS, "1", "1", "1", "1", provenance="trust_me")


def test_stage_shares_are_computed_by_the_engine(kettle):
    r = screen_product(kettle)
    assert r.stage_shares[USE] == Decimal("800") / Decimal("812")
    assert sum(v for v in r.stage_shares.values()) == Decimal("1")


def test_stage_shares_are_none_when_the_total_is_zero():
    r = screen_product([line("air", RAW_MATERIALS, "0", "0", "0", "0")])
    assert all(v is None for v in r.stage_shares.values())
