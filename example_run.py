"""Worked example: a small Indian manufacturer.

Run:  python example_run.py

Every factor below is a TEST FIXTURE with a round number so the arithmetic is
checkable by hand. Production factors come from the ingestion pipeline.
"""
from decimal import Decimal
from ghg_core import (ActivityRecord, EmissionFactor, FuelProperty,
                      InMemoryFactorRegistry, calculate, derive_td_losses,
                      intensity, round_sig)
from ghg_core.factors import PHYSICAL_BASIS
from ghg_core.gwp import load_gwp_set

gwp = load_gwp_set("data/gwp_TEST_FIXTURE.json")

def F(vid, key, gas, val, den):
    return EmissionFactor(version_id=vid, activity_key=key, region="IN",
                          reference_year=2026, gas=gas, value=val,
                          numerator_unit="kgCO2e" if gas == "CO2e" else f"kg{gas}",
                          denominator_unit=den, ef_basis=PHYSICAL_BASIS,
                          source_name="TEST FIXTURE", source_table_ref="tbl-1",
                          source_url="test://fixture", factor_set_id="TEST")

reg = InMemoryFactorRegistry([
    F("d-co2", "fuel.diesel.stationary", "CO2", "2.5", "L"),
    F("d-ch4", "fuel.diesel.stationary", "CH4", "0.001", "L"),
    F("g-co2", "elec.grid.location", "CO2", "0.7", "kWh"),
    F("bag-co2", "fuel.biomass.bagasse", "CO2", "1.0", "kg"),
    F("bag-ch4", "fuel.biomass.bagasse", "CH4", "0.01", "kg"),
    F("air-co2", "cat6.air_domestic_economy", "CO2", "0.15", "km"),
])
fuels = {"diesel": FuelProperty("diesel", "TEST FIXTURE", "tbl-1", 2026,
                                density_kg_per_m3="840", ncv_mj_per_kg="43")}

records = [
    ActivityRecord("s1-dg", "fuel.diesel.stationary", "1", "1.1", "IN",
                   45, "kL", fuel_key="diesel", data_quality_tier="primary"),
    ActivityRecord("s1-bag", "fuel.biomass.bagasse", "1", "1.1", "IN",
                   200000, "kg", biogenic_fraction=1, biogenic_basis="energy"),
    ActivityRecord("s2-grid", "elec.grid.location", "2", "2.1", "IN",
                   1200, "MWh", scope2_view="location", data_quality_tier="primary"),
    ActivityRecord("s3-air", "cat6.air_domestic_economy", "3", "3.6", "IN",
                   84000, "km"),
    ActivityRecord("s3-blank", "cat6.air_domestic_economy", "3", "3.6", "IN",
                   None, "km"),                      # user left it empty
    ActivityRecord("s1-unknown", "fuel.mystery", "1", "1.1", "IN", 10, "t"),
]

run = calculate(records, reg, gwp, reporting_year=2026, fuel_properties=fuels,
                factor_set_pins={"TEST": "fixture-1"})
t = run.totals
kg2t = lambda v: v / Decimal(1000)

print(f"run_id {run.run_id}   engine {run.engine_version}   gwp {run.gwp_set_name}\n")
print(f"{'LINE':<12}{'STATUS':<13}{'tCO2e':>12}   PROVENANCE / REASON")
print("-" * 92)
for ln in run.line_results:
    prov = ln.factor_source or ln.message[:44]
    print(f"{ln.record_id:<12}{ln.status:<13}{round_sig(kg2t(ln.emissions_kgco2e),6):>12}   {prov}")

print("\nTOTALS (tCO2e)")
print(f"  Scope 1                    {round_sig(kg2t(t.scope1), 6):>12}")
print(f"  Scope 2 (location-based)   {round_sig(kg2t(t.scope2_location), 6):>12}")
print(f"  Scope 2 (market-based)     {round_sig(kg2t(t.scope2_market), 6):>12}")
print(f"  Scope 3                    {round_sig(kg2t(t.scope3), 6):>12}")
print(f"  {'-'*38}")
print(f"  GRAND TOTAL                {round_sig(kg2t(t.grand_total), 6):>12}"
      f"   (uses {run.scope2_headline_view}-based only)")
print("\nMEMO ITEMS - reported separately, never inside a scope")
for k, v in t.memo.items():
    print(f"  {k:<26} {round_sig(kg2t(v), 6):>12}")

print("\nDERIVED - Scope 3 Cat 3, T&D losses at an 18% Indian grid loss rate")
td = derive_td_losses(1_200_000, "0.18", "0.7")
print(f"  correct  C x L/(1-L)       {round_sig(kg2t(td), 6):>12}")
print(f"  naive    C x L             {round_sig(kg2t(Decimal(1_200_000)*Decimal('0.18')*Decimal('0.7')), 6):>12}   <- understates")

print("\nEXCLUSIONS - these appear in the report's exclusions table")
for e in run.excluded_records:
    print(f"  {e['record_id']:<12} {e['reason']}")

print("\nINTENSITY")
rev_cr = Decimal(420)
print(f"  tCO2e per Rs crore turnover  {round_sig(kg2t(t.grand_total)/rev_cr, 4)}")
print(f"  divide-by-zero guard         {intensity(t.grand_total, 0)}")
