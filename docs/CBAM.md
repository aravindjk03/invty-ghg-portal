# CBAM calculator

A tool in the portal (hub card **CBAM Calculator**, or the **CBAM** icon in the
top bar) for the EU Carbon Border Adjustment Mechanism, definitive period
(from 1 January 2026). It has its own report, separate from the GHG
inventory report.

- **I export to the EU** (installation operator): embedded emissions of each
  good, per production process, with precursors and the free allocation
  figures an EU buyer needs.
- **I import into the EU** (authorised declarant): certificates to surrender
  and their cost, from default values or the operator's verified data.

Covered goods: cement, iron and steel, aluminium, fertilisers, hydrogen and
electricity: 689 CN codes, with precursors.

## Where every value comes from

Nothing is typed from memory. `scripts/ingest_cbam.py` reads the Commission's
files in `data/cbam/sources/` (listed with checksums in its README) and writes
`data/cbam/*.csv`, `data/cbam/parameters.json` and the browser bundle
`frontend/src/cbam/data/cbamData.json`. Each parameter carries the exact
sentence of the guidance it rests on, and the script stops if that sentence is
not in the guidance text.

| What | Value | Source |
|---|---|---|
| Default values, per country | Annex I | Implementing Regulation (EU) 2025/2621 as corrected by (EU) 2026/1740 (Commission file v2, 6 Aug 2026) |
| Default values, precursor of unknown origin | Annex IV (highest value) | same |
| Good not listed for a country, or "-" | 'Other countries and territories' | Guidance No. 3, PDF p. 114 |
| Mark-up on default values | 10% 2026, 20% 2027, 30% from 2028; fertilisers 1% | Guidance No. 3, PDF p. 115 |
| CBAM benchmarks | Column A (process), Column B (whole chain) | Implementing Regulation (EU) 2025/2620 |
| CBAM factor | 97.5% 2026 … 0% 2034 | Guidance No. 4, Table 2-1 |
| Cross-sectoral correction factor | 1.0, **preliminary** | Guidance No. 4, Table 2-1. The final value is in Implementing Decision (EU) 2026/1862; EUR-Lex refuses automated access, so check it and enter it in the calculator if it differs |
| Indirect emissions counted | cement and fertilisers only | Guidance No. 3, PDF p. 19 |
| De minimis | 50 t net mass a year, not electricity or hydrogen | Guidance No. 1, PDF p. 23 |
| Certificate price | Q1 2026 €75.36, Q2 €75.28, Q3 €82.32 (Q4 due January 2027) | Commission, *Price of CBAM certificates*, read 21 Nov 2026 |

**Not loaded:** Annex II (grid emission factors) and Annex III (electricity as
a good) of Regulation 2025/2621. They are not in the Commission's spreadsheet,
EUR-Lex refuses automated access, and the data is IEA-licensed for
non-commercial use only. The user enters the electricity factor with its
source, and electricity imported as a good needs actual data.

## Method

**Operator** (Guidance No. 3, section 4.2.2; Annex III to the Methodology Act,
Implementing Regulation (EU) 2025/2547):

```
AttrEm_dir   = DirEm* + Em_H,imp − Em_H,exp + WG_corr,imp − WG_corr,exp − Em_el,prod   (0 if negative)
               Em_H = Q (TJ) × EF_heat;  WG_corr,imp = TJ × EF_NG;  WG_corr,exp = TJ × EF_NG × 0.667
AttrEm_indir = electricity consumed (MWh) × EF (t/MWh)
EE           = AttrEm + Σ M_i × SEE_i          (direct and indirect separately)
SEE          = EE / AL                          (per functional unit; × functional units per tonne of each product)
```

Functional units let one process make several goods, as in the Commission's
cement example (Guidance No. 3, 4.3.3). The test suite reproduces it exactly:
0.820, 0.845 and 0.837 t CO₂/t cement.

Precursors can be made in the installation (taken from that process's result),
come from a supplier with verified data, use default values (country known:
Annex I; unknown: Annex IV), or come from the EU (no emissions added, free
allocation zero).

Free allocation (Guidance No. 4, equations 2–6):

```
SFA  = CBAM factor × CSCF × BM (Column A, by route/year)
SEFA = SFA + Σ (M_i / AL) × SEFA_i       precursor on defaults: CBAM factor × CSCF × BM (Column B)
```

Where a benchmark depends on the production route the calculator asks for it
instead of guessing. Year-dependent benchmarks (1)/(2) are picked from the
year.

**Declarant** (Guidance No. 1, Articles 7, 9 and 31 of the CBAM Regulation):

```
Certificates = max[0; SEE − SEFA − SECPP / RP_CBAM] × M
Cost         = certificates × price for the quarter of import (2026)
```

With default values, SEE is the Annex I total plus the mark-up, and SEFA uses
Column B with the route from the same Annex I row. RP_CBAM is the yearly
average of the certificate prices. Until all four 2026 quarters are published,
the calculator uses the average of those published and labels it provisional.
It can be overridden.

## Units

SEE is expressed per tonne of good, the unit of the CBAM declaration. For
cement and fertilisers, set "functional units per tonne" to the clinker or
nitrogen content to apply the sector's functional unit.

## The report and files

- **PDF:** *CBAM Embedded Emissions Report* (operator) or *CBAM Certificate
  Estimate* (declarant). It contains:
  - cover page
  - summary per good
  - calculation by process
  - precursors
  - default values used and their tables
  - method
  - parameters with citations
  - data-quality checks
  - operator's declaration with signature block
- **Excel:** sheets in the order of the Commission's operator emissions report:
  installation, processes, emission sources, electricity and heat,
  precursors, summary per good, default values, data quality. It is not the
  official template file.
- **XML / JSON:** IINVTY's own format, namespace `urn:iinvty:cbam:export:1`.
  Elements: `Header` (with source acts and checksums), `Installation`,
  `Processes/Process` (`AttributedEmissions`, `SourceStreams`, `Precursors`,
  `Goods/Good`), `DefaultValuesUsed`; for declarants `Lines/Line` and
  `Totals`. It is **not** the CBAM Registry declaration schema and must not be
  uploaded there.

Every figure in the PDF, Excel and XML is read from the same calculation result
the page shows. `src/cbam/export/exports.test.ts` checks this.

## Updating when the Commission publishes new values

1. Download the new files from taxation-customs.ec.europa.eu into
   `data/cbam/sources/` and update its README (date, SHA-256).
2. Run `python scripts/ingest_cbam.py`.
3. Run `pytest tests/test_cbam_ingest.py` and
   `cd frontend && npx vitest run src/cbam`.

The default values act is due to be revised by 2027 at the latest.
