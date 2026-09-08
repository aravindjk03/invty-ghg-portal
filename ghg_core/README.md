# ghg_core

The calculation core of the INVTY GHG portal. Pure Python, no database, no
network, no UI. It computes a greenhouse gas inventory from activity records and
emission factors, and it is deliberately hard to use incorrectly.

## Why this is a separate package

The engine is the part where a mistake is invisible. A wrong colour is obvious;
a factor applied on the wrong basis silently multiplies a number by forty and
nobody notices. So it is isolated, dependency-free, and covered by 120 tests
that assert the *numbers*, not just that the code runs.

## Install and test

```bash
pip install -e ".[test]"
pytest -q            # 120 tests
python example_run.py
```

## It ships with ZERO emission factor values

`InMemoryFactorRegistry()` starts empty and `data/gwp_ar6_TEMPLATE.json` is all
nulls. This is on purpose. Every coefficient enters through the ingestion
pipeline from a named publication with a table reference, a year and a URL.
`EmissionFactor` refuses to construct without a source, and `load_gwp_set`
rejects a set with an empty `source_url` or a null value.

An emission factor, calorific value or density must never be recalled,
estimated or generated. Not by a person in a hurry, not by an AI assistant.

## What it guarantees

| Guarantee | How |
|---|---|
| No float drift | `Decimal` throughout, 28-digit precision, banker's rounding |
| No 1000x unit errors | Exact `Decimal` conversion factors, cross-checked against `pint` in CI |
| No implicit physics | `L -> kg` raises without a dated, sourced density |
| No scm/Nm3 mixing | A gas volume unit must match the density's reference state |
| No silent zeros | A missing factor raises `FactorNotFoundError` |
| No NaN | An empty input is `None`, excluded from sums, shown as "incomplete" |
| No ~40x NCV error | Every factor declares `ef_basis`; mismatches raise |
| No Scope 2 double count | Location and market computed separately; exactly one enters the total |
| No memo leakage | Biogenic CO2, Montreal gases, removals and offsets never enter a scope |
| No Infinity | `intensity()` returns `None` for a zero or missing denominator |
| Reproducible forever | Append-only runs; `run_id` is a hash of inputs + factor pins |

## Quick use

```python
from ghg_core import (ActivityRecord, InMemoryFactorRegistry, calculate,
                      FuelProperty, load_gwp_set)

gwp      = load_gwp_set("data/gwp_ar6.json")       # ingested, not invented
registry = InMemoryFactorRegistry(ingested_factors)
fuels    = {"diesel": FuelProperty(...)}           # dated, sourced

run = calculate(records, registry, gwp, reporting_year=2026,
                fuel_properties=fuels,
                factor_set_pins={"desnz": "2026.1", "cea": "21.0"},
                scope2_headline_view="location")

run.totals.scope1            # Decimal, kg CO2e
run.totals.scope2_location   # both views computed...
run.totals.scope2_market     # ...never summed
run.totals.grand_total       # contains exactly ONE Scope 2 figure
run.totals.memo              # biogenic, Montreal, removals, offsets
run.excluded_records         # -> the report's exclusions table
run.line_results[0].factor_source        # full provenance, per line
```

## Layout

```
ghg_core/
  quantities.py   Decimal setup
  units.py        exact unit registry, fuel properties, dimensional safety
  gwp.py          versioned GWP sets - contains no GWP numbers
  factors.py      immutable factor registry, 5-step resolution, basis guard
  engine.py       the equations, totals assembly, memo isolation
  errors.py       typed, loud failures
tests/            120 tests
data/             GWP template (nulls) + a clearly-marked test fixture
example_run.py    a worked Indian manufacturer inventory
```

## What is NOT in here, on purpose

Database models, migrations, the ingestion parsers, the API, the UI, the PDF
report. Those need project context and belong in the application. This package
is the part that must be right.
