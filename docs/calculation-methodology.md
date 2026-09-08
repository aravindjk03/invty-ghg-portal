# INVTY GHG Portal — Calculation Methodology & Coefficient Sourcing

**Companion files:** `coefficient_ingestion_worklist.csv` · `emission_source_catalogue.csv`

---

## 0. Straight answer to your question

**Have I given calorific values?** No. Not one.

**Have I given emission factor values?** No — the only numbers that appeared anywhere were labelled illustrative in a UI mock-up.

**Did I reference standards?** Yes — GHG Protocol, IPCC 2006 Guidelines, DESNZ, CEA, SEBI BRSR — and I had the catalogue independently fact-checked twice against those standards, which found and fixed ten scope-assignment errors.

**Was omitting the numbers a mistake?** No, it was deliberate, and it is the most important engineering decision in this project. Here is why, stated as a rule you should put in your codebase:

> **An emission factor, calorific value or density must never originate from a language model.** Not from me, not from Antigravity, not from any AI assistant. Every coefficient enters the system through the ingestion pipeline, from a named publication, with a table reference, a publication year and a URL stored alongside it.

I can recall approximate values for most fuels. If I wrote them into your seed file, they would look authoritative, they would be un-sourced, some would be a few percent wrong and a few would be badly wrong, and — this is the part that matters — **nobody would ever find out**, because a plausible-looking number in a report is invisible. That is precisely the failure mode your whole architecture is built to prevent. The moment a factor's provenance is "an AI said so", the traceability chain in Section 7 of the architecture spec is broken and your report is not defensible.

**So what you actually need, and what this document gives you:** the exact equations, and a worklist naming every single coefficient the engine requires with the precise publication and table to pull it from. That is the deliverable that gets you to correct numbers. A list of numbers from me would not.

---

## 1. The core identity, stated properly

The `activity × factor` shorthand I used earlier is the Tier 1 case. The full form the engine must implement is:

```
For each gas g and each activity record i:

    E(i,g) [kg]  =  A(i) × NCV(fuel) × EF(g, fuel, region, year)

    where  A(i)   = activity data in its native unit, normalised to a canonical unit
           NCV    = net calorific value  [TJ per unit]   (energy-basis factors only)
           EF     = emission factor      [kg gas per TJ]

Then:

    CO2e(i) [kg] = Σ over g of  E(i,g) × GWP100(g, assessment_report)

Where a factor is already published on a physical basis (kg CO2e per litre, per
kWh, per t·km) the NCV term is absent — the publisher has already embedded it.
The engine must know which basis each factor uses. Applying an NCV to a factor
that already includes one is a silent multiplication error of roughly 40×.
```

`ef_basis ∈ {energy, physical}` is therefore a mandatory column on every factor row. It was missing from the schema I gave you — add it.

---

## 2. Equation set by category

### 2.1 Stationary combustion — Tier 1 (default factors)

```
E(CO2)  = Fuel × NCV × EF_CO2
E(CH4)  = Fuel × NCV × EF_CH4
E(N2O)  = Fuel × NCV × EF_N2O
```
Source of EFs: IPCC 2006 Vol.2 Ch.2, Tables 2.2–2.5. Source of NCVs: IPCC 2006 Vol.2 Ch.1, Table 1.2.

### 2.2 Stationary combustion — Tier 2 (country- or fuel-specific carbon content)

**This is the tier you must use for Indian coal.** See Section 3.

```
EF_CO2 [kg CO2/TJ] = CC [kg C/GJ] × 1000 × (44.010 / 12.011)
                   = CC × 1000 × 3.664

E(CO2) [kg] = Fuel × NCV × EF_CO2 × OF
```
`OF` is the oxidation factor. IPCC 2006 assumes complete oxidation (OF = 1) and folds incomplete combustion into the CH₄ factor; the Revised 1996 Guidelines used **0.98 for coal, 0.99 for oil products and 0.995 for gas**. **Do not silently apply an OF below 1** — if you use an OF other than 1, it must be a stored, sourced parameter that prints in the methodology page.

### 2.3 Mobile combustion

Fuel-based — identical to 2.1, but CH₄ and N₂O factors differ substantially from stationary and depend on vehicle technology and emission-control tier:
```
E(g) = Fuel × NCV × EF_mobile(g, vehicle_class, fuel, control_tech)
```
Distance-based fallback:
```
E(g) = Distance [km] × EF(g) [g/km] / 1000
```
Source: IPCC 2006 Vol.2 Ch.3; DESNZ vehicle tables. Distance-based rows are flagged as lower data quality.

### 2.4 Process — mineral calcination

**Cement clinker** — IPCC 2006 Vol.3 Ch.2, Tier 2 (Eq 2.2, Eq 2.4, Eq 2.5):
```
EF_clinker [t CO2/t clinker] = CaO_carbonate_derived_fraction × (44/56.08)
                             = CaO_carbonate_derived × 0.785
   (IPCC default CaO 0.646 → EF_cl ≈ 0.51)

E(CO2) = M_clinker × EF_clinker × CF_ckd   +   non_carbonate_organic_carbon

   CF_ckd  = cement kiln dust correction, MULTIPLICATIVE, IPCC default 1.02
             (0.51 × 1.02 ≈ 0.52 t CO2/t clinker)
```
Three things teams get wrong:

1. **They multiply by cement output instead of clinker output.** Cement mass is *greater* than clinker mass (clinker-to-cement ratio roughly 0.65–0.95, around 0.72 in India), so this **overstates** emissions by the reciprocal of the clinker fraction — roughly +33% at a 0.75 ratio. IPCC Tier 1 multiplies cement production *by* the clinker fraction before applying EF_cl.
2. **They add the CKD correction instead of multiplying by it.** It is a factor, not a term.
3. **They conflate two corrections that have opposite signs.** CaO arriving from **non-carbonate** raw materials (fly ash, GGBS, steel slag) must be **subtracted** from the CaO fraction, because that CaO never calcined — this is material for Indian blended-cement plants. Non-carbonate **organic** carbon (kerogen in shale, raw-meal TOC) is a separate **addition**. Model them as two distinct fields.

**Lime** — IPCC Vol.3 Ch.2 Eq 2.6, applied **per lime type** (high-calcium, dolomitic, hydraulic):
```
E(CO2) = Σ_types  M_lime,i × EF_lime,i × CF_lkd,i × C_h,i

   EF_lime = CaO_frac × 0.785 + MgO_frac × (44/40.30)
           = CaO_frac × 0.785 + MgO_frac × 1.092
   CF_lkd  = lime kiln dust correction, IPCC default 1.02
   C_h     = hydrated-lime water-content correction
```
The LKD and hydration corrections are as mandatory as the cement CKD one.

Other carbonates use the same pattern: mass × purity × (molar mass CO₂ / molar mass of the carbonate) × calcination fraction.

### 2.5 Process — iron & steel

Use **one** method, never both (this was flagged in the catalogue review):
```
Carbon balance (IPCC Vol.3 Ch.4):
E(CO2) = [ Σ(carbon IN: coke, coal, BF gas, COG, limestone, electrodes)
         − Σ(carbon OUT: steel, slag, exported gases, dust) ] × 3.664
```
If the carbon-balance method is selected, the individual fuel rows for coke, blast furnace gas, coke oven gas and converter gas must be locked out of Scope 1.1 or you will double count.

### 2.6 Fugitive — refrigerants (simplified material balance)

```
E [kg CO2e] = [ (P_new − C_new) + P_service + (C_disposed − R_recovered) ] × GWP_refrigerant
```
- `P_new` refrigerant used to charge new equipment, `C_new` nameplate capacity installed
- `P_service` refrigerant added during servicing (the top-up figure most sites can answer)
- `C_disposed` **total nameplate capacity of equipment retired** (not the charge remaining in it — that belongs to the *screening* method and would double-discount leakage already captured by the purchase terms), `R_recovered` amount actually recovered

Blend GWPs (R-410A, R-404A, R-407C) are **not published by IPCC** — they must be derived as the mass-weighted average of component GWPs and stored with the composition source.

### 2.7 Scope 2 — dual reporting

```
Location-based = Σ_facilities ( kWh_consumed × EF_grid(region, year) )

Market-based   = Σ ( kWh_contracted × EF_contract )
               + Σ ( kWh_supplier   × EF_supplier_specific )
               + Σ ( kWh_residual   × EF_residual_mix(region, year) )

Grand total includes EXACTLY ONE of these. Never their sum.
```

### 2.8 Scope 3 Category 3 — T&D losses (the grossing-up formula)

This one is worth getting right because **India's T&D losses are high**, so an error here is material.

```
Let  C = electricity consumed at your meter [kWh]
     L = grid T&D loss rate as a FRACTION OF GENERATION

Generation required   G      = C / (1 − L)
Energy lost in T&D    Loss   = G − C = C × L / (1 − L)
Emissions from losses        = C × [ L / (1 − L) ] × EF_generation

WRONG (understates):  Loss = C × L
```
At L = 0.18, the correct multiplier is 0.2195, not 0.18 — the correct value is **22% larger** than the naive one, i.e. the naive form understates T&D emissions by 18%. If your factor source publishes a T&D factor **per kWh delivered** (DESNZ does), use it directly and skip this derivation.

### 2.9 Scope 3 — spend-based, with currency and inflation

```
E = Spend_local
    ×  FX(local → factor_currency, dated)                -- currency conversion
       (equivalently:  ÷ FX(factor_currency → local) )
    ×  (PriceIndex[factor_base_year] / PriceIndex[spend_year])  -- deflation
    ×  EF_EEIO [kg CO2e per unit factor_currency, base year]
```
All three conversions are stored in the audit trail. Omitting steps 2 and 3 is wrong by tens of percent and is the most common defect in Scope 3 tools.

### 2.10 Business travel — air

```
E = Σ ( GCD(origin, destination) × detour_uplift
        × EF(haul_band, cabin_class) × passengers )
    × RF_uplift (optional, must be disclosed)
```
Great-circle distance needs a detour uplift for real routing (DESNZ applies a defined correction). Cabin class matters — business class is roughly 2–3× economy per km. The radiative-forcing multiplier is user-selectable and must be stated in the report when applied.

### 2.11 GWP application

```
CO2e = E(CO2)
     + E(CH4_fossil)    × GWP(CH4_fossil)
     + E(CH4_biogenic)  × GWP(CH4_biogenic)     -- a DIFFERENT value
     + E(N2O)           × GWP(N2O)
     + Σ_i E(HFC_i)     × GWP(HFC_i)
     + E(SF6) × GWP(SF6) + E(NF3) × GWP(NF3) + Σ E(PFC) × GWP(PFC)
```
**One ingestion decision to make deliberately:** AR6 gives fossil CH₄ 29.8 and non-fossil CH₄ 27.0, but there is a documented argument that 27.0 embeds an unsupported assumption and that 27.9 is the better value for biogenic and fossil-*combustion* methane. Whichever you ingest, store the choice as an explicit cited field — reports will be compared against tools using the other.

The GWP set (AR6 / AR5 / AR4) is a versioned configuration object. Recalculating under a different set creates a **new** calculation run; it never overwrites the old one.

### 2.12 Biogenic and out-of-scope split

```
For a blended fuel with biogenic fraction b on an ENERGY or CARBON basis
  (never a mass basis — the fossil and biogenic components differ in NCV and
   carbon intensity, exactly the case for biodiesel blends and biomass co-firing):

  Scope 1 CO2      = E(CO2) × (1 − b)
  Biogenic memo    = E(CO2) × b            -- reported OUTSIDE the scopes
  Scope 1 CH4, N2O = full amount           -- biogenic CH4/N2O stay IN Scope 1

Montreal Protocol gases (R-22, CFCs, halons) → separate memo, never in Scope 1.
Removals and retired offsets → separate memo, never netted off gross emissions.
```

---

## 3. The Indian coal problem — and why a default factor is unusable

This is the single most important India-specific point in the whole methodology.

Indian non-coking coal is graded **G1 to G17 by gross calorific value** under the Ministry of Coal's grading system, spanning roughly 7,000 kcal/kg at G1 down to about 2,200 kcal/kg at G17. That is a **three-fold range within the single word "coal."**

A DESNZ or IPCC default "bituminous coal" factor is built around a much higher and much narrower calorific value than most Indian domestic coal. Applying it to G12 coal from a domestic mine produces an error that is large, systematic and completely invisible in the output.

**The engine must therefore not offer a flat "coal" factor for India.** The required flow:

```
1. User selects coal and declares one of:
     (a) a measured GCV from a lab report   [preferred — IS 1350 Part 2]
     (b) the coal grade G1–G17              [good — maps to a published GCV band]
     (c) "I don't know"                      [triggers a conservative default
                                              + a data-quality penalty + a warning]

2. GCV [kcal/kg] → energy:
     kcal → kJ  : × 4.1868
     E [GJ/t]   = GCV × 4.1868 / 1000

3. GCV → NCV:  use a measured NCV if available. Otherwise apply the published
   GCV→NCV relationship for the fuel class, stored as a sourced coefficient,
   NOT a hardcoded rule of thumb. Record which was used.

4. NCV × mass → TJ, then × EF_CO2 [kg CO2/TJ] from an India-specific carbon
   content where one is published, else the IPCC default for the coal class.

5. Print the GCV, its origin (measured / grade band / default), and the carbon
   content on the methodology page.
```

Peer-reviewed work exists on revised India-specific net calorific values and carbon emission factors by coal category — track it down during ingestion rather than defaulting to IPCC values for Indian coal. The [India GHG Program](https://indiaghgp.org/calculation-tools) also publishes India-adapted GHG Protocol calculation tools; use them as a cross-check on your engine, not as your factor source.

**Ask for the measurement basis too.** Indian coal GCV is quoted variously as-received, air-dried or dry-ash-free, and mixing bases is another silent 10–20% error. Critically, the **Ministry of Coal G1–G17 grade bands are on an *equilibrated* basis (60% RH, 40°C)** — which is neither as-received nor air-dried. A grade-derived GCV and a lab as-received GCV are therefore not interchangeable. Store the basis as a mandatory field and name equilibrated as the basis of the grade bands.

---

## 4. Constants that ARE safe to hardcode

These are definitional — molar masses and unit definitions, not empirical measurements. They do not change with a publication year and do not belong in the factor registry:

**Use IPCC's literal ratios, not the IUPAC molar masses.** IPCC equations prescribe `44/12`; the IUPAC value is 3.6641. The 0.07% gap is small, but if you mix the two you will get an unexplained systematic drift that breaks your "reproduce a published inventory within 2%" and ">1% factor regression" tests. Pick IPCC's, and state the choice in the methodology page.

| Constant | Value | Origin |
|---|---|---|
| CO₂ / C ratio | 44 / 12 = **3.6667** | IPCC convention (IUPAC molar ratio is 3.6641 — do not mix) |
| CO₂ / CaO | 44 / 56.08 = **0.785** | IPCC Vol.3 Ch.2 |
| CO₂ / MgO | 44 / 40.30 = **1.092** | IPCC Vol.3 Ch.2 |
| CO₂ / CaCO₃ | 44 / 100.09 = **0.440** | IPCC Vol.3 Ch.2 Table 2.1 |
| 1 kcal (IT) | **4.1868** kJ | International Steam Table calorie (1956); ISO 80000-5 |
| 1 kWh | **3.6** MJ exactly | SI definition |
| 1 MMBtu | **1.055056** GJ | Definition |
| 1 TJ | **10¹²** J | SI |

Everything else — every NCV, every density, every carbon content, every emission factor, every GWP — is empirical, versioned, and belongs in the registry with a source. **GWPs included:** they change between IPCC assessment reports, so AR6 values are ingested data, not constants.

---

## 5. Standards register

### International — the calculation basis
| Standard | Role in this product |
|---|---|
| **GHG Protocol Corporate Accounting and Reporting Standard** (Revised) | The inventory rules: boundaries, scopes, gases |
| **GHG Protocol Scope 2 Guidance** | Location- vs market-based dual reporting |
| **GHG Protocol Corporate Value Chain (Scope 3) Standard** | The 15 categories and their methods |
| **GHG Protocol Land Sector and Removals Guidance** | Land use and removals (your agriculture rows) |
| **IPCC 2006 Guidelines for National GHG Inventories** + **2019 Refinement** | Vol.2 energy (combustion), Vol.3 IPPU (process), Vol.4 AFOLU, Vol.5 waste. **The source of nearly every NCV, carbon content and default EF you will ingest.** |
| **IPCC AR6 WG1 Ch.7** | GWP values |
| **ISO 14064-1** | Verification-ready inventory structure |
| **ISO 14064-3** | The assurance standard your disclaimer cites |
| **ISO 14067 / PAS 2050** | Product carbon footprint (needed if you add CBAM or PCF) |
| **GLEC Framework** | Logistics emissions — Categories 4 and 9 |
| **PCAF Standard** | Category 15 financed emissions |

### India — the compliance and factor layer
| Source | Role |
|---|---|
| **SEBI BRSR / BRSR Core** | Principle 6 disclosure format; PPP-adjusted intensity; assurance scope |
| **CEA CO₂ Baseline Database for the Indian Power Sector** | Grid emission factors. Use the **weighted average emission rate**, not the OM/BM/combined-margin CDM figures. |
| **India GHG Program** (CII–WRI–TERI) | India-adapted GHG Protocol calculation tools — use as a cross-check |
| **Ministry of Coal — coal grading (G1–G17)** | GCV bands for Indian non-coking coal |
| **Coal Controller's Organisation** | Coking coal grading |
| **BEE — PAT scheme and normalisation methodologies** | Sector energy norms, designated consumer thresholds |
| **India Carbon Credit Trading Scheme (CCTS)** | India's compliance carbon market, administered by BEE, with notified greenhouse gas emission intensity targets for nine industrial sectors. **Directly relevant to your audience** — an obligated entity has a mandatory intensity target, which is a far sharper reason to use your tool than voluntary reporting. |
| **MoEFCC — Biennial Update Reports / National Communications** | India's national inventory methods and country-specific factors |
| **BIS test methods** — IS 1350 Part 1 (proximate analysis), Part 2 (calorific value); IS 1448 series (petroleum products) | **How the user's lab measured the GCV you are about to use.** Cite the test method in the report when a measured value is entered. |

### Other jurisdictions (for exporters)
UK **DESNZ** conversion factors · US **EPA** GHG Emission Factors Hub and **eGRID** · **IEA** national grid factors · **AIB** European residual mixes · **Green-e** US residual mix · **EU CBAM** implementing regulation for embedded emissions.

---

## 6. What "correct calculation" is actually tested by

Equations on paper prove nothing. These are the tests that prove the engine:

```
1.  STOICHIOMETRY      Pure carbon combusted → assert 3.6641 kg CO2 per kg C
2.  UNIT ROUND-TRIP    Every unit in the catalogue → canonical → back; assert equality
3.  DIMENSIONAL GUARD  Assert L → kWh RAISES without a density and an NCV
4.  BASIS GUARD        Assert an energy-basis factor is never applied to a
                       physical-basis activity, and vice versa
5.  CROSS-CHECK        Recalculate 5 published corporate inventories from their
                       disclosed activity data; assert agreement within 2%
6.  INDEPENDENT CHECK  A second person builds a spreadsheet for 5 cases with no
                       sight of the code; assert agreement
7.  DUAL REPORTING     Assert the grand total never contains both Scope 2 figures
8.  MEMO ISOLATION     Assert biogenic CO2, Montreal gases, removals and offsets
                       never enter any scope total
9.  T&D FORMULA        Assert C × L/(1−L), not C × L
10. GWP VERSIONING     Recalculate under AR5; assert a NEW run is created and the
                       AR6 run is unchanged
11. FACTOR REGRESSION  After every factor-set update, recalculate 30 golden
                       inventories; require a written explanation for any change > 1%
```

Tests 5 and 6 are the ones that catch methodology errors rather than coding errors. Budget for them before launch.

---

## 7. Get a practitioner to sign off

Everything above is a specification. Before this tool is public, a qualified GHG practitioner or an ISO 14064-3 verifier should review the methodology document and the ingested factor set. It is a small cost against publishing wrong numbers under the INVTY name to industry professionals who will check them.

I am also not a lawyer or a certified GHG verifier — treat this as engineering guidance to be validated, not as assurance.
