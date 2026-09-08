import pytest
from decimal import Decimal
from ghg_core import EmissionFactor, InMemoryFactorRegistry, GwpSet, FuelProperty
from ghg_core.factors import ENERGY_BASIS, PHYSICAL_BASIS
from ghg_core.gwp import load_gwp_set
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture
def gwp():
    return load_gwp_set(DATA / "gwp_TEST_FIXTURE.json")


def ef(**kw):
    base = dict(source_name="TEST FIXTURE", source_table_ref="tbl-test",
                source_url="test://fixture", factor_set_id="TEST")
    base.update(kw)
    return EmissionFactor(**base)


@pytest.fixture
def registry():
    r = InMemoryFactorRegistry()
    # Pure carbon: exactly 44/12 kg CO2 per kg C. Stoichiometry, not a measurement.
    r.add(ef(version_id="carbon-co2", activity_key="test.pure_carbon", region="GLOBAL",
             reference_year=2026, gas="CO2", value=Decimal(44) / Decimal(12),
             numerator_unit="kgCO2", denominator_unit="kg", ef_basis=PHYSICAL_BASIS))
    # Physical-basis diesel, round numbers so the arithmetic is checkable by hand.
    r.add(ef(version_id="diesel-co2", activity_key="fuel.diesel.stationary", region="IN",
             reference_year=2026, gas="CO2", value="2.5",
             numerator_unit="kgCO2", denominator_unit="L", ef_basis=PHYSICAL_BASIS))
    r.add(ef(version_id="diesel-ch4", activity_key="fuel.diesel.stationary", region="IN",
             reference_year=2026, gas="CH4", value="0.001",
             numerator_unit="kgCH4", denominator_unit="L", ef_basis=PHYSICAL_BASIS))
    # Energy-basis coal, per MJ.
    r.add(ef(version_id="coal-co2-energy", activity_key="fuel.coal.indian_domestic",
             region="IN", reference_year=2026, gas="CO2", value="0.0946",
             numerator_unit="kgCO2", denominator_unit="MJ", ef_basis=ENERGY_BASIS))
    # Grid, both views.
    r.add(ef(version_id="grid-loc", activity_key="elec.grid.location", region="IN",
             reference_year=2026, gas="CO2", value="0.7",
             numerator_unit="kgCO2e", denominator_unit="kWh", ef_basis=PHYSICAL_BASIS))
    r.add(ef(version_id="grid-mkt", activity_key="elec.grid.market_residual", region="IN",
             reference_year=2026, gas="CO2", value="0.7",
             numerator_unit="kgCO2e", denominator_unit="kWh", ef_basis=PHYSICAL_BASIS))
    # Biomass: CO2 factor exists but is biogenic; CH4 stays in Scope 1.
    r.add(ef(version_id="bagasse-co2", activity_key="fuel.biomass.bagasse", region="IN",
             reference_year=2026, gas="CO2", value="1.0",
             numerator_unit="kgCO2", denominator_unit="kg", ef_basis=PHYSICAL_BASIS))
    r.add(ef(version_id="bagasse-ch4", activity_key="fuel.biomass.bagasse", region="IN",
             reference_year=2026, gas="CH4", value="0.01",
             numerator_unit="kgCH4", denominator_unit="kg", ef_basis=PHYSICAL_BASIS))
    # Older year + parent region, to exercise the fallback ladder.
    r.add(ef(version_id="travel-old", activity_key="cat6.rail", region="IN",
             reference_year=2020, gas="CO2", value="0.04",
             numerator_unit="kgCO2e", denominator_unit="km", ef_basis=PHYSICAL_BASIS))
    r.add(ef(version_id="freight-global", activity_key="cat4.road_hgv", region="GLOBAL",
             reference_year=2026, gas="CO2", value="0.1",
             numerator_unit="kgCO2e", denominator_unit="t.km", ef_basis=PHYSICAL_BASIS))
    return r


@pytest.fixture
def fuels():
    return {
        "diesel": FuelProperty(fuel_key="diesel", source_name="TEST FIXTURE",
                               source_ref="tbl-test", reference_year=2026,
                               density_kg_per_m3="840", ncv_mj_per_kg="43"),
        "coal_g12": FuelProperty(fuel_key="coal_g12", source_name="TEST FIXTURE",
                                 source_ref="tbl-test", reference_year=2026,
                                 ncv_mj_per_kg="16.7472", basis="equilibrated"),
        "natural_gas": FuelProperty(fuel_key="natural_gas", source_name="TEST FIXTURE",
                                    source_ref="tbl-test", reference_year=2026,
                                    density_kg_per_m3="0.8", gas_reference="standard"),
    }
