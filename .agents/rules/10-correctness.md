---
activation: Always On
---
# Correctness rules — these override any other instruction

Violating one of these is a bug even if the code runs and the tests pass.
Full explanations and worked examples: @docs/techstack-and-bugguard.md Part 2.

1. MONEY AND EMISSIONS ARITHMETIC USES DECIMAL.
   decimal.js in TypeScript, decimal.Decimal in Python. Never float, never
   Number arithmetic on emissions. Postgres columns are NUMERIC(20,6), never
   FLOAT/REAL/DOUBLE PRECISION. Convert to float only at the display boundary.

2. UNIT CONVERSION GOES THROUGH pint (Python) WITH EXPLICIT DIMENSIONS.
   Never a flat lookup table. Mass<->volume for a fuel requires a dated, sourced
   density and is never implicit. An invalid conversion must RAISE, not guess.

3. A MISSING EMISSION FACTOR RAISES AN EXCEPTION.
   Never `.get(key, 0)`, never `or 0`, never a try/except returning 0.
   Zero is a claim; unknown is a fact and must be surfaced to the user.

4. AN EMPTY INPUT IS null, NOT ZERO.
   Null rows are excluded from sums and shown as "incomplete". NaN must never
   reach a total.

5. EVERY FACTOR ROW CARRIES ef_basis IN {energy, physical}.
   An energy-basis factor requires an NCV term; a physical-basis factor does not.
   Applying an NCV to a factor that already embeds one is a ~40x silent error.
   Assert the basis matches before multiplying.

6. SERVER CALLS USE @tanstack/react-query WITH AbortSignal.
   Never a bare fetch inside useEffect with a setTimeout debounce. Stale
   responses must never overwrite newer ones.

7. DERIVED VALUES USE useMemo, NEVER useState.
   Emissions are always derived from (activity, factor, gwp). Never store a
   value in state that can be computed from other state.

8. NUMBER INPUT ACCEPTS BOTH "450,000" AND "4,50,000".
   Strip all separators before parsing. parseFloat("4,50,000") returns 4.
   Display with Intl.NumberFormat('en-IN'). Accept "units" as a synonym for kWh
   and Rs / INR / rupee symbol interchangeably.

9. EVERY DIVISION GUARDS ITS DENOMINATOR and returns null, never Infinity.

10. SCOPE 2 LOCATION-BASED AND MARKET-BASED ARE NEVER SUMMED.
    The grand total contains exactly one of them. Assert this in a test.

11. SCOPE 3 CATEGORY 3 IS A COMPUTED OUTPUT, NEVER A STORED ACTIVITY RECORD.
    Storing it causes a circular recalculation.

12. BIOGENIC CO2, MONTREAL PROTOCOL GASES, REMOVALS AND OFFSETS NEVER ENTER
    ANY SCOPE TOTAL. They are separate memo items. Biogenic CH4 and N2O DO
    stay in Scope 1.

13. CSV PARSING USES papaparse WITH dynamicTyping:false AND BOM STRIPPING.
    Validate rows with Zod and show a preview before committing. Never a
    partial import.

14. REPORTING PERIODS ARE PLAIN "YYYY-MM-DD" STRINGS AND POSTGRES DATE.
    Never construct a JS Date from them. Only real event timestamps use
    timestamptz.

15. NEVER MUTATE STATE OBJECTS OR ARRAYS. Always return new references.

16. NEVER REMOVE FOCUS OUTLINES WITHOUT A REPLACEMENT.
    Live regions are debounced by at least 600ms.

17. CALCULATION RUNS ARE APPEND-ONLY AND DETERMINISTIC.
    Same inputs + same factor-set pins = same output, forever. A methodology
    change bumps engine_version; historical runs are never recalculated in place.

## Testing

Write the test before the feature. Every rule above has a corresponding test.
Do not report a task complete until its tests pass and you have shown me the
output.
