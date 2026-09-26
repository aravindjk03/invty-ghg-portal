# The IPCC methods: sources that are not a factor per unit

Almost everything in this library is a factor per unit of activity — a litre of
diesel, a kilowatt hour, a tonne-kilometre. Six sources are not, and each one is
a source that gets reported wrongly, or not at all, when it is forced into a
factor:

| Source | Why a factor per unit is wrong | Implemented in |
|---|---|---|
| N₂O from managed soils | Depends on how much **nitrogen** reached the soil and what happened to the part that volatilised or leached, not on the mass of product bought | `ghg_core/methods/managed_soils.py` |
| CO₂ from liming and urea | Limestone and dolomite carry different carbon; urea is a CO₂ source **and** a nitrogen input | `ghg_core/methods/lime_urea.py` |
| CH₄ from enteric fermentation | The factor per head differs by region because animal size and milk yield differ | `ghg_core/methods/enteric.py` |
| CH₄ and N₂O from manure management | Methane depends on the **average annual temperature** where the manure sits; nitrous oxide on how it is stored | `ghg_core/methods/manure.py` |
| CH₄ and N₂O from wastewater | A per-m³ factor assumes a strength of effluent nobody measured | `ghg_core/methods/wastewater.py` |
| CH₄ from solid waste disposal | Waste buried this year emits nothing this year; waste buried a decade ago is still decaying | `ghg_core/methods/solid_waste.py` |

Every method returns a **mass of gas** — CH₄, N₂O or CO₂ — never CO₂e. The GWP
set the customer reports on is applied afterwards, which is what lets one
calculation be stated under AR5 or AR6 without being run again.

## Where the parameters come from

Each method reads its defaults from a JSON file under `data/ipcc/`. Every file
names the source, the URL, the date it was read and the printed page each table
came from. Nothing was parsed out of a PDF by regex: the tables were read from
the rendered pages and transcribed, and the transcription scripts refuse to
write when a row fails a structural check (wrong length, a factor that falls as
the temperature rises, a total loss smaller than the ammonia part of it, or a
value that does not appear on the published page).

| File | Source | Tables |
|---|---|---|
| `managed_soils.json` | V4 Ch 11 | 11.1, 11.3 |
| `lime_and_urea.json` | V4 Ch 11 | Equations 11.12, 11.13 |
| `enteric_fermentation.json` | V4 Ch 10 | 10.10, 10.11 |
| `manure_management.json` | V4 Ch 10 | 10.14–10.16, 10.19, 10.21–10.23 |
| `wastewater.json` | V5 Ch 6 | 6.2, 6.3 and §6.3.1.2 |
| `solid_waste.json` | V5 Ch 3 and V5 Ch 2 | 3.1–3.3, 2.3–2.6 |

## The equations, as implemented

**Managed soils** — 11.1 direct, 11.9 volatilisation, 11.10 leaching. Leaching
defaults to **zero**, not 0.3: IPCC's default for regions where leaching does
not occur is zero, and the caller has to say which they are.

**Lime and urea** — 11.12 and 11.13, both multiplied by 44/12 so the answer is
CO₂ rather than carbon. The same urea has to go through managed soils as
nitrogen as well; the service says so on every urea answer.

**Enteric fermentation** — Equation 10.19 with the Table 10.11 cattle factors by
region and Table 10.10 for other species. **Poultry raises** rather than
returning zero: IPCC publishes no Tier 1 factor, and a zero would silently drop
a poultry unit out of an inventory.

**Manure management** — Equation 10.22 for methane, from Tables 10.14 to 10.16
by region and average annual temperature; Equations 10.25 to 10.30 for nitrous
oxide. Three things it refuses to do:

- **Pasture, range and paddock** is refused and pointed at managed soils.
  Counting grazing here as well would double it.
- **Dung burned as fuel** is refused and pointed at Fuel Combustion.
- **Leaching** reports zero unless the caller has a country-specific fraction.
  IPCC publishes no default, and §10.5.1 says Equation 10.28 should only be used
  where one exists.

It also returns the **nitrogen left for application to land** (Equation 10.34,
using Table 10.23's total loss, not Table 10.22's ammonia alone), because that
figure is the input to the managed-soils calculation.

Table 10.19 has **no Indian Subcontinent column** even though Table 10.14 does.
Asking for one raises and names Asia as the nearest published region; a report
has to say which was used.

**Wastewater** — 6.3 for the organic load from population, 6.2 for methane, 6.8
for the nitrogen discharged and 6.7 for nitrous oxide. Pathway shares must add
to one; organics removed as sludge are subtracted before treatment; recovery
cannot turn a source into a sink.

**Solid waste** — the First Order Decay model, Equations 3.1 to 3.6. Decay
begins on 1 January of the year **after** deposition, so a single year of
tonnage produces nothing: the model needs the site's disposal history. Recovered
gas is subtracted **before** the cover oxidation is applied. No CO₂ is returned —
IPCC reports none from a disposal site, because the carbon that degrades is
biogenic and the fossil carbon does not degrade.

The Annex 3A.1 adjustment for a reaction start earlier than 1 January is **not**
implemented; the equations are used as printed.

## Biogenic methane

Methane from a cow, a landfill or a treatment pond is not fossil methane. AR5
gives it 28 rather than 30 and AR6 gives it 27.0 rather than 29.8, because
fossil methane oxidises to fossil CO₂ and that is counted in its warming. The
four biological methods apply the non-fossil GWP and say so on the answer; using
the fossil figure would overstate a herd by about seven percent.

## Reaching them

```
GET  /v1/methods                 what each method is, what it needs, its source
POST /v1/methods/calculate       run one, under the chosen GWP set
```

The response carries the gas masses, the CO₂e under that set, the working
(every intermediate the equations produce) and any notes the method needs the
reader to see — an unreported source, a substituted region, a figure that could
not be calculated and why.

## What is still Tier 1

All of it. Tier 2 and Tier 3 need country-specific or site-measured parameters:
feed intake and digestibility for livestock, volatile solids for manure, a
measured DOC for waste. Where a site has such a figure, every method takes it as
an override — `k`, `doc`, `nitrogen_excreted_kg_per_head`,
`volatilisation_percent` and the rest — and reports which was used.
