# How to use this in Antigravity

Everything here is designed to be **files in your repo**, not text pasted into
the chat box. Antigravity re-reads rules files on every request; a chat message
scrolls away and is forgotten. That difference is why your build has been drifting.

---

## STEP 1 — Drop this into your project (2 minutes)

Unzip this folder into the **root of your project** (the git root). You should end up with:

```
your-project/
├── .agents/
│   └── rules/
│       ├── 00-project.md        Always On — what this is, where the specs are, build order
│       ├── 10-correctness.md    Always On — the 17 rules that prevent wrong numbers
│       ├── 20-ghg-domain.md     Always On — scope routing, India specifics, constants
│       └── 30-ui-design.md      Glob — loads only for .tsx/.jsx/.css files
├── docs/
│   ├── architecture-spec.md
│   ├── calculation-methodology.md
│   ├── source-catalogue-and-routing.md
│   ├── techstack-and-bugguard.md
│   └── ui-master-prompt.md
└── data/
    ├── emission_source_catalogue.csv
    └── coefficient_ingestion_worklist.csv
```

`.agents/rules/` is Antigravity's workspace rules folder. Each rules file is
capped at **12,000 characters** — all four here are well under, and they use
`@docs/...` references so the agent pulls in the full specifications only when
it needs them. That is the whole trick: small always-on rules, big documents
referenced by path.

Open the Rules panel in Antigravity and confirm the activation mode on each file
matches the frontmatter (three Always On, one Glob). Set it manually if the
frontmatter isn't picked up.

---

## STEP 2 — Verify the agent actually read them

Before building anything, paste this:

```
Read the rules in .agents/rules/ and the documents they reference.
Then answer these five questions in your own words, with no code:
1. What is the build order, and what must NOT be built until step 3 passes?
2. What happens when an emission factor is missing?
3. A company owns an electric delivery van and charges it at its own factory.
   Which scope, and why?
4. Why can't we use a single default "coal" emission factor for India?
5. Why must focus rings use outline instead of box-shadow in this design?
```

If it gets any of these wrong, the rules are not loading. Fix that before writing
a line of code. This costs you two minutes and saves days.

---

## STEP 3 — Build, in this order, one prompt at a time

Do not paste all of these at once. Run one, review the output, run the tests,
then move on. **Steps 1–3 have no user interface.** That is deliberate.

### Prompt 1 — Unit conversion service

```
Build the unit conversion service described in docs/calculation-methodology.md
and docs/architecture-spec.md section 7.4.

Requirements:
- Python 3.12, using pint. Every conversion is dimensionally checked.
- Canonical units: energy -> MJ, mass -> kg, volume -> m3, distance -> km.
- Define kilolitre, scm and Nm3 explicitly with their reference conditions.
- Fuel volume <-> mass requires a dated, sourced density passed in as an
  argument. If it is absent, RAISE. Never assume a density.
- All arithmetic uses decimal.Decimal.

Then write the tests BEFORE you consider this done:
- Round-trip every unit in data/emission_source_catalogue.csv allowed_units
  through canonical and back; assert equality.
- Assert converting litres to kilowatt-hours without a density and an NCV raises.
- Assert kg -> t is exactly 0.001 and kWh -> MJ is exactly 3.6.

Show me the passing test output. Do not build anything else.
```

### Prompt 2 — Factor registry and resolution

```
Build the emission factor registry described in docs/architecture-spec.md
sections 7.1 to 7.3.

- The emission_factor schema exactly as specified, PLUS the ef_basis column
  in {energy, physical} required by correctness rule 5.
- Factors are immutable and versioned. A revised factor is a NEW row; the old
  one is marked superseded. Never an UPDATE.
- Implement resolve(activity_key, region, reporting_year, gwp_set) with the
  five-step fallback: exact -> prior year -> parent region -> global -> RAISE.
- Every resolution returns a resolution record listing which rule fired and
  which flags were set.
- Postgres columns for any factor value are NUMERIC(20,6).

Tests: assert a missing key raises FactorNotFoundError and never returns 0.
Assert each fallback rule sets its flag. Assert a superseded factor is never
returned for a current lookup.

Load data/emission_source_catalogue.csv as the activity catalogue. Do NOT
populate any factor values — leave the table empty. Factor values come from
the ingestion pipeline in a later step.

Show me the passing tests.
```

### Prompt 3 — Calculation engine

```
Build the calculation engine described in docs/calculation-methodology.md.

Implement the equations in sections 2.1 to 2.12 EXACTLY as written. Do not
derive your own formulas. Pay particular attention to:
- 2.2 Tier 2 carbon-content method (required for Indian coal)
- 2.4 cement: CKD correction is MULTIPLICATIVE; non-carbonate CaO is
  SUBTRACTED and organic carbon is ADDED — two separate fields
- 2.7 Scope 2 dual reporting: never summed
- 2.8 T&D losses: C x L/(1-L), not C x L
- 2.9 spend-based: currency conversion AND deflation, both stored in the audit trail
- 2.12 biogenic split on an ENERGY basis, never mass

The engine is pure functions with no I/O — factors are loaded up front and
passed in. It emits a CalculationRun with a LineResult per activity record,
each carrying its factor_version_id, gas breakdown, GWPs applied, resolution
flags and data quality tier, exactly as in architecture-spec.md section 7.5.

Tests, all of which must pass before you report done:
- Pure carbon combusted -> assert 3.6667 kg CO2 per kg C
- Assert an energy-basis factor is never applied to a physical-basis activity
- Assert the grand total never contains both Scope 2 figures
- Assert biogenic CO2, Montreal gases, removals and offsets never enter a scope
- Assert T&D uses C x L/(1-L): at L=0.18 the multiplier is 0.21951
- Assert determinism: same inputs and pins produce identical output twice
- Assert recalculating under AR5 creates a NEW run and leaves the AR6 run intact

Show me the passing test output.
```

### Prompt 4 — Factor ingestion pipeline

```
Build the factor ingestion pipeline in docs/architecture-spec.md section 7.6.

Source publication -> source-specific parser -> staging table -> validation
suite -> human review queue -> atomic publish as a new factor_set version ->
regression run.

Validation suite must enforce: every row has a source_table_ref; units parse
against the unit dictionary; ef_basis is set; values within +/-40% of the prior
year's equivalent, else flagged for review; no duplicate
(activity_key, region, year).

Use data/coefficient_ingestion_worklist.csv as the specification of WHAT to
ingest and from WHERE. Build one parser per source.

You are NOT to fill in any coefficient values yourself. If you cannot obtain a
published value, leave the row as TO_INGEST and list it for me. Under no
circumstances generate, estimate or recall an emission factor, calorific value,
density or GWP.
```

### Prompt 5 — API layer

Then continue with the API surface in architecture-spec.md section 9.3, the UI
starting from PROMPT 0 in ui-master-prompt.md, and the PDF pipeline in section 10.

---

## STEP 4 — How to talk to it day to day

**When it goes wrong, name the rule.** Not "this is broken" but:

> "The total shows NaN when I clear a field. That violates correctness rule 4 —
> an empty input is null, not zero, and null rows are excluded from sums. Fix it
> and add the test."

Naming the rule works far better than describing the symptom, because the rule
is already in its context.

**When it wants to install something:**

> "Rule: dependencies come only from docs/techstack-and-bugguard.md Part 1.
> Tell me which package you want and why. Do not install it."

**When it produces a number:**

> "Where did that emission factor come from? Show me the row in the registry,
> its source publication, table reference and year. If it isn't there, you
> invented it — remove it."

**Before every commit:**

> "Run the full test suite and show me the output. Then check the diff against
> .agents/rules/10-correctness.md and tell me which rules this change touches."

---

## STEP 5 — The one thing that will decide whether this works

The temptation will be to ask for screens early, because screens are visible and
tests are not. Resist it.

An engine that produces correct, traceable numbers with an ugly UI is a product
you can sell. A beautiful UI over an engine that quietly returns zero for a
missing factor is a liability with the INVTY name on it.

Build steps 1 to 3. Make the tests pass. Then make it beautiful.
