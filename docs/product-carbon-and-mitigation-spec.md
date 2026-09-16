# INVTY Product Carbon Reference & AI Mitigation Advisor — Specification

Status: DRAFT for review. No coefficient values are defined in this document.

---

## 0. Read this first — three things that shape everything

**This feature is not organisation-scoped.** It is a public reference: any visitor
looks up any material — a chemical, an alloy, a polymer, a car part, a packaged
consumer good — and sees what a unit of it emits, with provenance. It does not
allocate a company's inventory to its products. It does not need a BOM, a process
route, or a login to produce a number.

**A material name is never a valid key.** Ammonia made by steam methane reforming,
by coal gasification, and by electrolysis are three different products with the
same name and footprints that differ several-fold. Steel via BF-BOF and via
scrap-EAF differ by a large multiple. A page that shows one number per material
is wrong for most of the people reading it. Section 2 makes this a schema
constraint rather than a warning.

**We have no ecoinvent licence.** The existing `data/emission_source_catalogue.csv`
names `ecoinvent` as the source for all 18 of its material rows. ecoinvent is
commercially licensed and may not be redistributed through a public web tool.
Neither may GaBi/Sphera. Everything in this feature must be sourceable from
EXIOBASE, USEEIO, IPCC, national inventories, or published EPDs. Section 5 is
the consequence.

---

## 1. Product definition

A visitor selects a material and a production route. The portal returns:

- the cradle-to-gate carbon intensity per declared unit (e.g. kgCO₂e / kg)
- the data tier and the publication it came from, always visible
- the other routes for the same material, so the comparison is explicit
- (lead-gated) an AI-generated mitigation plan for that route

It is a reference lookup and a funnel, in that order. The number has to be
defensible to a practitioner, or the feature is a liability with the INVTY name
on it.

### 1.1 What it is not

- Not an LCA tool. We publish ingested results; we do not run impact assessment.
- Not organisation-specific. No facility data, no allocation of a client's inventory.
- Not a substitute for a product EPD. It is a screening and comparison reference.

---

## 2. The keying rule

> A factor request that does not specify a production route MUST raise.
> It must never resolve to a default route.

The primary key for a product carbon factor is:

```
(material_key, production_route, region, system_boundary, reference_year)
```

This is the same class of defence as the existing `ef_basis` guard in
`ghg_core/factors.py`: a structural block on an entire error family, not a
warning that nobody reads.

### 2.1 Routing traps this rule prevents

| Trap | Without the rule | With the rule |
|---|---|---|
| Ammonia | One "ammonia" number; coal-route users under-report severely | Route required; coal and SMR are separate rows |
| Steel | BF-BOF value applied to a scrap-EAF buyer | Route required |
| Aluminium | Primary value applied to recycled stock | Route required |
| Nitric acid | N₂O abatement present or absent changes the result dramatically | Abatement state is part of the route |
| Cement | OPC value applied to a blended PPC/PSC product | Blend is part of the route |
| PET | Virgin value applied to rPET | Route required |
| Electricity-intensive routes | Global average grid applied to an Indian producer | `region` is already in the key; keep it mandatory |

### 2.2 System boundary must travel with the number

`cradle-to-gate` and `cradle-to-grave` are not comparable and must never be
ranked against each other. For vehicles this is decisive: cradle-to-gate excludes
the use phase, which dominates lifetime emissions for an ICE vehicle. A BEV and
an ICE car compared cradle-to-gate will mislead every reader. The UI must refuse
to rank rows with differing boundaries, and say why.

---

## 3. Data model

A cradle-to-gate material intensity **is** an emission factor — kgCO₂e per kg of
material, on a physical basis. It fits the existing `EmissionFactor` dataclass.
**`ghg_core` needs no new engine and no allocation module.** Three fields are added:

```python
production_route:  str            # "smr" | "coal_gasification" | "eaf_scrap" | ...
system_boundary:   str            # "cradle_to_gate" | "cradle_to_grave" | "gate_to_gate"
allocation_method: Optional[str]  # as used BY THE SOURCE, not by us
```

### 3.1 `allocation_method` is a comparability guard, not an input

We do not perform allocation. Whoever published the dataset did. We record which
method they used so that two sources are not silently compared across
incompatible methods.

A cracker yields ethylene, propylene, C4s and pygas from one energy input. Mass
allocation and economic allocation give materially different answers for the same
physical plant. Two EPDs using different methods are not comparable, and the UI
must flag that rather than rank them.

Permitted values follow the ISO 14067 hierarchy: `subdivision`, `system_expansion`,
`mass`, `energy`, `stoichiometric`, `economic`, `unstated`.

`unstated` is a legitimate value and must be displayed as such. A source that does
not declare its allocation cannot be silently assumed to have used mass.

---

## 4. Coverage tiers

Primary LCA data will not exist for every material. Make the quality explicit
rather than pretending uniformity.

| Tier | Basis | Displayed as | Flag |
|---|---|---|---|
| **A** | Named LCA/EPD for this material + route + region | Route-specific | `tier_a_route_specific` |
| **B** | Material-class average across routes | Class average — route unknown | `tier_b_class_average` |
| **C** | EEIO / spend-based proxy | Screening estimate only | `tier_c_eeio_proxy` |

### 4.1 The fallback ladder

Mirrors the existing five-step factor resolution and sets a flag at every step:

1. Exact `(material, route, region, boundary, year)` → Tier A
2. Same key, prior reference year → Tier A, `flag: prior_year`
3. Same key, parent region → Tier A, `flag: parent_region`
4. Material-class average → Tier B, `flag: route_unknown`
5. EEIO proxy → Tier C, `flag: eeio_proxy`
6. Nothing → **raise `FactorNotFoundError`**

Step 6 is not optional. A missing material produces an error and a named gap,
never a zero and never an estimate.

### 4.2 Tier is a display obligation

A Tier C number rendered to look like a Tier A number is the failure mode that
destroys credibility. The tier badge and the source publication are part of the
number, always visible, never hover-only — consistent with the provenance strip
rule in `.agents/rules/40-use-the-core.md`.

---

## 5. Source strategy without ecoinvent

| Source | Licence | Use |
|---|---|---|
| **EXIOBASE** | CC BY-SA | Tier C breadth across all families |
| **USEEIO** | US Government, public domain | Tier C, US-region |
| **IPCC 2006 / 2019 Refinement** | Public | Process chemistry defaults, N₂O, clinker |
| **Published EPDs** (EPD International, IBU, NSF) | Free to read; per-document terms | **Primary Tier A route** |
| **National inventories** (India GHG Platform, CEA, BEE) | Public | India-specific routes and grid |
| **Peer-reviewed LCA literature** | Per-publisher | Tier A where EPDs are absent |
| ~~ecoinvent / GaBi~~ | Commercial, non-redistributable | **Excluded** |

**Consequence:** Tier A coverage starts narrow and grows with EPD ingestion. Tier C
gives immediate breadth. This is an honest position and should be stated on the
page, not hidden.

**The existing 18 material rows in `emission_source_catalogue.csv` cite `ecoinvent`
and must be re-sourced before any value is ingested against them.**

---

## 6. Material taxonomy

Key scheme:

```
pcf.<family>.<material>.<route>
```

Six families for v1. Full route enumeration lives in
`data/product_carbon_catalogue.csv`; the families and their route axes are:

### 6.1 Chemicals
Route axis is **feedstock and process**. Ammonia (SMR / coal gasification /
electrolysis / SMR+CCS), urea, methanol, hydrogen, chlor-alkali (membrane /
diaphragm / mercury — chlorine and caustic soda are co-products and the
allocation method is decisive), soda ash (Solvay / trona), sulphuric acid,
nitric acid (**with and without N₂O abatement — the single largest swing in the
family**), phosphoric acid, olefins (naphtha / ethane cracking), aromatics,
industrial gases.

### 6.2 Metals
Route axis is **primary vs secondary, and reductant**. Steel (BF-BOF / scrap-EAF /
gas-DRI-EAF / coal-DRI-EAF / H₂-DRI), aluminium (primary prebake / secondary),
copper, zinc, lead, nickel, and ferroalloys (ferrochrome, ferrosilicon,
ferromanganese — material to Indian industry).

### 6.3 Polymers
Route axis is **virgin fossil / mechanically recycled / bio-based**. PE (HD, LD,
LLD), PP, PVC, PET (virgin and rPET), PS, ABS, nylon, PU, polycarbonate.

### 6.4 Construction
Route axis is **blend and process**. Cement (OPC / PPC fly-ash / PSC slag / LC3 —
blending is the dominant Indian lever), clinker, concrete by strength grade,
bricks (fired clay / fly ash / AAC), glass (float / container), lime, gypsum,
insulation, aggregates, ceramic tiles, bitumen.

### 6.5 Automobile
Two distinct boundary regimes, and they must not be mixed:
- **Component cradle-to-gate**: Li-ion pack by chemistry (NMC / LFP) per kWh —
  highly region-sensitive because cell production is electricity-intensive;
  tyres, body steel, aluminium castings, glass, interior textiles.
- **Vehicle**: ICE petrol / ICE diesel / HEV / PHEV / BEV, cradle-to-gate
  **and** cradle-to-grave as separate rows. Section 2.2 applies with force.

### 6.6 Daily-use products
Route axis varies by item. Packaging (PET bottle, aluminium can, glass bottle,
carton), paper and tissue, textiles (cotton / polyester / viscose), detergents
and surfactants, food staples (rice — note CH₄ from paddy; wheat, milk, meat),
consumer electronics (smartphone, laptop), footwear, furniture.

---

## 7. Calculation

There is no new arithmetic. A product carbon lookup is:

```
ActivityRecord(activity_key=<pcf key>, value=<quantity>, unit=<unit>)
   → registry.resolve(...)        # five-step ladder, §4.1
   → ghg_core.calculate(...)      # unchanged
   → LineResult with full provenance
```

Rules 1 and 2 of `.agents/rules/40-use-the-core.md` hold without exception. No
emissions arithmetic in the API layer, the UI, or the AI layer.

---

## 8. The AI Mitigation Advisor

### 8.1 The governing contract

> **The AI never emits a number. It emits structured intent. `ghg_core` computes
> the number.**

The model proposes *"replace the reductant on this route; the fuel input falls by
40%"*. It does **not** state the resulting footprint. That value comes from
re-running `calculate()` on a modified copy of the activity records. Freedom lives
in the reasoning; the constraint sits at the output boundary.

### 8.2 What the AI may see

- the resolved `LineResult` for the selected material and route, with provenance
- the other routes available for that material
- a curated **abatement measure library** (fuel switching, electrification, heat
  recovery, feedstock substitution, N₂O abatement, CCU, clinker substitution,
  recycled feedstock, PPA) — each entry with applicability conditions and a source

It does **not** receive raw factor tables. Anything it can read, it can be
tempted to recall.

### 8.3 Two-stage execution

Stage 1 and stage 2 are separate API calls. This is deliberate: document
`citations` and `output_config.format` are mutually incompatible (the API returns
400), and separating them also keeps the research transcript auditable.

**Stage 1 — research (free).** Tools enabled, output unconstrained. The model
reads the measure library and may search the web, fenced by `allowed_domains` to
IPCC, IEA, EPD registries, national inventories and peer-reviewed publishers. It
reasons about routes, sequencing, capex, preconditions, and is explicitly free to
conclude that the dominant lever is upstream of the question asked.

**Stage 2 — structuring (locked).** The stage-1 findings are passed back and the
model emits a schema-constrained object with nowhere to put a fabricated figure.

### 8.4 The output schema

```
MitigationMeasure
  stage_or_input      which part of the route it touches
  lever_id            measure-library entry, or "novel"
  parameter_change    { activity_key, delta_percent | replacement_activity_key }
  rationale           free text — expansive by design
  preconditions[]     what must be true first
  evidence[]          library_id | URL from an allowed domain | "unverified"
  confidence          high | medium | low
  abstain_reason?     populated INSTEAD of a measure when data is insufficient
```

There is no absolute-emissions field. Fabrication is unrepresentable rather than
discouraged.

### 8.5 Recomputation

The backend applies `parameter_change` to a **copy** of the records, re-runs
`ghg_core.calculate()`, and derives the delta. The result is a **new**
`CalculationRun`, appended, never mutating the baseline — rule 5 of
`40-use-the-core.md`.

### 8.6 Model configuration

| Setting | Value | Why |
|---|---|---|
| Model | `claude-opus-5` | Reasoning quality is the product here |
| Thinking | `{"type": "adaptive"}` | On by default for Opus 5; explicit for clarity |
| Effort | `output_config: {"effort": "high"}` | Correctness over cost on this path |
| Streaming | yes, `.get_final_message()` | Long stage-1 turns |
| Search tool | `web_search_20260209` + `allowed_domains` | Free to search, inside a fence |
| Stage 2 | `output_config: {"format": {...}}` | Schema-constrained |

The stage-1 prompt is deliberately **under-prescribed**. Over-prescriptive
prompting measurably degrades output quality on current models, and the value of
this feature is judgement, not compliance.

### 8.7 Abstention is a first-class result

`abstain_reason` mirrors `excluded_records`. Given that Tier B and Tier C coverage
will be common at launch, *"no credible route-specific data exists for this
material"* is a frequent and **correct** answer. It must be as easy to render as
a recommendation, and must never be replaced by a plausible guess.

### 8.8 What this design cannot prevent

It prevents fabricated arithmetic. It does not prevent a **plausible but wrong
recommendation** — correct arithmetic on a bad premise. Mitigations: `confidence`,
`preconditions`, mandatory human review before anything reaches a client report,
and a standing label that this is decision-support, not an auditable assertion.

State this in the UI. Do not let it be inferred.

---

## 9. API surface

```
GET  /v1/pcf/materials                       families, materials, routes
GET  /v1/pcf/materials/{key}/routes          route variants + tier per route
POST /v1/pcf/lookup                          → LineResult (Decimal as string)
POST /v1/pcf/mitigate                        → MitigationPlan  [lead-gated]
```

`Decimal` serialises to string at the JSON boundary, never to float.

### 9.1 Runtime

`ghg_core` is Python; the current API is Express/TypeScript. The mitigation and
lookup endpoints require a Python service. Per `docs/techstack-and-bugguard.md`
this is FastAPI, running beside the existing Express service, which retains auth
and static serving.

---

## 10. UI

Replaces the current `ProductCarbonPage.tsx`, whose intensities are hardcoded
literals.

- **Material picker** → family → material → **route (mandatory)**
- **Result**: intensity per declared unit, tier badge, source publication,
  reference year, allocation method, boundary
- **Route comparison**: all routes for the material, side by side, with rows of
  differing boundary or allocation visibly separated and annotated
- **Mitigation panel** (lead-gated): measures, preconditions, evidence,
  recomputed delta, confidence, and abstentions rendered as first-class content

Design tokens and the two-tier surface rule from `docs/ui-master-prompt.md` apply
unchanged.

---

## 11. Lead gating

Lookup is public. The AI mitigation plan is gated behind `LeadGateModal`. This
matches the funnel described in `.agents/rules/00-project.md` while keeping the
reference genuinely open. Revisit once usage is observable.

---

## 12. Build order

1. Catalogue taxonomy + ingestion worklist rows (no values) ← **this change**
2. `EmissionFactor` route/boundary/allocation fields + tests
3. Resolution ladder with tier flags + tests
4. EPD/EXIOBASE ingestion parsers → values enter the registry
5. FastAPI lookup endpoint
6. AI mitigation advisor (two-stage) + eval set
7. UI replacing `ProductCarbonPage.tsx`

Steps 1–3 have no UI. Step 6 has nothing true to reason over until step 4 runs.

---

## 13. Tests that must pass

- A route-less material request raises; it never resolves to a default route
- Each fallback rung sets its tier flag; Tier C never presents as Tier A
- A missing material raises `FactorNotFoundError` and never returns 0
- Rows with differing `system_boundary` are never ranked against each other
- Rows with differing `allocation_method` are flagged when compared
- The AI output schema rejects any payload containing an absolute emissions figure
- A measure with no evidence is persisted as `unverified`, never silently accepted
- Recomputation is deterministic: same measure set ⇒ identical delta twice
- An insufficient-data scenario yields `abstain_reason`, not a recommendation
- Baseline runs are never mutated by a mitigation recomputation

---

## 14. Open items for INVTY

1. **EPD ingestion is the critical path.** Tier A coverage is a function of how
   many EPDs get parsed. This is the main ongoing data effort.
2. **Nitric acid N₂O abatement state** is often undeclared in public sources.
   Decide whether an undeclared plant is `unstated` or excluded.
3. **Vehicle use-phase** requires a duty cycle and a grid assumption. Out of scope
   for v1 cradle-to-gate; flag clearly on the page.
4. **ecoinvent licence** would materially widen Tier A. Currently assumed absent.

---

## 15. Product Carbon Estimator — what is built (2026-09-16)

The product owner asked for a page, placed before Scope 1, where a visitor names
ANY product and gets the carbon from creating it and from using it, with AI
analysis. That required relaxing §8.1 for this page only; the scoped exception
is recorded in `.agents/rules/50-product-carbon.md` §6 and
`.agents/rules/00-project.md`.

### 15.1 Flow

```
visitor: product + region + optional details
  -> service (FastAPI, service/app.py)
  -> decomposition cache (repeat searches: no AI call, no cost)
  -> per-client rate limit on new AI calls
  -> Claude (default claude-haiku-4-5, structured output; see 15.6)
       returns lifecycle LINES: quantity + per-unit factor low/central/high
  -> verified registry lookup per line (replaces the AI factor on a match)
  -> ghg_core.screening.screen_product  (every total, range, share, hotspot)
  -> EstimateResponse, every number a string
  -> ProductCarbonPage.tsx renders strings; no arithmetic in the UI
```

### 15.2 Lifecycle stages

ISO 14067 / GHG Protocol Product Standard stages: `raw_materials`,
`manufacturing`, `distribution`, `use`, `end_of_life`.

- **Creation** = raw materials + manufacturing + distribution
- **Use** = use phase over the stated service life
- **End of life** reported separately; **lifecycle** = all five

### 15.3 Guards

| Guard | Where |
|---|---|
| No aggregate field in the AI schema | `service/schemas.py`, tested |
| Factor denominator always equals the line's unit — no conversion on this path | `ghg_core/screening.py` |
| Negative factors or quantities refused — credits never net | `ScreeningLine.__post_init__` |
| `low <= central <= high` enforced; failing lines excluded and listed, never repaired | pipeline |
| Hallucinated catalogue keys, or a real key on the wrong route, ignored | `Catalogue.matches` |
| Registry factor on a different unit keeps the AI estimate rather than guessing a conversion | pipeline |
| `stop_reason` checked before content; partial output before a fallback discarded | `parse_message` |
| Visitor text only in the user turn, never the system prompt | estimator |
| Display rounded to 3 significant figures; exact values also returned | pipeline |

### 15.4 Running it

```
cp service/.env.example service/.env   # add ANTHROPIC_API_KEY
npm run dev:pcf                        # http://localhost:8000
```

Without a key the service still runs, `/health` reports `ai_configured: false`,
and the page shows setup steps instead of failing silently.

### 15.5 Model choice and cost (decided 2026-09-16)

The product owner asked for the cheapest workable option. Default model:
**Claude Haiku 4.5**. Switch with `PCF_AI_MODEL` in `service/.env`.

| Model | Estimated cost per new estimate | Request shape |
|---|---|---|
| `claude-haiku-4-5` (default) | about $0.02 | structured output; optional thinking budget; no effort |
| `claude-sonnet-5` | about $0.04-0.07 | adaptive thinking + effort |
| `claude-opus-5` | about $0.20-0.45 | adaptive thinking + effort + server-side refusal fallback |

Estimates assume about 6,500 input tokens (mostly the cached system prompt)
and 2,500 output tokens. Each response reports its real token usage and
estimated cost, and `/health` keeps a running total. Prices live in
`service/models.py` and must be updated when Anthropic's rates change.

Cost controls:

- **Decomposition cache** (SQLite, `service/data/`, git-ignored). The key covers
  model, prompt fingerprint, and normalised product, region and details. Only the
  AI's lines are cached; the engine recomputes every time, so cached estimates
  pick up verified factors once they are ingested.
- **Rate limit**: `PCF_RATE_LIMIT_PER_HOUR` new AI estimates per client (default
  30). Cache hits are never limited.
- **Prompt caching** on the system prompt, which dominates input tokens.

### 15.6 Why the AI is not trained

Fine-tuning a model on emission factors was considered and rejected:

1. Fine-tuning shapes style and format; it does not make recalled numbers
   reliable. The model would state factors more confidently, not more correctly.
2. A weight cannot cite the publication a number came from, which breaks the
   provenance rule in `.agents/rules/40-use-the-core.md`.
3. Factors are revised yearly (grid, DESNZ, CEA). A trained model is stale
   as soon as they change.

Accuracy comes from **grounding**, not training: verified registry factors
replace AI estimates line by line (built), and an **eval set** of reviewed
products measures whether a cheaper model is still good enough (not yet built).
Free local models (e.g. via Ollama) were assessed: this development machine
(i3, 8 GB RAM, integrated graphics) cannot run a capable one, so they need a
GPU server and were not integrated.

### 15.7 Not yet done

- **Live verification on Haiku 4.5.** No API key was available during the
  build, so the request shape is unit-tested but has not been exercised against
  the real API. Run one estimate after adding a key.
- **Rate limit behind a proxy.** The limit keys on the connecting IP. Behind a
  load balancer every visitor shares one IP; read the forwarded client address
  from a trusted proxy before deploying.
- **An eval set** (§8 of the original advisor design) to measure decomposition
  quality before customers rely on it.
- **Ingestion** (§12 step 4). Until it runs, every line is an AI estimate.
