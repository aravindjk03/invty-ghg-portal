---
activation: Always On
---
# GHG domain rules

Full detail: @docs/source-catalogue-and-routing.md and @docs/calculation-methodology.md

## Scope routing — ownership and location decide, not the fuel

The same litre of diesel lands in four different places:
- your DG set -> Scope 1.1 stationary
- your truck -> Scope 1.2 mobile
- a hired transporter's truck -> Scope 3.4
- an employee's own car, reimbursed -> Scope 3.6
- an employee commuting -> Scope 3.7

Aviation fuel in a company-owned aircraft -> Scope 1.2. A commercial flight
ticket -> Scope 3.6. Air freight -> Scope 3.4 inbound, 3.9 outbound.

Coal in your boiler -> 1.1. Coal as a blast-furnace reductant -> 1.3 process.
Grid electricity that happens to be coal-fired -> Scope 2.

## Seven traps the engine must enforce, not the user

1. "Captive" does not decide the scope; the consolidation boundary does. Asset
   inside the boundary -> its FUEL is Scope 1 and its electricity is not Scope 2.
   Indian group-captive SPV outside the boundary -> that electricity IS Scope 2.
2. Owned EVs charged on site are SCOPE 2, not Scope 1. No tailpipe combustion.
3. Self-generated renewable consumed on site, and power exported to the grid,
   are NOT Scope 2 at all. Memo items only, for the energy balance.
4. Biogenic CO2 is a memo item in EVERY scope it arises in. Its CH4 and N2O
   stay in Scope 1.
5. Montreal Protocol gases (R-22, CFCs, halons) are memo items, never Scope 1.
   Only HFCs, PFCs, SF6 and NF3 enter Scope 1.4.
6. Scope 2 location-based and market-based are two views of the same
   electricity. Never summed.
7. Integrated steel picks ONE method: carbon mass balance OR the individual
   fuel rows for coke / BF gas / COG / converter gas. Never both. Enforce with
   a facility-level method flag.
8. Category 8 and 13 leased assets apply only OUTSIDE the consolidation
   boundary. Check the boundary declaration before allowing an entry.

## India specifics

- Indian non-coking coal is graded G1-G17 by calorific value, roughly 7000 down
  to 2200 kcal/kg. A flat "coal" factor is UNUSABLE for India. Require a
  measured GCV or a grade, then run IPCC Tier 2 from carbon content.
- Grade bands are on an EQUILIBRATED basis (60% RH, 40C) — not interchangeable
  with a lab as-received value. Store the basis as a mandatory field.
- Grid factors come from the CEA CO2 Baseline Database. Use the WEIGHTED AVERAGE
  emission rate, not the OM/BM/combined-margin figures (those are CDM baselines).
- No residual mix is published for India. Substitute the grid average and
  footnote it explicitly in the report.
- Indian T&D losses are high. Apply losses as C x L/(1-L), NOT C x L.
- BRSR Core requires a PPP-adjusted turnover intensity as well as the
  unadjusted one. A dated PPP series is required reference data.

## Constants

Use IPCC's literal ratios, never IUPAC molar masses, and never mix the two:
CO2/C = 44/12 = 3.6667 · CO2/CaO = 0.785 · CO2/MgO = 1.092 · CO2/CaCO3 = 0.440
1 kcal(IT) = 4.1868 kJ · 1 kWh = 3.6 MJ · 1 MMBtu = 1.055056 GJ

GWP values are NOT constants. They are versioned, ingested data. Fossil CH4 and
non-fossil CH4 have different values under AR6.
