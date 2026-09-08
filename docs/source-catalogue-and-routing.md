# INVTY GHG Portal — Emission Source Catalogue & Scope Routing Rules

**Companion files:** `emission_source_catalogue.csv` · `emission_source_catalogue.json`
**230 sources**, each mapped to a scope, a GHG Protocol category, default and allowed units, the gases it emits, and its factor source. These files are seed data — load them into the `emission_factor` / activity-catalogue tables directly.

---

## 1. THE ROUTING RULE — read this before the catalogue

You asked "coal → which scope, air travel → which scope." The honest answer is that **the fuel does not determine the scope. Ownership and location do.** The same litre of diesel lands in three different places depending on who owns the thing burning it.

```
                    ┌─────────────────────────────────────────┐
                    │  Is a fuel being BURNED?                │
                    └───────────────┬─────────────────────────┘
                          YES       │        NO
              ┌─────────────────────┘         └──────────────┐
              ▼                                              ▼
  ┌───────────────────────────┐              ┌───────────────────────────────┐
  │ Do WE own or control the  │              │ Are we BUYING energy already  │
  │ equipment burning it?     │              │ converted (elec/steam/heat)?  │
  └────────┬──────────┬───────┘              └────────┬──────────────┬───────┘
       YES │          │ NO                        YES │              │ NO
           ▼          ▼                              ▼              ▼
     ╔══════════╗  ╔═════════╗              ╔═════════════╗  ╔═════════════╗
     ║ SCOPE 1  ║  ║ SCOPE 3 ║              ║  SCOPE 2    ║  ║  SCOPE 3    ║
     ║ 1.1 fixed║  ║ 4/6/9   ║              ║ 2.1 elec    ║  ║ 1,2,5,7,11, │
     ║ 1.2 mobile│ ║ by whose║              ║ 2.2 steam,  ║  ║ 12 …        ║
     ╚══════════╝  ║ activity║              ║ heat, cool  ║  ╚═════════════╝
                   ╚═════════╝              ╚═════════════╝
```

### The same fuel, four different scopes

| Situation | Scope | Why |
|---|---|---|
| Diesel in **your** DG set | **1.1** stationary | You own the equipment, it's fixed |
| Diesel in **your** delivery truck | **1.2** mobile | You own the equipment, it moves |
| Diesel in a **hired** transporter's truck carrying your goods inbound | **3.4** | Someone else's asset, your activity |
| Diesel in an **employee's own car**, mileage reimbursed | **3.6** | Not your vehicle |
| Diesel in an employee's car **commuting to work** | **3.7** | Not your vehicle, not business travel |

### Aviation fuel — your specific example

| Situation | Scope | Category |
|---|---|---|
| ATF in a **company-owned or leased aircraft** | **1** | 1.2 Mobile combustion |
| An employee's **commercial flight ticket** | **3** | 3.6 Business travel |
| **Air freight** of your raw materials inbound | **3** | 3.4 Upstream transport |
| **Air freight** of your finished goods to customers | **3** | 3.9 Downstream transport |
| You **are** the airline, selling the flight | **1** | 1.2 (your fleet) |

### Coal — your other example

| Situation | Scope | Category |
|---|---|---|
| Coal burned in **your** boiler or kiln for heat | **1** | 1.1 Stationary combustion |
| Coal burned in **your captive power plant** | **1** | 1.1 — *not* Scope 2. You own the generation. |
| Coking coal used as a **chemical reductant** in a blast furnace, not as fuel | **1** | 1.3 Process emissions |
| **Grid electricity** that happens to be coal-generated | **2** | 2.1 — you bought electricity, not coal |
| Coal you **purchase and resell** without burning | **3** | 3.11 Use of sold products |
| Upstream mining and transport of the coal you burn | **3** | 3.3 FERA (auto-derived) |

---

## 2. Six routing traps that will corrupt the total

These are the errors that make a number indefensible. Each must be enforced in the engine, not left to the user.

**1 — "Captive" does not decide the scope. The consolidation boundary does.**
If the generating asset is **inside** your boundary, the *fuel* is Scope 1.1 and the electricity it produces is not Scope 2 at all — counting both is double counting. But under an **Indian group-captive SPV** (26% consumer equity in a separate legal entity outside your boundary), you are *purchasing* that electricity: it is **Scope 2**, and its fuel is not your Scope 1. The engine must ask whether the generating entity is inside the consolidation boundary and route on that answer, never on the word "captive".

Related: **self-generated renewable power consumed on site, and power exported to the grid, are not Scope 2 at all.** The Scope 2 Guidance is explicit that energy produced and consumed by the same entity generates no Scope 2, and that generation sold back to the grid is excluded. Both are memo items in this catalogue, recorded only to keep the energy balance honest.

**2 — Owned EVs charged on site are Scope 2, not Scope 1.**
An electric vehicle has no tailpipe combustion. Its energy is purchased electricity. Teams reflexively file all owned vehicles under Scope 1 and get this wrong.

**3 — Biogenic CO₂ never enters the scopes — in *any* scope.**
Biomass, bagasse, rice husk, biogas, biodiesel, ethanol: the CO₂ is a memo item reported separately. But the **CH₄ and N₂O from burning them do stay in Scope 1**. Getting only half of this right is worse than getting none of it right.

The catalogue carries **two** biogenic memos, because GHG Protocol requires biogenic CO₂ to be reported separately *for each scope in which it arises*: `memo.biogenic_co2` for Scope 1 combustion, and `memo.biogenic_co2_scope3` for biofuel in Category 4, composting/AD/incineration of biogenic waste in Category 5, and biofuel sold in Category 11.

**4 — Montreal Protocol gases never enter the scopes.**
R-22, CFCs, halons are disclosed separately, exactly like biogenic CO₂. Only the HFCs, PFCs, SF₆ and NF₃ go into Scope 1.4.

**5 — Scope 2 dual reporting must never be summed.**
Location-based and market-based are two views of the *same* electricity. The headline total uses one of them (default: location-based), and the report shows both. Adding them doubles your electricity footprint — this is the single most common bug in home-built tools.

**6 — Integrated steel must pick one method, not both.**
IPCC accounts for integrated steel by a **single carbon mass balance** covering coke, blast furnace gas and coke oven gas together. The catalogue exposes both routes — `process.iron_steel_bf` (carbon balance) and the individual fuel rows `fuel.coke.metallurgical`, `fuel.blast_furnace_gas`, `fuel.coke_oven_gas`, `fuel.converter_gas`. These are **mutually exclusive**. Enforce it with a method flag on the facility, not a note in the UI.

**7 — Leased assets are the double-count landmine.**
Under operational control, an asset you operate is *already inside* Scope 1 and 2. Category 8 exists only for leased assets **outside** your consolidation boundary. The engine must check the boundary declaration before allowing a Category 8 entry, and warn on overlap.

---

## 3. Catalogue coverage

| Scope | Category | Sources | Notes |
|---|---|---|---|
| 1 | 1.1 Stationary combustion | 52 | Solid, liquid, gaseous, biomass, waste-derived, process gases, flaring |
| 1 | 1.2 Mobile combustion | 23 | Road, air, sea, rail, off-road plant; fuel- and distance-based |
| 1 | 1.3 Process emissions | 31 | Cement, lime, steel/DRI, ammonia, nitric/adipic acid, aluminium, glass, ferroalloys, HFC-23 by-product, TiO₂, phosphoric acid, lead, zinc, SiC, CO₂ capture deduction, direct-entry escape hatch |
| 1 | 1.4 Fugitive | 33 | 16 refrigerants, SF₆, NF₃, PFCs, foams, aerosols, fire suppressants, venting, CH₄ and N₂O sources |
| 1 | 1.5 Agriculture & land | 7 | Enteric fermentation, manure, fertiliser N₂O, urea, ag lime, rice, land use change |
| 2 | 2.1 Electricity | 10 | Location, market residual, PPA, green tariff, I-REC, open access, supplier-specific, sub-metered, EV charging |
| 2 | 2.2 Steam/heat/cooling | 4 | |
| 3 | 3.1–3.15 | 96 | All fifteen categories; Cat 3 fully auto-derived, with all four sub-activities |
| — | Memo | 10 | Biogenic CO₂ (Scope 1 and Scope 3), Montreal gases, self-generation, export, avoided emissions, removals, retired offsets |
| | **Total** | **266** | |

### India-specific items included
Indian domestic coal by GCV band · PNG and CNG · bagasse, rice husk, groundnut shell, mustard husk · DRI / sponge iron process route · auto rickshaw and two-wheeler commuting · open access electricity · **group-captive SPV boundary handling** · CEA grid factors · high Indian T&D losses in Category 3 · E20 ethanol blending · rice cultivation methane · agricultural lime and urea application.

### Gas assignment is source-specific, not generic
Process rows carry only the gases that process actually emits — mineral calcination is **CO₂ only**, nitric and adipic acid are **N₂O only**, aluminium anode effects are **PFC only**. Attaching a blanket `CO2,CH4,N2O` to process rows double-counts combustion gases already captured in 1.1. Hydrogen combustion produces water, not CO₂; its CO₂ belongs to SMR production in 1.3 or to Category 3.3 if the hydrogen is purchased.

---

## 4. Unit traps built into the catalogue

Every row carries `default_unit` and `allowed_units`. These are the conversions that silently produce wrong-by-1000 errors:

| Trap | What goes wrong |
|---|---|
| **L vs kL** | Diesel entered as 45 kL when the field expects L → 1000× under-count |
| **kg vs t** | Coal in kg against a per-tonne factor → 1000× over-count |
| **kWh vs MWh** | The most common electricity error |
| **LPG mass vs volume** | Sold by the kilogram in India, by the litre in the UK. Density conversion required. |
| **Gas m³ vs scm vs Nm³** | Standard and normal cubic metres differ by reference temperature — roughly 5% |
| **Net vs gross calorific value** | About a 10% difference for natural gas. Ask which basis the user's meter reports. |
| **"units" of electricity** | Indian users say "units" meaning kWh. Accept it as a synonym. |

Fuel volume→mass→energy conversions need a **fuel-specific, dated density and calorific value**. Store those as versioned reference data with sources — they are physics coefficients, not unit maths.

---

## 5. How to use the seed files

```sql
-- Load the catalogue as the activity keys the UI offers
COPY activity_catalogue(activity_key, display_name, group_name, scope,
       ghg_category, category_name, default_unit, allowed_units,
       gases, factor_source, notes)
FROM 'emission_source_catalogue.csv' CSV HEADER;
```

The `activity_key` column is the contract between UI and factor registry. The UI never references a factor by ID or value — only by `(activity_key, region, reporting_year)`. The registry resolves it, and a miss raises an error rather than returning zero.

Rows with `default_unit = "auto"` (all of Category 3) take no user input at all — they are computed from the Scope 1 and Scope 2 entries the user has already made.
