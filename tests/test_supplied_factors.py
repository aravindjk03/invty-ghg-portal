"""A factor the reporting company supplies for its own inventory.

Some numbers are not published and never will be. A renewable power purchase
agreement, a green tariff and a retired I-REC are priced by contract, and the
GHG Protocol's Scope 2 Guidance asks for that contractual rate: reporting a PPA
at grid intensity is wrong, not conservative. A supplier's own EPD for steel or
cement is the same situation.

So the engine takes the customer's number, under conditions these tests hold:
it is filed under a key of its own, it carries the citation the customer gave,
and it is refused outright without one.

EVERY NUMBER HERE IS AN INVENTED FIXTURE, chosen to be checkable by hand.
"""
from decimal import Decimal

import pytest

pytest.importorskip("pydantic")

from ghg_core.engine import ActivityRecord
from service.inventory import SUPPLIED_PREFIX, run_inventory, supplied_factor
from service.inventory_api import InventoryRecord, InventoryRequest, calculate_inventory


def record(record_id="r1", value="1000", unit="kWh", **kw):
    # The engine's own key for the Indian grid, which is what the browser sends
    # once the catalogue map has joined the source to a published factor.
    base = dict(record_id=record_id,
                activity_key="cea.grid.weighted_average_incl_res.incl_imports.2025_26",
                scope="2",
                ghg_category="2.1", region="IN", value=value, unit=unit)
    base.update(kw)
    return InventoryRecord(**base)


def run(*records, year=2025):
    return calculate_inventory(
        InventoryRequest(records=list(records), gwp_set="AR5", reporting_year=year),
        gwp_source="fixture")


def test_a_supplied_factor_is_used_and_named_as_the_company_s_own():
    response = run(record(supplied_factor=Decimal("0.05"),
                          supplied_factor_source="Tata Power PPA 2025-26, clause 4"))
    line = response.lines[0]
    # 1000 kWh x 0.05 kgCO2e/kWh = 50, by hand.
    assert line.emissions_kgco2e == "50.00"
    assert "Supplied by the reporting company" in line.factor_source
    assert "clause 4" in line.factor_source


def test_a_supplied_factor_without_a_source_is_refused_not_ignored():
    """Silently dropping it would report zero while the customer believed
    their own number had been used."""
    with pytest.raises(ValueError) as error:
        run(record(supplied_factor=Decimal("0.05")))
    assert "where it came from" in str(error.value)


def test_one_row_s_contract_rate_cannot_resolve_for_another_row():
    response = run(
        record("r1", supplied_factor=Decimal("0.05"),
               supplied_factor_source="PPA A"),
        record("r2", supplied_factor=Decimal("0.90"),
               supplied_factor_source="Residual mix B"),
    )
    by_id = {line.record_id: line for line in response.lines}
    assert by_id["r1"].emissions_kgco2e == "50.00"
    assert by_id["r2"].emissions_kgco2e == "900.00"
    assert by_id["r1"].activity_key == f"{SUPPLIED_PREFIX}r1"
    assert by_id["r2"].activity_key == f"{SUPPLIED_PREFIX}r2"


def test_a_supplied_factor_does_not_survive_into_the_next_run():
    """It belongs to the company that signed the contract, not to the process."""
    run(record(supplied_factor=Decimal("0.05"), supplied_factor_source="PPA A"))

    from service.inventory import load_registry
    registry, _ = load_registry()
    assert not [f for f in registry if f.activity_key.startswith(SUPPLIED_PREFIX)]


def test_a_supplied_factor_never_claims_to_be_published():
    made = supplied_factor(
        ActivityRecord(record_id="r1", activity_key="x", scope="2", ghg_category="2.1",
                       region="IN", value=Decimal(1), unit="kWh"),
        Decimal("0.05"), "kWh", "PPA A", 2025)
    assert made.factor_set_id == "supplied"
    assert made.source_name == "Supplied by the reporting company"
    assert made.source_url == ""


def test_a_published_factor_still_has_to_name_its_page():
    """The rule that stopped unsourced factors is relaxed only for the
    company's own numbers, which are marked as such."""
    from ghg_core.factors import EmissionFactor, PHYSICAL_BASIS
    with pytest.raises(ValueError) as error:
        EmissionFactor(
            version_id="v1", activity_key="a", region="IN", reference_year=2025,
            gas="CO2", value=Decimal(1), numerator_unit="kgCO2", denominator_unit="kWh",
            ef_basis=PHYSICAL_BASIS, source_name="Somebody", source_table_ref="Table 1",
            source_url="", factor_set_id="desnz-2025")
    assert "has no source URL" in str(error.value)


def test_a_row_with_a_published_factor_is_unaffected():
    response = run(record())
    assert response.lines[0].emissions_kgco2e != "0"
    assert "Supplied by" not in (response.lines[0].factor_source or "")
