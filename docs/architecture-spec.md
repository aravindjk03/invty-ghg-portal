# INVTY GHG Accounting Portal
## Complete Architecture & Product Specification

**Version** 1.0 · **Date** 6 September 2026 · **Prepared for** INVTY
**Scope of document:** product definition, application workflow, calculation architecture, data model, system architecture, report pipeline, UI system, and phased build plan.

---

## 0. Read this first — three decisions that shape everything

You described a public tool on the INVTY website where any visitor enters data and gets a watermarked, downloadable GHG report. That is a coherent product, but it forces three consequences that the rest of this document is built around. Disagree with any of them and the architecture changes.

**0.1 — This is a screening tool, not an assurance platform.**
A visitor who lands on your site will not have invoice-level fuel records or supplier-specific emission factors. They have rough numbers. So "accurate" cannot mean *audit-grade*. It must mean *methodologically defensible and fully traceable*: every number the report prints must be reproducible from the inputs, the named factor, the factor's publication year, and the GWP set used. That is achievable and it is what industry professionals will actually judge you on. Claiming "accurate CO₂ emissions" without qualification on a public tool is a liability. The report must carry a clear methodology and limitations page. Section 12 covers this.

**0.2 — The tool is a lead-generation funnel. Design it as one.**
Anonymous visitors will not complete a 200-field questionnaire. The winning pattern is: *calculate freely, gate the deliverable*. The visitor can use any calculator and see live results without signing up. The watermarked PDF requires an email. That email, plus the sector and revenue band they entered, is a qualified lead for INVTY's consulting services. This shapes the funnel design in Section 3 and is the single highest-ROI decision in this document.

**0.3 — You selected all four frameworks and all three factor sources. Do not build all of them in v1.**
GHG Protocol is the calculation engine — CSRD/ESRS, BRSR, ISO 14064-1 and CDP are *presentation layers over the same underlying inventory*. The right move is to build one canonical inventory data model (GHG Protocol shaped) and one report engine that renders that inventory into different disclosure templates. v1 ships GHG Protocol + BRSR (your Indian industrial audience). ESRS/CDP become new templates in Phase 3 without touching the engine. Section 10.4 specifies this mapping layer. Same for factors: DEFRA/EPA/IPCC/CEA in v1, commercial API behind an adapter interface added later without a rewrite (Section 6.5).

---

## 1. Product definition

### 1.1 What it is
A public, browser-based greenhouse gas inventory calculator hosted at `ghg.invty.com` (or `invty.com/ghg-tool`), linked from the INVTY main site. A visitor selects one or more scopes, enters or uploads activity data, and receives a live emissions dashboard plus a downloadable, INVTY-watermarked PDF report.

### 1.2 What v1 explicitly is *not*
- Not a continuous monitoring / IoT platform
- Not a supplier engagement portal
- Not a target-setting or SBTi validation tool
- Not third-party assurance software
- Not a carbon offset marketplace

Each of these is a legitimate Phase 3+ expansion. Shipping them in v1 guarantees you ship nothing.

### 1.3 Primary users
| Persona | Who | What they want | Design consequence |
|---|---|---|---|
| **The Sustainability Lead** | ESG/EHS manager at a mid-size manufacturer | A defensible first inventory for a BRSR filing or a customer questionnaire | Needs full 3-scope coverage, methodology transparency, export |
| **The Plant / Ops Engineer** | Energy or production manager | To know which fuel or process dominates his footprint | Needs Scope 1 depth, unit flexibility, per-facility breakdown |
| **The Procurement / Supply Chain Manager** | Responding to a customer's Scope 3 request | Category 1 and 4 numbers, fast | Needs spend-based fallback, bulk CSV upload |
| **The Curious Executive** | CXO evaluating whether to engage INVTY | A credible-looking number in under 10 minutes | Needs Quick Estimate mode, strong visual report |

The Curious Executive is your conversion persona. The Sustainability Lead is your credibility persona. The tool must serve both — hence the **two-track entry** in Section 3.2.

### 1.4 Success metrics
- **Activation:** % of visitors who complete at least one scope calculation (target > 40%)
- **Conversion:** % of activated users who submit email for the PDF (target > 55%)
- **Depth:** median number of scopes completed per session (target ≥ 2)
- **Quality:** % of sessions using activity-based rather than spend-based Scope 3 methods (proxy for data seriousness → lead quality)
- **Lead value:** % of downloads from companies matching INVTY's ICP

---

## 2. Standards and methodology foundation

### 2.1 Calculation basis
All calculations follow the **GHG Protocol Corporate Accounting and Reporting Standard (Revised Edition)** and the **Corporate Value Chain (Scope 3) Standard**, with the **Scope 2 Guidance** applied for electricity.

Core identity used everywhere in the engine:

```
Emissions (kg CO2e) = Activity Data × Emission Factor × GWP
```

Where the emission factor is already expressed in kg CO₂e, the GWP multiplier is 1 (already embedded). Where the factor is gas-specific (kg CH₄/unit), the engine applies the GWP from the configured assessment report. **The GWP set is a first-class, versioned configuration object, not a hardcoded constant** — this is the most common source of irreproducible numbers in homemade tools.

### 2.2 GWP handling
- Default set: **IPCC AR6, 100-year GWP** (fossil CH₄, biogenic CH₄ and N₂O carry different values; the engine stores each gas as a distinct row).
- The engine must also support **AR5** and **AR4**, because CDP, some CSRD filers and older baselines still require them. A report recalculated under a different GWP set must produce a *new* calculation run, never overwrite the old one.
- Every report prints the GWP set used on the methodology page. Non-negotiable.

### 2.3 Organisational and operational boundaries
The user must declare, at the start of a session:
- **Consolidation approach:** Operational Control (default) / Financial Control / Equity Share
- **Reporting period:** start and end date (default: last completed financial year)
- **Base year:** optional, for future comparison
- **Facilities in scope:** at minimum one; the model supports many (Section 8)

These four fields appear on the report cover. Without them the report is not a GHG Protocol inventory, it is a number.

### 2.4 Framework mapping (build order)
| Framework | v1 | Notes |
|---|---|---|
| GHG Protocol Corporate + Scope 3 | ✅ Core | The engine itself |
| BRSR Core, Principle 6 (SEBI) | ✅ Report template | Indian listed-entity format (Essential Indicator 7). Requires turnover-based intensity **adjusted for Purchasing Power Parity (PPP)** as well as the unadjusted figure and a physical-output intensity |
| ISO 14064-1 | Phase 2 | Mainly a structural/verification-readiness reformat of the same inventory + an uncertainty statement |
| CSRD / ESRS E1 | Phase 3 | Requires additional datapoints (E1-6 gross scopes, intensity, and links to transition plan) |
| CDP Climate Change | Phase 3 | Module C5–C7 mapping; effectively a structured export |

---

## 3. Application workflow — top to bottom

### 3.1 The full journey

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. ENTRY                                                        │
│    invty.com  →  "GHG Calculator" CTA  →  ghg.invty.com         │
│    Anonymous session created (UUID + cookie). No signup wall.   │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ORGANISATION SETUP  (2 minutes, 6 fields)                    │
│    Company name · Country/region · Sector (NIC/NAICS)           │
│    Reporting period · Consolidation approach · Employees/Revenue│
│    → Sector choice pre-configures which activities are shown    │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. SCOPE SELECTOR  ← THE CORE SCREEN                            │
│    Three independent, self-contained cards. Any order.          │
│    Any subset. Each shows: status, running total, time estimate.│
│    ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│    │ SCOPE 1  │  │ SCOPE 2  │  │ SCOPE 3  │                     │
│    │ Direct   │  │ Purchased│  │ Value    │                     │
│    │          │  │ energy   │  │ chain    │                     │
│    │ ○ Not    │  │ ● Done   │  │ ◐ 3 of 15│                     │
│    │   started│  │ 412 tCO2e│  │ 1,204 t  │                     │
│    └──────────┘  └──────────┘  └──────────┘                     │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. DATA ENTRY  (per scope — see Sections 4, 5, 6)               │
│    Three input modes available on every category:               │
│      (a) Guided form   — one activity at a time, unit picker    │
│      (b) Bulk CSV      — download template, upload, map, validate│
│      (c) Quick estimate— sector benchmark, for skipped categories│
│    Live calculation on every keystroke (debounced).             │
│    Every row shows its factor, source and year inline.          │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. VALIDATION & DATA QUALITY                                    │
│    Automated checks: unit sanity, order-of-magnitude outliers,  │
│    intensity vs sector benchmark, missing mandatory categories. │
│    Each line item gets a data quality tier (Primary/Secondary/  │
│    Proxy/Estimated). Rolled up to a Data Quality Score.         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. RESULTS DASHBOARD                                            │
│    Total tCO2e · scope split · top-10 sources · intensity       │
│    metrics · Sankey of value chain · data quality panel         │
│    "What-if" sliders (e.g. switch to renewable PPA)             │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. EMAIL GATE  ← the only wall in the product                   │
│    Name · work email · company · role. Consent checkbox.        │
│    Double opt-in email with the report link.                    │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. REPORT GENERATION  (async job, 5–20 s)                       │
│    Snapshot inventory → render HTML → headless Chromium → PDF   │
│    INVTY watermark composited behind content on every page.     │
│    Stored in object storage, signed URL, 30-day expiry.         │
└────────────────────────────┬────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. DELIVERY & FOLLOW-UP                                         │
│    In-browser download + emailed copy + shareable link.         │
│    Optional: "Save my session" (magic link) to return later.    │
│    Lead pushed to INVTY CRM with full inventory summary.        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Two-track entry (the conversion mechanism)

On the Scope Selector, every scope offers two doors:

**Express Track** — 5 to 8 questions per scope, sector-default assumptions, spend- and benchmark-based factors. Produces a screening estimate in under 10 minutes with a visible uncertainty band. Report is labelled **"Screening Estimate"**.

**Detailed Track** — full activity-data entry, facility by facility, category by category. Produces a **"GHG Protocol Inventory"** labelled report.

A user can start Express and upgrade any single category to Detailed later without losing work. Under the hood both write to the same `activity_record` table; only the `method` and `data_quality_tier` fields differ. **This is why the data model must be method-agnostic from day one** (Section 8.3).

### 3.3 Session and persistence model
- Anonymous session on first visit → `session_id` UUID in an httpOnly cookie, server-side record.
- All work autosaves server-side every few seconds. No lost data on refresh.
- Anonymous sessions expire after 30 days.
- On email capture the session is bound to a lightweight account; the user gets a magic link to resume — no password.
- Full accounts with password/SSO are Phase 2, when you add multi-year comparison.

---

## 4. SCOPE 1 MODULE — Direct emissions

Independent entry point. A user can complete Scope 1 alone and generate a Scope 1-only report.

### 4.1 Sub-categories (GHG Protocol)
| # | Category | Typical inputs | Method |
|---|---|---|---|
| 1.1 | **Stationary combustion** | Boilers, furnaces, DG sets, kilns, thermal oil heaters | Fuel quantity × fuel factor |
| 1.2 | **Mobile combustion** | Owned/leased fleet: trucks, forklifts, cars, ships | Fuel quantity (preferred) or distance × vehicle factor |
| 1.3 | **Process emissions** | Cement clinker, lime, steel, ammonia, aluminium, glass | IPCC Tier 1/2 process equations |
| 1.4 | **Fugitive emissions** | Refrigerants (HFCs), SF₆ in switchgear, CH₄ leaks, fire suppressants | Refrigerant top-up mass × GWP |

### 4.2 Input specification — Stationary combustion
Each row:
```
facility_id       (select)
fuel_type         (select — LPG, diesel, natural gas, coal (by grade),
                   furnace oil, biomass, biogas, petcoke, LNG …)
quantity          (number)
unit              (select — L, kL, kg, t, m³, MMBtu, GJ, kWh)
period            (defaults to reporting period; allows monthly rows)
```
Engine output per row: CO₂, CH₄, N₂O separately, then CO₂e. Biomass CO₂ is calculated but reported **outside the scopes** as a biogenic memo item — a detail that signals competence to any professional reviewing your report.

### 4.3 Input specification — Mobile combustion
Two methods, user picks per vehicle class:
- **Fuel-based** (preferred, lower uncertainty): litres of diesel/petrol/CNG
- **Distance-based** (fallback): km × vehicle type × fuel type factor

The UI must state which method is being used and flag distance-based rows as lower data quality.

### 4.4 Input specification — Fugitive / refrigerants

GHG Protocol offers three approaches — Screening, **Simplified Material Balance**, and full Material Balance. v1 implements the **simplified material balance**, which most companies can actually answer:

```
Refrigerant emissions (kgCO2e) =
      [ (P_new  − C_new)          -- charge lost when new equipment was installed
      +   P_service               -- refrigerant added during servicing (top-up)
      + (C_disposed − R_disposed) -- charge remaining at disposal, minus recovered
      ] × GWP of that refrigerant
```

A servicing-only shortcut (`P_service × GWP`) is offered as an express input, but it **omits install and disposal losses** and must be flagged as such in the UI and report. Do not call the shortcut "material balance" — that name belongs to the full inventory-difference method (`(I_begin − I_end) + P − S + (C_begin − C_end)`), which is a Phase 2 option.

Refrigerant picker must cover R-134a, R-410A, R-404A, R-407C, R-32, R-1234yf, HFC-23, SF₆, NF₃ and PFCs. Two subtleties the engine must handle:

- **Blends have no published AR6 GWP.** AR6 publishes values for pure species only. R-410A, R-404A, R-407C and similar blends require a mass-weighted average of their component GWPs. Store each blend's composition and the derived GWP as versioned reference data with its composition source — never as a hardcoded number.
- **R-1234yf has an AR6 GWP₁₀₀ of about 0.5** — effectively zero. Footnote it, or reviewers will read it as a bug.

**Montreal Protocol gases (R-22/HCFC-22, CFCs) are reported outside the scopes.** The Corporate Standard requires them to be disclosed separately, exactly like biogenic CO₂. The data model carries a `montreal_protocol_gas_kg` memo field alongside `biogenic_co2_kg`; these quantities are calculated and shown, but never added into the Scope 1 total.

This is the category most tools get wrong or omit — including it well is a differentiator, because HFC leakage is frequently 5–20% of a manufacturer's Scope 1.

### 4.5 Process emissions
Ship v1 with a small number of high-impact, well-defined processes (cement clinker, lime calcination, iron & steel reduction, ammonia) using IPCC Tier 1 defaults, plus a **generic "other process — enter tCO₂e directly"** escape hatch so users with their own calculation are not blocked. Do not attempt full IPCC 2006 Volume 3 coverage in v1.

### 4.6 Scope 1 screen behaviour
- Four collapsible sections, one per sub-category, each with a running subtotal
- "Add row" repeater pattern; rows are cheap, forms are not
- A persistent right-hand rail showing live Scope 1 total and a donut of the four sub-categories
- Bulk CSV template per sub-category

---

## 5. SCOPE 2 MODULE — Purchased energy

Independent entry point. The smallest module, and the one where correctness is most visible to professionals.

### 5.1 The dual reporting requirement
GHG Protocol Scope 2 Guidance requires **both**:

- **Location-based** — grid average emission factor for the region where consumption occurs
- **Market-based** — reflects contractual instruments: PPAs, green tariffs, RECs/I-RECs, supplier-specific factors; residual mix where no instrument exists

The Scope 2 Guidance requires dual reporting **wherever the company operates in markets that offer contractual instruments**. For a purely domestic Indian filer with no PPAs or I-RECs, the market-based figure degenerates to the grid average — but the engine should still compute and display both universally, because the alternative is a tool that behaves differently for different users and confuses everyone.

**The engine must compute and the report must display both, side by side.** A tool that shows only one number will be dismissed by anyone who knows the standard.

### 5.2 Inputs
| Field | Notes |
|---|---|
| Facility & grid region | Drives which grid factor applies (e.g. India national/CEA, or state grid; EU country; US eGRID subregion) |
| Purchased electricity (kWh/MWh) | Per facility, per period |
| Contractual instruments | Renewable kWh covered by PPA/REC/green tariff + supplier factor if known |
| Purchased steam, heat, cooling | Quantity + supplier factor or default |
| Self-generated renewable consumed on site | Zero-emission, but must be recorded to keep the energy balance honest |

### 5.3 Calculation
```
Location-based = Σ (grid_kWh × grid_average_factor_for_region)

Market-based   = Σ (contracted_kWh × contract_factor)              [often 0]
               + Σ (residual_kWh   × residual_mix_factor_for_region)
```
Where a residual mix factor is unpublished for the region (true for most of Asia including India), the engine substitutes the grid average and **explicitly labels it as such in the report footnote**. Silent substitution is how tools lose credibility.

### 5.4 Grid factor sourcing
| Region | Location-based (grid average) | Market-based residual mix |
|---|---|---|
| India | **CEA CO₂ Baseline Database for the Indian Power Sector** — use the **weighted average emission rate**, not the OM/BM/combined-margin figures, which are constructed for CDM project baselines. Getting this wrong is the most common visible error in Indian tools. | Not published — substitute grid average and footnote it |
| UK | **UK Government GHG Conversion Factors for Company Reporting (DESNZ)** | **AIB European Residual Mixes** |
| EU | National factors / **IEA** | **AIB European Residual Mixes** |
| US | **EPA eGRID** subregion factors (location-based only) | **Green-e Residual Mix Emissions Rates** — eGRID does not publish residual mix |
| Elsewhere | **IEA** national factors as fallback | Grid average, footnoted |

Grid factors change annually and materially. They must be versioned rows in the factor registry keyed by `(region, year)`, never constants in code.

### 5.5 The "what-if" hook
Scope 2 is where the most compelling interaction lives: a slider for *"what if X% of your electricity came from a renewable PPA?"* recalculating the market-based number live. This is the single feature most likely to make a visitor share the tool — and it is a natural bridge into an INVTY consulting conversation.

---

## 6. SCOPE 3 MODULE — Value chain

Independent entry point, and the hardest UX problem in the product. Fifteen categories will overwhelm a visitor unless the module is designed around **relevance screening first, data entry second**.

### 6.1 The three-step flow

**Step 1 — Relevance screening.** Present all 15 categories with a plain-language description and a sector-informed default recommendation (Likely material / Possibly material / Rarely material for your sector). User marks each: *Include · Exclude · Not applicable*. Exclusions require a one-line reason — which then prints in the report's exclusions table, exactly as GHG Protocol expects.

**Step 2 — Method selection per included category.** For each, choose the calculation method (see 6.3). The UI shows the accuracy/effort trade-off explicitly.

**Step 3 — Data entry** for included categories only.

This turns "15 daunting categories" into "you have 4 that matter — let's do those."

### 6.2 The 15 categories

**Upstream**
| # | Category | Common method in v1 |
|---|---|---|
| 1 | Purchased goods & services | Spend-based (EEIO) → Average-data → Supplier-specific |
| 2 | Capital goods | Spend-based (EEIO) |
| 3 | Fuel- & energy-related activities (not in S1/S2) | WTT + T&D losses on Scope 1 & 2 data — **auto-derived** |
| 4 | Upstream transportation & distribution | Distance-based (t·km × mode factor) or spend-based |
| 5 | Waste generated in operations | Waste-type-specific (mass × treatment factor) |
| 6 | Business travel | Distance-based (air by haul & class, rail, road, hotel nights) |
| 7 | Employee commuting | Average-data (headcount × mode split × distance × days) + WFH |
| 8 | Upstream leased assets | Same engines as S1/S2 applied to leased footprint |

**Downstream**
| # | Category | Common method in v1 |
|---|---|---|
| 9 | Downstream transportation & distribution | Distance-based |
| 10 | Processing of sold products | Site-specific / user-entered |
| 11 | Use of sold products | Direct-use-phase model (energy-using products) — highest impact for many manufacturers |
| 12 | End-of-life treatment of sold products | Mass × material × disposal route |
| 13 | Downstream leased assets | S1/S2 engines |
| 14 | Franchises | S1/S2 engines |
| 15 | Investments | Investment-specific / PCAF-style (Phase 2) |

**Category 3 is auto-derived** — once the user has entered Scope 1 fuel and Scope 2 electricity, the tool can compute well-to-tank and T&D losses with zero additional input. Doing this automatically and showing it appear is a small piece of magic that makes the tool feel intelligent. Prioritise it.

**Category 11** deserves special attention if INVTY's audience makes energy-using products: it usually dwarfs everything else, and getting it visibly right is the strongest credibility signal in the whole report.

### 6.3 Method hierarchy and honesty
For each category the engine supports a ranked set:

| Tier | Method | Uncertainty | Data quality tier |
|---|---|---|---|
| 1 | Supplier-specific (actual supplier data) | Low | Primary |
| 2 | Hybrid | Low–Med | Primary/Secondary |
| 3 | Average-data (mass/quantity × average factor) | Medium | Secondary |
| 4 | Spend-based (₹ or $ × EEIO factor) | High | Proxy |
| 5 | Sector benchmark extrapolation | Very high | Estimated |

The UI must show the tier per line item and the report must aggregate it. A professional trusts a tool that admits Tier 4 more than one that pretends everything is Tier 1.

### 6.4 Spend-based input
Currency and inflation matter. A spend-based EEIO factor is expressed per unit currency **in a specific base year**. The engine must:
1. Accept spend in the user's currency
2. Convert to the factor's reference currency at a stored, dated exchange rate
3. Deflate/inflate to the factor's reference year using a stored price index
4. Record all three conversions in the audit trail

Skipping steps 2–4 is the most common silent error in Scope 3 tools and produces numbers that are wrong by tens of percent.

### 6.5 Factor source strategy per category
- Categories 3, 4, 5, 6, 7, 9, 12: the **UK Government GHG Conversion Factors (DESNZ**, formerly published by DEFRA — use the current publisher name on the methodology page**)** cover these well and are free, well-documented and annually updated
- Categories 1, 2 (spend-based): **EEIO only** — USEEIO (US), EXIOBASE (multi-region) or an Indian input-output derived set; **Climatiq** as a commercial upgrade path. Note that **ecoinvent is a process-based LCI database in physical units (per kg, per m³), not an EEIO source** — it has no spend-based factors. It belongs in the average-data and supplier-specific tiers, not here
- Categories 10, 11, 13, 14: engine reuse or direct user entry
- Category 15: Phase 2

---

## 7. The accuracy core — Emission Factor Registry & Calculation Engine

This section is the heart of the product. If everything else is mediocre but this is excellent, you have a credible tool. The reverse is not true.

### 7.1 Design principle: factors are immutable, versioned data — never code

Every emission factor is a row with a full provenance record. Factors are **never edited**; a revised factor is a **new row** with a new `version_id` and the old one is marked superseded. Any calculation ever performed can be replayed exactly, years later, because it stores the `factor_version_id` it used — not the factor value alone.

This is what makes the phrase "our numbers are accurate" defensible. Without it, it is marketing.

### 7.2 Emission factor schema

```sql
emission_factor (
  id                  uuid PK,
  factor_set_id       uuid FK,        -- e.g. "DESNZ 2026", "CEA 21.0"
  activity_key        text,           -- canonical: "fuel.diesel.stationary"
  region              text,           -- ISO code, grid region, or "GLOBAL"
  value               numeric,
  numerator_unit      text,           -- "kgCO2e" | "kgCO2" | "kgCH4" | "kgN2O"
  denominator_unit    text,           -- "L" | "kWh" | "t.km" | "INR" | "kg"
  gas                 text,           -- CO2 | CH4 | N2O | HFC-134a | SF6 | CO2e
  gwp_set             text,           -- AR6 | AR5 | AR4 | null (if already CO2e)
  scope_hint          text,           -- 1 | 2 | 3
  ghg_category        text,           -- e.g. "3.6"
  reference_year      int,            -- year the factor represents
  currency            text,           -- for spend-based factors
  currency_base_year  int,
  source_name         text,           -- "UK Government GHG Conversion Factors
                                      --  for Company Reporting (DESNZ)"
  source_url          text,
  source_table_ref    text,           -- exact table/row in the publication
  uncertainty_pct     numeric,        -- if published
  valid_from          date,
  valid_to            date,
  superseded_by       uuid,
  created_at          timestamptz
)
```

`activity_key` is the contract between the UI and the factor library. The UI never references a factor by ID or value — only by activity key + region + reporting year. The registry resolves it.

### 7.3 Factor resolution algorithm

```
resolve(activity_key, region, reporting_year, gwp_set, preferred_source?)
  1. Exact match on (activity_key, region, reference_year) in preferred source
  2. Same region, nearest prior reference_year        → flag "factor year mismatch"
  3. Parent region (state → national → continental)   → flag "regional proxy"
  4. GLOBAL default                                    → flag "global proxy"
  5. No match                                          → hard error, never silently zero
```

Every resolution returns not just a value but a **resolution record**: which rule fired, what was flagged. Those flags feed directly into the data quality tier and the report footnotes. **Rule 5 matters most: a missing factor must never become a zero.** Silent zeros are how tools produce confidently wrong totals.

### 7.4 Unit normalisation layer

A dedicated service, independent of the factor registry. Users will enter litres, kilolitres, gallons, tonnes, kg, m³, standard m³, MMBtu, GJ, kWh, MWh, km, miles, t·km.

- Every unit converts to a canonical SI base per dimension (energy → MJ, mass → kg, volume → m³, distance → km).
- **Fuel volume ↔ mass ↔ energy conversions require fuel-specific density and calorific value**, which are themselves versioned reference data with sources. Converting litres of diesel to kg is not a units problem, it is a physics problem with a dated coefficient. Treat it as such.
- Conversions are pure functions, exhaustively unit-tested with published reference values.

### 7.5 Calculation engine

Stateless, deterministic, versioned. Input: a set of activity records + a configuration. Output: a calculation run.

```
CalculationRun {
  run_id, inventory_id, engine_version, gwp_set,
  factor_set_pins: {desnz: "2026.1", cea: "21.0", ...},
  executed_at,
  line_results: [ LineResult ],
  totals: { scope1, scope2_location, scope2_market, scope3_by_category, biogenic }
}

LineResult {
  activity_record_id,
  activity_value, activity_unit,
  normalised_value, normalised_unit,
  factor_version_id, factor_value, factor_units,
  gas_breakdown: { CO2: x, CH4: y, N2O: z },
  gwp_applied: { CH4: 29.8, N2O: 273 },
  emissions_kgco2e,
  resolution_flags: [...],
  data_quality_tier
}
```

**Every single number in the final PDF traces back to one `LineResult`.** That is the whole design goal. The engine also emits a machine-readable calculation log that can be exported as an annexe — the feature that turns your tool from "a calculator" into "something an assurance provider will accept as a starting point."

Engine requirements:
- Pure functions, no I/O during calculation (factors loaded up front)
- Deterministic: same inputs + same pins = same outputs, forever
- `engine_version` bumped on any methodology change; historical runs never recalculated in place
- Runs in < 200 ms for a typical inventory so the UI can be live

### 7.6 Factor ingestion pipeline

Government factor sets arrive as spreadsheets, annually, in inconsistent formats. Build this properly once:

```
Source publication (XLSX/CSV/PDF)
   → Source-specific parser (one per source, versioned)
   → Staging table with raw values
   → Validation suite:
        · every row has source_table_ref
        · units parse against the unit dictionary
        · value within ±40% of prior year's equivalent, else flagged for human review
        · no duplicate (activity_key, region, year)
   → Human review queue for flagged rows (admin UI)
   → Publish as new factor_set version, atomic
   → Regression suite: recalculate 30 golden-path inventories, diff the outputs,
     require an explanation for any change > 1%
```

That final regression step is what stops an annual factor update from silently breaking your numbers.

### 7.7 Commercial API adapter (Phase 2)

Define a `FactorProvider` interface with a single method — `resolve(query) → FactorResolution`. Implement `LocalRegistryProvider` in v1. Adding `ClimatiqProvider` (spend- and activity-based) or `EcoinventProvider` (process-based LCI, average-data tier) later is then a new class plus a routing rule (e.g. "use commercial for Scope 3 Cat 1 and 2, local for everything else"), with no engine changes. Cache all remote resolutions with their version pins so runs stay reproducible even if the vendor changes a value.

### 7.8 Data quality scoring

Per line item, score against the GHG Protocol Scope 3 quality dimensions — technological, temporal, geographical, completeness, reliability — on a 1–5 scale, largely auto-derived:

| Signal | Effect |
|---|---|
| Method tier (supplier-specific → spend-based) | Technological representativeness |
| Factor `reference_year` vs reporting year | Temporal |
| Resolution flag "regional proxy"/"global proxy" | Geographical |
| Excluded categories / missing facilities | Completeness |
| Source authority (government > commercial > estimate) | Reliability |

Roll up emissions-weighted to a headline **Data Quality Score** with a letter grade. Print it on page 2 of the report, next to the total. This is both honest and a powerful sales hook: a low score is a reason to talk to INVTY.

---

## 8. Data model

### 8.1 Entity overview

```
organisation ──< facility
     │
     └──< inventory (one per reporting period + boundary config)
              │
              ├──< activity_record ──> emission_factor (via resolution)
              │
              ├──< calculation_run ──< line_result
              │
              └──< report ──> report_asset (PDF in object storage)

emission_factor >── factor_set >── factor_source
gwp_set ──< gwp_value
unit ──< unit_conversion
sector_benchmark
lead / session
```

### 8.2 Core tables

```sql
organisation (
  id, name, country, sector_code, sector_scheme,   -- NIC/NAICS/ISIC
  revenue, revenue_currency, employees,
  created_at, session_id, lead_id
)

facility (
  id, organisation_id, name, country, region,
  grid_region,            -- resolves Scope 2 location factor
  floor_area, production_volume, production_unit
)

inventory (
  id, organisation_id,
  period_start, period_end,
  consolidation_approach,        -- operational_control | financial | equity
  base_year,
  gwp_set,                       -- AR6 default
  status,                        -- draft | complete | reported
  track                          -- express | detailed
)

activity_record (
  id, inventory_id, facility_id,
  scope,                  -- 1 | 2 | 3
  ghg_category,           -- '1.1' … '3.15'
  activity_key,           -- canonical key into the factor registry
  method,                 -- supplier_specific | average_data | spend_based | ...
  value, unit,
  currency, currency_year,       -- spend-based only
  period_start, period_end,
  source_note,                   -- user's own note: "from invoice #..."
  evidence_file_id,              -- optional upload
  data_quality_tier,
  created_at, updated_at
)
```

### 8.3 Why `activity_record` is method-agnostic

One table holds a litre of diesel, a rupee of steel spend, a passenger-kilometre and a tonne of landfilled waste. The differentiator is `activity_key` + `method` + `unit`. This is deliberate:

- Express and Detailed tracks write to the same table → upgrading a category is a row edit, not a migration
- New categories are new activity keys, not new tables
- The calculation engine has exactly one input shape
- CSV import has exactly one target

The alternative — a table per category — produces 19 tables, 19 import paths, 19 UI code paths, and a rewrite the first time you add a framework.

### 8.4 Calculation results

```sql
calculation_run (
  id, inventory_id, engine_version, gwp_set,
  factor_set_pins jsonb,       -- {"desnz":"2026.1","cea":"21.0"}
  executed_at, is_current
)

line_result (
  id, run_id, activity_record_id,
  normalised_value, normalised_unit,
  factor_version_id, factor_value,
  co2_kg, ch4_kg, n2o_kg, other_gas_kg,
  gwp_applied jsonb,
  emissions_kgco2e,
  biogenic_co2_kg,             -- reported separately, outside scopes
  montreal_protocol_gas_kg,    -- HCFC/CFC — also outside scopes, memo only
  resolution_flags jsonb,
  data_quality jsonb
)
```

Runs are append-only. `is_current` points at the latest. A report always references a specific `run_id`, so a downloaded PDF can be reproduced byte-for-byte in the future.

### 8.5 Reference data (versioned, admin-managed)
`factor_source`, `factor_set`, `emission_factor`, `gwp_set`, `gwp_value`, `unit`, `unit_conversion`, `fuel_property` (density, NCV), `grid_region`, `sector_benchmark`, `currency_rate`, `price_index`, `ppp_series`.

---

## 9. System architecture

### 9.1 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 15 (React, TypeScript, App Router)** | SSR for SEO on the marketing shell, fast client interactivity for the calculator, easy embed into INVTY's site |
| Styling | **Tailwind CSS + shadcn/ui + Framer Motion** | Fast to build a distinctive, modern UI; motion is where "futuristic" actually comes from |
| Charts | **Recharts** (dashboard) + **D3** (Sankey) | |
| API | **FastAPI (Python 3.12)** | The calculation and factor domain is data/scientific — Python's ecosystem (pandas, pint for units, pydantic for validation) is a real advantage here |
| Calculation engine | Pure Python package, separately versioned and independently testable | |
| Database | **PostgreSQL 16** | JSONB for flexible factor metadata, strong numeric types, robust |
| Cache / queue | **Redis** + **Celery** (or RQ) | Async PDF generation, factor caching |
| Object storage | **S3-compatible** (AWS S3 / Cloudflare R2) | Reports, uploads, evidence files |
| PDF rendering | **Playwright + headless Chromium** | HTML/CSS templates → pixel-accurate PDF; far more maintainable than a PDF DSL |
| Auth | Magic-link (v1) → **Auth0/Clerk or Django-style sessions** (Phase 2) | |
| Analytics | PostHog or Plausible + server-side funnel events | |
| Hosting | Vercel (frontend) + AWS ECS/Fargate or Railway (API, workers) | |
| CRM push | HubSpot / Zoho webhook | |

**Why a Python API rather than an all-JS stack:** the calculation engine is the product. Python gives you `pint` for dimensional analysis, `pydantic` for strict input validation, pandas for the factor ingestion pipeline, and a testing culture suited to numeric correctness. The cost is running two runtimes — acceptable, and cleanly separated.

If your team is JS-only, a Node/NestJS API is workable, but budget extra effort for the unit system and the factor ingestion tooling.

### 9.2 Service decomposition

```
┌───────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                           │
│  Marketing shell │ Setup wizard │ S1/S2/S3 calculators            │
│  Results dashboard │ Report preview                               │
└──────────────────────────────┬────────────────────────────────────┘
                               │ REST/JSON (+ SSE for job status)
┌──────────────────────────────▼────────────────────────────────────┐
│                        API GATEWAY (FastAPI)                      │
│  Auth · rate limiting · request validation · session management   │
└───┬──────────┬──────────┬───────────┬──────────┬──────────────────┘
    │          │          │           │          │
┌───▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌───▼─────┐ ┌──▼──────────┐
│Inventory│ │ Factor │ │  Calc   │ │ Report  │ │   Lead      │
│ Service │ │Registry│ │ Engine  │ │ Service │ │  Service    │
│         │ │Service │ │(library)│ │         │ │             │
│ CRUD    │ │resolve │ │ pure    │ │ template│ │ capture     │
│ import  │ │ cache  │ │ funcs   │ │ render  │ │ CRM push    │
│ validate│ │ version│ │ audit   │ │ queue   │ │ email       │
└────┬────┘ └───┬────┘ └────┬────┘ └────┬────┘ └──┬──────────┘
     │          │           │           │         │
┌────▼──────────▼───────────▼───────────▼─────────▼────────────────┐
│  PostgreSQL  │  Redis  │  S3  │  Celery workers  │  SMTP/SES     │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 Key API surface

```
POST   /api/sessions                          → anonymous session
POST   /api/organisations
POST   /api/inventories
GET    /api/inventories/{id}

GET    /api/catalog/activities?scope=1&sector=...   → available activity keys + units
GET    /api/catalog/units?dimension=volume
GET    /api/catalog/factors/preview?activity_key=...&region=...&year=...

POST   /api/inventories/{id}/activities            → single row
POST   /api/inventories/{id}/activities:bulk       → CSV import
GET    /api/inventories/{id}/activities

POST   /api/inventories/{id}/calculate             → CalculationRun (sync, <200ms)
GET    /api/inventories/{id}/results                → current run + breakdowns
POST   /api/inventories/{id}/whatif                 → scenario, non-persisting

POST   /api/inventories/{id}/reports                → enqueue job, returns job_id
GET    /api/jobs/{job_id}                           → status (SSE stream available)
GET    /api/reports/{report_id}/download            → signed URL

POST   /api/leads                                   → email gate submission
```

### 9.4 Non-functional requirements
- **Live calculation** p95 < 200 ms (in-memory factor cache, warm at boot)
- **Report generation** p95 < 20 s
- **Availability** 99.5% — this is a marketing asset; downtime is embarrassing, not catastrophic
- **Rate limits** on anonymous endpoints: 100 calc/hour/IP, 5 reports/hour/IP. Public tools attract abuse
- **CSV upload** cap 5 MB / 20,000 rows; virus-scan uploads
- **Horizontal scale**: API and workers stateless; all session state in Postgres/Redis

---

## 10. Report generation pipeline

### 10.1 Flow

```
User clicks "Download report"
   ↓
Email gate (if not yet captured)
   ↓
POST /reports  →  Celery job enqueued, job_id returned
   ↓
Worker:
   1. Freeze inventory → immutable snapshot (JSON) bound to a calculation_run
   2. Assemble report model (totals, breakdowns, quality, exclusions, methodology)
   3. Render charts server-side to SVG (deterministic, no client dependency)
   4. Render Jinja2 → HTML with the INVTY report stylesheet
   5. Playwright → Chromium → print-to-PDF (A4, print CSS, headers/footers)
   6. Post-process: PDF metadata, document properties, optional page-level protection
   7. Upload to S3, generate 30-day signed URL
   8. Email the link; emit CRM event
   ↓
Client polls / SSE → download button becomes active
```

**Server-side chart rendering matters.** If charts render in the browser, your PDF depends on the user's fonts and screen. Render SVG on the server so every report is identical.

### 10.2 The INVTY watermark

The watermark sits **behind** the content on every page, as you specified. Implementation in the print stylesheet:

```css
@page {
  size: A4;
  margin: 20mm 18mm 22mm 18mm;
}

body::before {
  content: "";
  position: fixed;      /* fixed → repeats on every printed page */
  inset: 0;
  background-image: url("data:image/svg+xml;base64,<INVTY logo>");
  background-repeat: no-repeat;
  background-position: center center;
  background-size: 55% auto;
  opacity: 0.06;        /* 5–8% keeps text fully legible */
  transform: rotate(-30deg);
  z-index: 0;           /* content sits above */
  pointer-events: none;
}

.page-content { position: relative; z-index: 1; }
```

Notes that matter in practice:
- **Embed the logo as a base64 data URI**, not a remote URL — the headless browser must not depend on network fetches at render time
- Use a **vector (SVG) logo** so it stays crisp at any zoom and print DPI
- Opacity 0.05–0.08 for a grayscale mark; go lower if the logo is dark
- Add a repeating footer: `INVTY · <company> GHG Inventory <period> · Page X of Y · Generated <date>`
- Add a small header mark on every page except the cover
- For the Express track, add a diagonal **"SCREENING ESTIMATE"** band as a second, more visible watermark — protects you and creates an upgrade motive
- Store the watermark configuration (opacity, size, angle, asset version) in config, not hardcoded, so INVTY branding can change without a code deploy

### 10.3 Report structure

| Page | Content |
|---|---|
| Cover | INVTY branding, company name, reporting period, boundary, report type label, generation date, unique report ID |
| 1 | Executive summary — total tCO₂e, scope split donut, top 5 sources, data quality grade |
| 2 | Organisational & operational boundary declaration; consolidation approach; facilities in scope |
| 3 | Scope 1 detail — by sub-category, by facility, by gas |
| 4 | Scope 2 detail — **location-based and market-based side by side**, energy mix table |
| 5–7 | Scope 3 detail — per included category, method used, data quality per category |
| 8 | Exclusions table — every excluded category with the user's stated reason |
| 9 | Intensity metrics — tCO₂e per revenue, per employee, per unit of production, per m² |
| 10 | Data quality assessment — scoring by dimension, improvement recommendations |
| 11 | Methodology — standards applied, GWP set, factor sources with versions and URLs, unit conversion basis |
| 12 | Limitations & disclaimer |
| Annexe A | Full calculation log — every line item with its factor and source (optional, toggled) |
| Back | INVTY contact / next-step CTA |

Page 11 is the page a professional turns to first. Make it complete and specific — exact publication names, versions, and years.

### 10.4 Multi-framework rendering

The report engine takes `(inventory_snapshot, calculation_run, template_id)`. Templates are declarative mappings:

```yaml
template: brsr_core_principle6
sections:
  - id: p6_essential_1
    label: "Total energy consumption (GJ) and energy intensity"
    source: inventory.energy.total_gj
  - id: p6_essential_7a
    label: "Total Scope 1 emissions (tCO2e)"
    source: run.totals.scope1
    unit: tCO2e
  - id: p6_essential_7b
    label: "Total Scope 2 emissions (tCO2e)"
    source: run.totals.scope2_location
  - id: p6_intensity_turnover
    formula: "(run.totals.scope1 + run.totals.scope2_location) / org.revenue"
  - id: p6_intensity_turnover_ppp
    label: "Total Scope 1+2 intensity per rupee of turnover, PPP-adjusted"
    formula: "(run.totals.scope1 + run.totals.scope2_location)
              / (org.revenue / ppp.usd_inr[reporting_year])"
  - id: p6_intensity_physical
    formula: "(run.totals.scope1 + run.totals.scope2_location) / org.production_volume"
```

BRSR Core requires the PPP-adjusted turnover intensity, so the reference data set needs a **dated PPP conversion series (USD/INR)** alongside `currency_rate` and `price_index`.

Adding ESRS E1 or CDP later is a new YAML file plus a rendering partial. No engine change. **This is the single most valuable piece of forward-compatibility in the architecture** given you want four frameworks.

### 10.5 Other export formats
- **XLSX workbook** — one sheet per scope, one sheet of raw line results, one methodology sheet. Professionals want this more than they want the PDF. Ship it in v1.
- **JSON** — full inventory + run, for anyone integrating
- **CSV** — line results only

---

## 11. UI/UX design system

### 11.1 Design position

"Futuristic" for an industry-professional audience does **not** mean neon and glassmorphism everywhere. It means: dark-first surfaces, precise data-dense layouts, purposeful motion, live numbers that visibly respond, and zero decorative clutter. Think a modern trading terminal or a mission-control console — instrumentation, not decoration. Professionals trust interfaces that look like tools, not brochures.

The three signature moves that will make this feel modern and expensive:
1. **Live number transitions** — every total animates (count-up, ~400 ms, ease-out) as the user types. Nothing communicates "this is computing for me" more cheaply.
2. **The persistent emissions rail** — a fixed right-hand panel showing the running total and scope split that is always visible, updating continuously. The user never wonders what their number is.
3. **Provenance on hover** — hovering any number reveals its factor, source and year in a small popover. This is the credibility feature, and it doubles as the "futuristic" feel.

### 11.2 Visual language

**Colour**
```
Surface base      #0B0F14   (deep charcoal-blue)
Surface raised    #131A22
Surface overlay   #1B242E
Border subtle     #22303C
Text primary      #E8EEF4
Text secondary    #8FA3B5
Accent primary    #00D4A0   (signal green — INVTY brand hook)
Accent secondary  #3B9EFF   (data blue)

Scope 1           #FF7A45   (amber-orange — direct/combustion)
Scope 2           #3B9EFF   (blue — electricity)
Scope 3           #A78BFA   (violet — value chain)
Biogenic memo     #64748B   (grey — outside scopes)

Quality: A #00D4A0 · B #7DD87D · C #F5C542 · D #FF9A45 · E #FF5C5C
Warning #F5C542 · Error #FF5C5C
```
Ship a light theme too — many industrial users work in bright environments and will print screens. Define the palette as CSS custom properties on `:root` and override in a `prefers-color-scheme` / `[data-theme]` block.

Scope colours must be **absolutely consistent** across every chart, table, badge and the PDF. That consistency is what makes a dashboard read as one system.

**Typography**
- UI: **Inter** (or Geist) — 14px base, 1.5 line height
- Numerals: **tabular figures everywhere** (`font-variant-numeric: tabular-nums`). Non-tabular numbers in a live-updating total look broken.
- Data/monospace: **JetBrains Mono** for factor values, IDs, units
- Scale: 12 / 14 / 16 / 20 / 24 / 32 / 48

**Spacing & shape** — 4px base grid; radii 6px (inputs), 10px (cards), 16px (modals); elevation via border + subtle inner glow rather than heavy drop shadows, which read as dated.

**Motion** — 150 ms for hovers/toggles, 250–400 ms for panel transitions and number counts, spring easing for the scope-card expansion. Respect `prefers-reduced-motion` and disable all of it.

### 11.3 Screen inventory

| # | Screen | Purpose |
|---|---|---|
| 1 | Landing / hero | Value proposition, "Start calculating — no signup" CTA, trust signals (standards logos, methodology link) |
| 2 | Organisation setup | 6 fields, single screen, progress indicator |
| 3 | **Scope selector hub** | Three large cards; the product's home base |
| 4 | Scope 1 workspace | 4 collapsible sub-category sections + live rail |
| 5 | Scope 2 workspace | Facility energy table + dual-result panel + renewable slider |
| 6 | Scope 3 relevance screener | 15-category triage grid |
| 7 | Scope 3 method chooser | Per included category, accuracy/effort trade-off cards |
| 8 | Scope 3 workspace | Category-by-category entry with accordion navigation |
| 9 | Bulk import | Drag-drop → column mapping → validation preview → commit |
| 10 | Validation review | All warnings and outliers in one triage list |
| 11 | **Results dashboard** | The payoff screen |
| 12 | What-if scenarios | Sliders and toggles over the current inventory |
| 13 | Email gate | Minimal modal, 4 fields, clear value statement |
| 14 | Report preview & download | Paginated preview + format selector |
| 15 | Admin: factor manager | Internal — factor set versions, ingestion review queue |
| 16 | Admin: leads & analytics | Internal — funnel, lead list, inventory summaries |

### 11.4 Scope selector hub — the key screen

```
┌────────────────────────────────────────────────────────────────────┐
│  INVTY                              Acme Steel Ltd · FY 2025–26  ⚙ │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   Your carbon inventory                    ┌──────────────────┐   │
│   Complete any scope in any order          │  TOTAL           │   │
│                                            │  1,616           │   │
│  ┌───────────────┐ ┌───────────────┐       │  tCO₂e           │   │
│  │ ▲ SCOPE 1     │ │ ⚡ SCOPE 2    │       │  ▬▬▬▬▬▬▬▬▬      │   │
│  │ Direct        │ │ Purchased     │       │  S1  ███ 0       │   │
│  │ emissions     │ │ energy        │       │  S2  ███ 412     │   │
│  │               │ │               │       │  S3  ███ 1,204   │   │
│  │ Fuel, fleet,  │ │ Electricity,  │       │                  │   │
│  │ process,      │ │ steam, heat   │       │  Quality:  C     │   │
│  │ refrigerants  │ │               │       │  ────────────    │   │
│  │               │ │               │       │  Coverage 2 of 3 │   │
│  │ ○ Not started │ │ ● Complete    │       │                  │   │
│  │ ~8 min        │ │ 412 tCO₂e     │       │  [ Get report ]  │   │
│  │               │ │               │       └──────────────────┘   │
│  │ [ Start ]     │ │ [ Review ]    │                              │
│  └───────────────┘ └───────────────┘                              │
│  ┌───────────────────────────────────┐                            │
│  │ ⛓ SCOPE 3 — Value chain           │                            │
│  │ 15 categories · 3 included         │                            │
│  │ ◐ In progress — 1,204 tCO₂e        │                            │
│  │ ▓▓▓▓▓▓▓░░░░░░░  Cat 1, 3, 6 done   │                            │
│  │ [ Continue ]   [ Screen categories]│                            │
│  └───────────────────────────────────┘                            │
└────────────────────────────────────────────────────────────────────┘
```

Design rules for this screen:
- The three scopes are **peers, never a linear wizard**. A user who only cares about Scope 1 must never be forced through Scope 2.
- Each card owns its state, its subtotal and its own time estimate.
- The rail is always present, always live, and always offers the report — a user can generate a Scope-1-only report at any moment.
- Scope 3's card is wider because it contains 15 sub-units; visual weight should match conceptual weight.

### 11.5 Data entry row pattern

Every activity row across all three scopes uses the same component:

```
┌────────────────────────────────────────────────────────────────────┐
│ [Facility ▾] [Diesel — stationary ▾] [ 45,000 ] [L ▾]  = 113.0 t  │
│  ⓘ DESNZ 2026 · Fuels tbl · 2.5110 kgCO₂e/L · Primary data     ⋮ │
└────────────────────────────────────────────────────────────────────┘
```
- The result appears on the same line, updating live
- The provenance strip below is always visible (not hover-only) for entered rows — this is the "accurate and traceable" promise made visual
- `⋮` opens: add note, attach evidence, change method, override factor (with mandatory justification), delete
- Validation warnings appear inline in amber, never as a blocking modal

*(The factor value shown is illustrative and reflects the current DESNZ "diesel — average biofuel blend" figure of roughly 2.51 kgCO₂e/L; 100% mineral diesel is roughly 2.66. Production values must always be resolved from the pinned publication via the registry, never typed into a template.)*

### 11.6 Results dashboard composition

Row 1 — four KPI tiles: Total tCO₂e · Intensity (tCO₂e/₹ crore) · Data quality grade · Coverage (categories included / material)
Row 2 — stacked bar of scope split (left, 2/3 width) + donut of top emission sources (right)
Row 3 — **Sankey diagram**: activities → categories → scopes → total. This is the single most impressive visual in the product and the one people will screenshot.
Row 4 — sortable table of top 20 line items with contribution % and quality tier
Row 5 — data quality panel with the five dimensions and specific improvement actions
Row 6 — what-if scenario sliders

Accessibility is not optional for an industry tool: WCAG 2.2 AA contrast, full keyboard navigation, visible focus rings, ARIA-labelled charts with a data-table fallback, and never colour alone to convey scope (always a label or pattern too).

### 11.7 Mobile
Executives will open this on a phone. Full data entry on mobile is not worth building — but the **landing page, results dashboard and report download must be fully responsive**. On small screens, the calculator prompts "continue on desktop" with a magic link that emails the session.

---

## 12. Accuracy, verification and legal position

### 12.1 How "accuracy" is actually delivered
1. **Traceability** — every number reproducible from stored inputs + pinned factor versions (Section 7)
2. **Determinism** — same inputs always give the same output, forever
3. **Golden-path test suite** — 30+ reference inventories with hand-verified expected outputs, run in CI on every commit and every factor update
4. **Independent cross-check** — for 5 reference cases, verify totals against an independent calculation (a spreadsheet built by a different person, or a comparison against a published corporate inventory). Do this before launch.
5. **Unit conversion test suite** — every conversion tested against published reference values
6. **Third-party methodology review** — have a GHG practitioner review the engine's methodology document before public launch. This costs little and is the difference between a credible tool and an embarrassing one.

### 12.2 Uncertainty communication
Every category displays a qualitative uncertainty band derived from its method tier (e.g. supplier-specific ±5%, spend-based ±40–60%). The report totals show a range, not a false-precision point value. **Round outputs sensibly** — reporting 1,616.4372 tCO₂e from spend-based data is a self-inflicted credibility wound. Round to 3 significant figures and say so.

### 12.3 Disclaimer (must appear in the report and in the tool's terms)
The report must state plainly that it is a self-declared inventory prepared from user-supplied data, that it has not been independently verified or assured, that emission factors are secondary data from the cited public sources, and that it is not a substitute for third-party assurance under ISO 14064-3 or an accredited verification. INVTY should have this wording reviewed by counsel before launch. Note also: I am not a lawyer, and this is a design recommendation rather than legal advice.

### 12.4 Compliance and privacy
- **Consent** at the email gate, with explicit purpose statement and an unsubscribe path
- **GDPR/DPDP Act** — data minimisation, right to deletion, documented retention (anonymous 30 days, leads per your retention policy)
- **Data residency** — Indian users' data in an Indian region if you target BRSR filers seriously
- Company activity data is commercially sensitive. Encrypt at rest, TLS in transit, and never expose one session's data through another's ID (use unguessable UUIDs and server-side session binding — the classic IDOR failure mode for anonymous tools)
- Rate limiting and bot protection (Turnstile/hCaptcha at the email gate only, never on the calculator)

---

## 13. INVTY website integration

**Recommended:** a subdomain, `ghg.invty.com`, deployed independently, sharing the INVTY design tokens (logo, colour accent, typography) so it feels native. Header carries INVTY branding and a link back to the main site.

**Not recommended:** an iframe embed inside an existing INVTY page. It breaks deep-linking, complicates cookies and file downloads, and constrains the layout for a data-dense app.

Entry points on the main site:
- Primary nav item: "GHG Calculator" or "Free Carbon Assessment"
- Homepage hero secondary CTA
- Inline CTA on every sustainability-services page
- Dedicated landing page optimised for search terms like "scope 1 2 3 calculator", "BRSR emissions calculator", "GHG accounting tool India"

The tool is also a strong SEO and content asset — each of the 15 Scope 3 categories justifies an explanatory page that links into the relevant calculator step.

---

## 14. Phased build plan

**Phase 0 — Foundations (3–4 weeks)**
Factor registry schema, ingestion pipeline for DESNZ + CEA + IPCC GWP sets, unit conversion service with full test suite, calculation engine core, golden-path test harness. *No UI.* Everything downstream depends on this being right; building UI first is the most common and most expensive mistake in this product category.

**Phase 1 — Scope 1 + 2 MVP (4–5 weeks)**
Setup wizard, scope hub, Scope 1 and Scope 2 workspaces, live rail, results dashboard, watermarked PDF, email gate, CRM push. **Ship this publicly.** A tool that does Scopes 1 and 2 excellently beats one that does all three poorly.

**Phase 2 — Scope 3 (5–6 weeks)**
Relevance screener, method chooser, categories 1–9 and 12, auto-derived Category 3, spend-based engine with currency/inflation handling, bulk CSV import, XLSX export.

**Phase 3 — Depth (4–5 weeks)**
BRSR report template, ISO 14064-1 template, data quality scoring, what-if scenarios, Sankey, magic-link session resume, admin factor manager.

**Phase 4 — Expansion**
CSRD/ESRS and CDP templates, commercial factor API adapter, multi-year comparison and base-year recalculation, full accounts and team collaboration, target setting, Category 15 / PCAF.

Roughly 16–20 weeks to a complete v1 with a small team (2 engineers, 1 designer, 1 GHG subject-matter expert part-time). **The SME is not optional** — every hour they spend reviewing activity keys and factor mappings saves ten hours of rework.

---

## 15. Open questions and risks

| # | Question / risk | Why it matters | Suggested resolution |
|---|---|---|---|
| 1 | Is INVTY's audience primarily Indian industry, or global? | Determines whether CEA/BRSR is core or peripheral, and data residency | Confirm before Phase 0; it changes factor priorities |
| 2 | Who owns annual factor updates? | Factors go stale in 12 months and stale factors destroy credibility | Name a person and a calendar date; budget 3–5 days/year |
| 3 | Will INVTY publish the tool's methodology document? | Professionals will ask. Refusing to publish reads as hiding something | Publish it. It is also excellent SEO and marketing |
| 4 | Competitive exposure | Persefoni, Watershed, Sweep, Normative and several Indian players occupy this space | You are not competing with them — you are running a lead magnet. Do not scope-creep toward feature parity |
| 5a | CEA database version and factor selection | The current release is User Guide **v21.0 (Dec 2025)**; the OM/BM/CM factors are CDM baselines, not corporate Scope 2 factors | Pin v21.0; use the weighted average emission rate; document the choice |
| 5 | Spend-based Scope 3 for Indian companies | EEIO factor sets for the Indian economy are thinner than for the US/EU | Investigate available Indian I-O derived factor sets early; may justify EXIOBASE or a commercial source sooner than planned |
| 6 | Report abuse | Someone generates a watermarked "INVTY report" with junk data and circulates it | Report ID + verification page on invty.com that resolves the ID; clear "self-declared, unverified" labelling |
| 7 | "Accurate" in marketing copy | Overclaiming is both a legal and reputational risk | Market it as "methodologically rigorous and fully traceable", not "accurate" |

---

## 16. What I would do first, if this were mine

1. **Build the factor registry and calculation engine before anything else**, with the golden-path test suite. Two weeks of unglamorous work that determines whether the product is credible.
2. **Ship Scope 1 + Scope 2 only**, publicly, with an excellent watermarked report and the dual location/market-based display. Learn from real visitors before building the 15 Scope 3 categories.
3. **Instrument the funnel from day one** so you can see exactly where visitors drop.
4. **Get a GHG practitioner to review the methodology** before launch.

The temptation will be to build all three scopes and four frameworks at once because the spec covers them. Resist it. The architecture above is designed so that shipping a narrow v1 costs you nothing later.

---

*Prepared with Claude. All emission factor values referenced in examples are illustrative; production values must be sourced from the current publications named in Section 7 and loaded through the ingestion pipeline.*
