---
activation: Always On
---
# The calculation core already exists. Use it. Do not rewrite it.

`ghg_core/` is a finished, tested Python package that performs every emission
calculation in this product. It has 120 passing tests that assert the numbers,
not just that the code runs. See @ghg_core/README.md

## Rules

1. NEVER reimplement unit conversion, factor resolution, GWP handling, scope
   totalling, biogenic splitting or T&D grossing-up. Import them:

       from ghg_core import (ActivityRecord, InMemoryFactorRegistry, calculate,
                             FuelProperty, EmissionFactor, load_gwp_set,
                             derive_td_losses, intensity)

2. NEVER perform emissions arithmetic outside ghg_core. The API, the UI and the
   report display numbers that ghg_core produced; they never compute their own.
   No `total = sum(x * y)` anywhere in the application layer.

3. NEVER edit files inside ghg_core/ without being asked. If you believe there
   is a bug, STOP and tell me which test would prove it. Do not "fix" it.

4. If a test in tests/ fails after your change, your change is wrong. Do not
   modify the test to make it pass.

5. `calculate()` returns a CalculationRun. Persist it whole and append-only.
   Never recalculate a stored run in place.

## Your job is the layers around it

- Database models that PERSIST ActivityRecord, EmissionFactor and CalculationRun
- Ingestion parsers that POPULATE the factor registry from published sources
- FastAPI endpoints that build ActivityRecords from requests and call calculate()
- The Next.js UI that submits activity data and renders LineResults
- The PDF report that formats a CalculationRun

## The integration shape

    request  ->  validate (pydantic)  ->  build ActivityRecord[]
             ->  load factors from DB into InMemoryFactorRegistry
             ->  ghg_core.calculate(...)
             ->  persist CalculationRun + LineResults
             ->  serialise to the client

Convert Decimal to string at the JSON boundary, never to float.

## Two things the engine gives you that the UI must show

- `run.line_results[i].factor_source` and `.factor_reference_year` - the
  provenance strip under every activity row. Always visible, never hover-only.
- `run.excluded_records` - rows that are incomplete or have no factor. These
  become the "Factor unavailable" warnings and the report's exclusions table.
  They are NOT zeros and must never be displayed as 0.
