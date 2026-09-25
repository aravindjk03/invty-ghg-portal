# Where to get trusted, published emission factors

Every link was checked on 2026-09-25 and resolved. Each entry says what it
covers, what it costs, and whether it may be published in a customer-facing
report.

**The rule for this project:** a factor may only enter the library with its
value, unit, publication year, geography and a named source. Anything else stays
marked unverified — see `docs/ghg-report-structure.md`.

## Exact download links (each verified to download on 2026-09-25)

**DESNZ 2025 GHG conversion factors** — publication page:
<https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025>

| File | Direct link | Why |
|---|---|---|
| **Flat format** (easiest to import) | <https://assets.publishing.service.gov.uk/media/6846b6ea57f3515d9611f0dd/ghg-conversion-factors-2025-flat-format.xlsx> | One long table, built for loading into a database |
| **Full set** | <https://assets.publishing.service.gov.uk/media/6846a4f55e92539572806125/ghg-conversion-factors-2025-full-set.xlsx> | Every factor with the CO2 / CH4 / N2O breakdown |
| Condensed set | <https://assets.publishing.service.gov.uk/media/6846a4e6d25e6f6afd4c0180/ghg-conversion-factors-2025-condensed-set.xlsx> | The common subset |
| Methodology paper | <https://assets.publishing.service.gov.uk/media/6846b0870392ed9b784c0187/2025-GHG-CF-methodology-paper.pdf> | How each factor was derived — cite this |
| Major changes | <https://assets.publishing.service.gov.uk/media/6846b6d04d039a010411f0c9/2025-GHG-CF-major-changes-document.pdf> | What moved since last year |

**CEA CO2 Baseline Database (India)** — page:
<https://cea.nic.in/cdm-co2-baseline-database/?lang=en>

| File | Direct link |
|---|---|
| **Database v20.0 (FY 2023-24)** | <https://cea.nic.in/wp-content/uploads/2021/03/CO2_Database_Version_20.0_2023_24.xlsx> |
| User guide v20.0 | <https://cea.nic.in/wp-content/uploads/2021/03/User_Guide_Version_20.0.pdf> |

**IPCC AR6 global warming potentials** — Table 7.SM.7:

| File | Direct link |
|---|---|
| **Chapter 7 Supplementary Material** (the GWP tables) | <https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter07_SM.pdf> |
| Chapter 7 main text | <https://www.ipcc.ch/report/ar6/wg1/downloads/report/IPCC_AR6_WGI_Chapter07.pdf> |

## Round two — the gaps DESNZ and CEA do not cover

All verified to download on 2026-09-25.

**Capital goods and purchased goods, spend-based — EPA Supply Chain Factors v1.3**
Page: <https://catalog.data.gov/dataset/supply-chain-greenhouse-gas-emission-factors-v1-3-by-naics-6>

| File | Direct link |
|---|---|
| **By gas** (preferred — CO2, CH4, N2O separately) | <https://pasteur.epa.gov/uploads/10.23719/1531143/SupplyChainGHGEmissionFactors_v1.3.0_NAICS_byGHG_USD2022.csv> |
| CO2e composite | <https://pasteur.epa.gov/uploads/10.23719/1531143/SupplyChainGHGEmissionFactors_v1.3.0_NAICS_CO2e_USD2022.csv> |

kgCO2e per US dollar of spend, by NAICS industry code, in 2022 dollars. US
industry structure, so it is a screening proxy for Indian procurement — label it
as such. Public domain (US federal work).

**Agriculture — IPCC 2006 Guidelines Volume 4**
Index: <https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol4.html>

| Chapter | Direct link |
|---|---|
| Ch 10 — Livestock: enteric fermentation and manure | <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_10_Ch10_Livestock.pdf> |
| Ch 11 — N2O from managed soils, CO2 from lime and urea | <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_11_Ch11_N2O&CO2.pdf> |
| Ch 5 — Cropland, including rice | <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_05_Ch5_Cropland.pdf> |
| Ch 2 — Generic methods | <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_02_Ch2_Generic.pdf> |

**Waste and wastewater — IPCC 2006 Guidelines Volume 5**
Index: <https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol5.html>

| Chapter | Direct link |
|---|---|
| **Ch 6 — Wastewater treatment and discharge** | <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/5_Volume5/V5_6_Ch6_Wastewater.pdf> |
| Ch 3 — Solid waste disposal sites | <https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/5_Volume5/V5_3_Ch3_SWDS.pdf> |

These replace the per-cubic-metre wastewater values removed earlier: IPCC
quantifies from organic load (COD/BOD) and nitrogen, not volume.

**Indian transport — India GHG Program (WRI India, CII, TERI)**
Page: <https://indiaghgp.org/transport-emission-factors>

| Paper | Direct link |
|---|---|
| **Road transport technical paper** | <https://indiaghgp.org/sites/default/files/Road%20Transport%20Technical%20Paper.pdf> |
| Rail transport | <https://indiaghgp.org/sites/default/files/Rail%20Transport%20Emission.pdf> |
| Air transport | <https://indiaghgp.org/sites/default/files/AIR%20Transport%20Emission.pdf> |

**Alternative for spend-based, if you prefer a global model to a US one:**
EXIOBASE 3 on Zenodo — <https://zenodo.org/records/5589597>. Large download,
research licence; check the terms before republishing values commercially.

## Start here — these two cover most of your gaps

### 1. UK Government GHG conversion factors (DESNZ, formerly DEFRA)

<https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting>
(2025 edition: <https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025>)

- **Covers:** fuels, electricity, refrigerants, freight, passenger transport,
  business travel, hotel stays, **waste disposal**, water, and material use.
- **Format:** one Excel workbook, thousands of rows, with a methodology paper.
- **Cost:** free. **Licence:** Open Government Licence — you may republish with
  attribution. Ideal for a commercial tool.
- **Caveat:** UK-centric. Fuel and refrigerant factors travel well; grid
  electricity, waste treatment and transport do not — use Indian data where it
  exists.
- **Fills for you:** Waste (0/15), End-of-life (0/4), Business travel (7/15),
  Employee commuting (3/11), Upstream transport (4/11).

### 2. IPCC 2006 Guidelines + 2019 Refinement

<https://www.ipcc-nggip.iges.or.jp/public/2006gl/> ·
<https://www.ipcc-nggip.iges.or.jp/public/2019rf/index.html> ·
searchable database: <https://www.ipcc-nggip.iges.or.jp/EFDB/main.php>

- **Covers:** Volume 2 energy (combustion), Volume 3 industrial processes,
  **Volume 4 agriculture** (enteric fermentation, manure, fertiliser N₂O, rice,
  urea, liming), Volume 5 waste.
- **Cost:** free, and citable in any report. This is what national inventories
  are built on.
- **Caveat:** default values with wide uncertainty; the tiered methods expect
  activity data you may not collect yet.
- **Fills for you:** Agriculture (0/6), Land use (0/1), the process factors that
  depend on abatement, and the wastewater methods that replace the per-m³ values
  I removed.

## India-specific — use these in preference for Indian operations

| Source | Covers | Link |
|---|---|---|
| **CEA CO₂ Baseline Database** | Indian grid electricity emission rate, by year and region. The correct Scope 2 location-based factor for India. | <https://cea.nic.in/cdm-co2-baseline-database/?lang=en> |
| **India GHG Program** (WRI India, CII, TERI) | India-specific road transport, fuels and grid guidance written for corporate inventories. | <https://www.indiaghgp.org/> |
| **GHG Platform India** | Sector emission estimates and methodology notes, independent of government reporting cycles. | <https://www.ghgplatform-india.org/> |
| **MoEFCC** — National Communications and Biennial Update Reports | India's own inventory methods and national factors. | <https://moef.gov.in/en/> |
| **Bureau of Energy Efficiency** | Energy benchmarks, PAT scheme data, calorific values for Indian fuels. | <https://beeindia.gov.in/> |

**Use CEA's weighted average emission rate**, not the CDM operating-margin or
build-margin figures — those are for project additionality, not corporate
inventories. Your catalogue already carries that warning on the row.

## Global warming potentials — settle this first

<https://www.ipcc.ch/report/ar6/wg1/> — Chapter 7, Supplementary Material
Table 7.SM.7 lists GWP₁₀₀ for every gas, including refrigerant blends.

Your library currently **mixes two reports**: methane uses AR5 (28) while SF₆
(25,200) and N₂O (273) use AR6, and the refrigerants use AR5. Pick one basis,
take the values from this table, and record it in the report's Part 19. Until
then any GWP basis the report declares is partly untrue.

Note which basis your disclosure framework expects: CDP and SBTi currently
expect AR5 or later; ISO 14064-1 requires you to state what you used.

## United States

| Source | Covers | Link |
|---|---|---|
| **EPA GHG Emission Factors Hub** | One annual workbook: fuels, electricity, transport, waste, refrigerants. The US counterpart to DESNZ. | <https://www.epa.gov/climateleadership/ghg-emission-factors-hub> |
| **EPA Supply Chain Factors / USEEIO** | **Spend-based factors by industry** — the practical way to start Purchased goods and **Capital goods**. | <https://www.epa.gov/land-research/us-environmentally-extended-input-output-useeio-models> |
| **eGRID** | US grid factors by subregion. | <https://www.epa.gov/egrid> |
| **WARM** | Waste management: landfill, recycling, composting, combustion, by material. | <https://www.epa.gov/warm> |

## Spend-based and value-chain screening

- **EXIOBASE** — <https://www.exiobase.eu/> — global multi-region input-output
  database, free for research; check the licence before commercial republication.
- **GHG Protocol calculation tools** — <https://ghgprotocol.org/calculation-tools>
  — sector and Scope 3 category workbooks, free, with the methodology each
  category expects.
- **Agribalyse** (ADEME, France) — <https://agribalyse.ademe.fr/> — free
  agri-food product footprints, useful for food and packaging supply chains.

## Product-specific data

- **EPD International** — <https://www.environdec.com/home> — verified
  Environmental Product Declarations, free to read, publishable with attribution.
  The strongest evidence for a purchased material, because a third party has
  already verified it.
- **Supplier-specific factors** — always preferred over any database, provided
  the supplier states the method and boundary. Ask for the EPD or the
  calculation basis, not a number in an e-mail.

## Commercial — licence required

| Source | Note |
|---|---|
| **ecoinvent**, **Sphera/GaBi** | The deepest life-cycle databases, but a licence is needed and **you may not publish figures attributed to them without one**. This service already strips those citations from public output. |
| **IEA Emission Factors** | Grid factors for every country, annual. Paid. <https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024> |
| **Climatiq**, **Carbon Interface** and similar API vendors | Aggregated factors with an API. Convenient, but you are then republishing someone else's aggregation — read the terms. <https://www.climatiq.io/data> |

## What to ingest first, for the gaps in this library

| Gap today | Source to use |
|---|---|
| Waste — 0 of 15 | DESNZ waste disposal tables; EPA WARM for US operations |
| Agriculture — 0 of 6 | IPCC 2006 Vol. 4, with the 2019 Refinement |
| Capital goods — 0 of 5 | EPA Supply Chain Factors (spend-based), or supplier EPDs |
| End-of-life, downstream transport, use of sold products — 0 each | DESNZ transport and waste tables; product-specific EPDs |
| Business travel — 7 of 15 | DESNZ passenger transport; India GHG Program for domestic road |
| Employee commuting — 3 of 11 | DESNZ passenger transport; India GHG Program |
| Nitric and adipic acid N₂O | IPCC Vol. 3, with the plant's own abatement efficiency |
| Wastewater CH₄ and N₂O | IPCC Vol. 5 Ch. 6 — based on organic and nitrogen load, not volume |
| Refrigerant GWPs | IPCC AR6 WG1 Table 7.SM.7 |

## When you have the files

Send me the workbooks and I will build the importer: it reads the published
file, maps each row to a catalogue source, and records value, unit, year,
geography, source and licence. Anything that cannot be mapped stays unverified
rather than being guessed — the same rule the rest of this system follows.
