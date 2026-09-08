"""Engine tests. These are the ones that prove the NUMBERS, not just the code."""
import pytest
from decimal import Decimal

from ghg_core import (ActivityRecord, calculate, derive_td_losses, intensity,
                      FactorNotFoundError)
from ghg_core.engine import (MEMO_BIOGENIC, MEMO_MONTREAL, MEMO_REMOVALS,
                             MEMO_OFFSETS, DQ_PROXY)
from ghg_core.errors import DoubleCountError

D = Decimal


def rec(**kw):
    base = dict(record_id="r1", region="IN", facility_id="f1")
    base.update(kw)
    return ActivityRecord(**base)


def run(records, registry, gwp, fuel_properties=None, **kw):
    return calculate(records, registry, gwp, reporting_year=2026,
                     fuel_properties=fuel_properties, **kw)


# ---------------------------------------------------------------- stoichiometry
def test_pure_carbon_gives_44_over_12(registry, gwp):
    """1 kg of carbon combusted -> exactly 44/12 kg CO2. Not a measurement."""
    r = run([rec(activity_key="test.pure_carbon", scope="1", ghg_category="1.1",
                 region="GLOBAL", value=1, unit="kg")], registry, gwp,
            gases=("CO2",))
    assert r.totals.scope1 == D(44) / D(12)
    assert round(r.totals.scope1, 4) == D("3.6667")


# ------------------------------------------------------------------- arithmetic
def test_physical_basis_diesel(registry, gwp, fuels):
    """1000 L x 2.5 kgCO2/L = 2500 kg CO2, plus 1000 x 0.001 x 30 CH4 = 30."""
    r = run([rec(activity_key="fuel.diesel.stationary", scope="1",
                 ghg_category="1.1", value=1000, unit="L", fuel_key="diesel")],
            registry, gwp, fuels)
    assert r.totals.scope1 == D("2530")


def test_kilolitre_and_litre_agree(registry, gwp, fuels):
    """The 1000x trap: 1 kL must equal 1000 L, not 1 L."""
    a = run([rec(activity_key="fuel.diesel.stationary", scope="1",
                 ghg_category="1.1", value=1, unit="kL", fuel_key="diesel")],
            registry, gwp, fuels).totals.scope1
    b = run([rec(activity_key="fuel.diesel.stationary", scope="1",
                 ghg_category="1.1", value=1000, unit="L", fuel_key="diesel")],
            registry, gwp, fuels).totals.scope1
    assert a == b


def test_energy_basis_coal_uses_the_ncv(registry, gwp, fuels):
    """1 t of G12 coal at 16.7472 MJ/kg x 0.0946 kgCO2/MJ."""
    r = run([rec(activity_key="fuel.coal.indian_domestic", scope="1",
                 ghg_category="1.1", value=1, unit="t", fuel_key="coal_g12")],
            registry, gwp, fuels, gases=("CO2",))
    expected = D(1000) * D("16.7472") * D("0.0946")
    assert r.totals.scope1 == expected


def test_energy_basis_coal_without_ncv_is_excluded_not_zeroed(registry, gwp):
    r = run([rec(activity_key="fuel.coal.indian_domestic", scope="1",
                 ghg_category="1.1", value=1, unit="t")], registry, gwp)
    assert r.line_results[0].status == "unavailable"
    assert r.totals.scope1 == 0
    assert r.excluded_records[0]["reason"] == "FuelPropertyRequiredError"


# ------------------------------------------------------------- missing / empty
def test_missing_factor_excludes_the_row_and_reports_it(registry, gwp):
    r = run([rec(activity_key="fuel.unobtanium", scope="1", ghg_category="1.1",
                 value=100, unit="kg")], registry, gwp)
    assert r.line_results[0].status == "unavailable"
    assert r.totals.grand_total == 0
    assert r.excluded_records[0]["reason"] == "FactorNotFoundError"


def test_empty_input_is_null_not_zero(registry, gwp, fuels):
    """An incomplete row is excluded from the sum and never produces NaN."""
    rows = [rec(record_id="a", activity_key="fuel.diesel.stationary", scope="1",
                ghg_category="1.1", value=1000, unit="L", fuel_key="diesel"),
            rec(record_id="b", activity_key="fuel.diesel.stationary", scope="1",
                ghg_category="1.1", value=None, unit="L", fuel_key="diesel")]
    r = run(rows, registry, gwp, fuels)
    assert r.totals.scope1 == D("2530")
    assert r.line_results[1].status == "incomplete"


# ------------------------------------------------------------------- scope 2
def test_scope2_location_and_market_are_never_summed(registry, gwp):
    rows = [rec(record_id="loc", activity_key="elec.grid.location", scope="2",
                ghg_category="2.1", value=1000, unit="kWh", scope2_view="location"),
            rec(record_id="mkt", activity_key="elec.grid.market_residual", scope="2",
                ghg_category="2.1", value=1000, unit="kWh", scope2_view="market")]
    r = run(rows, registry, gwp, gases=("CO2",))
    assert r.totals.scope2_location == D("700")
    assert r.totals.scope2_market == D("700")
    # Both computed, but the grand total contains exactly ONE of them.
    assert r.totals.grand_total == D("700")
    assert r.totals.grand_total != r.totals.scope2_location + r.totals.scope2_market


def test_market_view_switches_the_headline(registry, gwp):
    rows = [rec(record_id="loc", activity_key="elec.grid.location", scope="2",
                ghg_category="2.1", value=1000, unit="kWh", scope2_view="location")]
    r = run(rows, registry, gwp, gases=("CO2",), scope2_headline_view="market")
    assert r.totals.scope2_headline == 0          # no market rows entered
    assert r.totals.scope2_location == D("700")   # still reported


def test_indian_units_alias_for_kwh(registry, gwp):
    r = run([rec(activity_key="elec.grid.location", scope="2", ghg_category="2.1",
                 value=1000, unit="units", scope2_view="location")],
            registry, gwp, gases=("CO2",))
    assert r.totals.scope2_location == D("700")


def test_both_views_in_the_headline_is_impossible(registry, gwp):
    with pytest.raises(DoubleCountError):
        run([], registry, gwp, scope2_headline_view="both")


# ------------------------------------------------------------ memo isolation
def test_biogenic_co2_leaves_the_scope_but_ch4_stays(registry, gwp):
    """The half-right version of this rule is worse than none."""
    r = run([rec(activity_key="fuel.biomass.bagasse", scope="1", ghg_category="1.1",
                 value=1000, unit="kg", biogenic_fraction=1,
                 biogenic_basis="energy")], registry, gwp)
    # CO2: 1000 kg x 1.0, entirely biogenic -> memo, not Scope 1
    assert r.totals.memo[MEMO_BIOGENIC] == D("1000")
    # CH4: 1000 x 0.01 x GWP 27 (non-fossil) = 270 -> stays in Scope 1
    assert r.totals.scope1 == D("270")


def test_biogenic_fraction_requires_an_explicit_basis(registry, gwp):
    """A mass basis gives a wrong split for blends. Refuse it."""
    r = run([rec(activity_key="fuel.biomass.bagasse", scope="1", ghg_category="1.1",
                 value=1000, unit="kg", biogenic_fraction="0.5")], registry, gwp)
    assert r.line_results[0].status == "unavailable"
    assert "biogenic_basis" in r.line_results[0].message


@pytest.mark.parametrize("bucket", [MEMO_MONTREAL, MEMO_REMOVALS, MEMO_OFFSETS])
def test_memo_buckets_never_enter_any_scope_total(registry, gwp, fuels, bucket):
    rows = [rec(record_id="s1", activity_key="fuel.diesel.stationary", scope="1",
                ghg_category="1.1", value=1000, unit="L", fuel_key="diesel"),
            rec(record_id="m", activity_key="elec.grid.location", scope="memo",
                ghg_category="memo", value=1000, unit="kWh", memo_bucket=bucket)]
    r = run(rows, registry, gwp, fuels)
    assert r.totals.memo[bucket] == D("700")
    assert r.totals.scope1 == D("2530")
    assert r.totals.grand_total == D("2530")      # memo excluded


# ---------------------------------------------------------------- T&D losses
def test_td_losses_gross_up_correctly():
    """C x L/(1-L), not C x L. At L=0.18 the multiplier is 0.21951..."""
    got = derive_td_losses(1000, "0.18", 1)
    assert got == D(1000) * D("0.18") / D("0.82")
    naive = D(1000) * D("0.18")
    assert got > naive
    assert round(got / naive, 4) == D("1.2195")


def test_td_loss_rate_must_be_a_fraction():
    with pytest.raises(ValueError):
        derive_td_losses(1000, "18", 1)           # 18 not 0.18


# ---------------------------------------------------------------- intensity
def test_intensity_never_returns_infinity():
    assert intensity(D(100), 0) is None
    assert intensity(D(100), None) is None
    assert intensity(D(100), 4) == D(25)


# ------------------------------------------------------------- data quality
def test_proxy_resolution_downgrades_data_quality(registry, gwp):
    r = run([rec(activity_key="cat4.road_hgv", scope="3", ghg_category="3.4",
                 value=100, unit="t.km")], registry, gwp, gases=("CO2",))
    assert r.line_results[0].data_quality_tier == DQ_PROXY
    assert "global_proxy" in r.line_results[0].resolution_flags


# ---------------------------------------------------------------- provenance
def test_every_line_carries_its_factor_provenance(registry, gwp, fuels):
    r = run([rec(activity_key="fuel.diesel.stationary", scope="1",
                 ghg_category="1.1", value=1000, unit="L", fuel_key="diesel")],
            registry, gwp)
    ln = r.line_results[0]
    assert ln.factor_version_id == "diesel-co2"
    assert ln.factor_reference_year == 2026
    assert "TEST FIXTURE" in ln.factor_source


# ---------------------------------------------------------------- determinism
def test_same_inputs_give_an_identical_run(registry, gwp, fuels):
    rows = [rec(activity_key="fuel.diesel.stationary", scope="1",
                ghg_category="1.1", value=1000, unit="L", fuel_key="diesel")]
    a = run(rows, registry, gwp, fuels, factor_set_pins={"desnz": "2026.1"})
    b = run(rows, registry, gwp, fuels, factor_set_pins={"desnz": "2026.1"})
    assert a.run_id == b.run_id
    assert a.totals.grand_total == b.totals.grand_total


def test_changing_the_gwp_set_creates_a_different_run(registry, gwp, fuels):
    from ghg_core import GwpSet
    ar5_like = GwpSet.from_mapping("TEST-ALT", 100, "TEST FIXTURE", "test://x",
                                   {"CH4_fossil": 28, "CH4_nonfossil": 27, "N2O": 265})
    rows = [rec(activity_key="fuel.diesel.stationary", scope="1",
                ghg_category="1.1", value=1000, unit="L", fuel_key="diesel")]
    a = run(rows, registry, gwp, fuels)
    b = run(rows, registry, ar5_like, fuels)
    assert a.run_id != b.run_id
    assert a.totals.scope1 != b.totals.scope1     # CH4 GWP differs
