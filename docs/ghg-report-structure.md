# The GHG inventory report: structure and where it lives in the code

The report follows the three layers a verifier looks for:

1. **Corporate boundary** — which entities, plants, offices, vehicles are included.
2. **Emission inventory** — which activities emit, and how many tonnes of CO₂e.
3. **Evidence and assurance** — can another competent person reproduce the
   figures from the original records?

A report with only layer 2 is not verification-ready, so the code carries layers
1 and 3 as first-class data rather than as prose.

## One rule that shapes everything

**Nothing is invented to fill a gap.** Where the organisation has not recorded
something, the report names what is missing, why it matters, and what to do —
and the readiness score in Part 30 drops. A plausible default in a GHG report is
worse than a blank: it cannot be traced to evidence, and an assurance provider
treats it as a misstatement.

This is why `EMPTY_REPORT_META` starts empty, and why "not available" is never
rendered as "not applicable".

## Report part → code

| Part | Report section | File |
|---|---|---|
| 1–2 | Cover page | `report/sections/FrontMatter.tsx` |
| 3 | Document control, revision history | `report/sections/FrontMatter.tsx` |
| 4 | Executive summary | `report/sections/FrontMatter.tsx` |
| 5–7 | Objective, reporting period, principles | `report/sections/Boundaries.tsx` |
| 8 | Organizational boundary, facility list | `report/sections/Boundaries.tsx` |
| 9 | Operational boundary, source register | `report/sections/Boundaries.tsx`, `report/build/registers.ts` |
| 10–13 | Scope 1: stationary, mobile, process, fugitive | `report/sections/Inventory.tsx`, `report/build/aggregate.ts` |
| 14 | Scope 2: location and market based | `report/sections/Inventory.tsx` |
| 15 | Scope 3: all fifteen categories assessed | `report/sections/Inventory.tsx`, `buildScopeThree` |
| 16 | Data collection and calculation architecture | `report/sections/Methodology.tsx` |
| 17 | Evidence register | `report/build/registers.ts` |
| 18 | Emission factor register and hierarchy | `report/build/registers.ts` |
| 19 | GWP basis | `report/model/reportMeta.ts`, `Methodology.tsx` |
| 20 | Calculation formulas | `report/sections/Methodology.tsx` |
| 21–23 | Monthly view, summary table | `report/sections/Analysis.tsx` |
| 22, 33 | Production-normalised intensity | `buildIntensity` in `report/build/aggregate.ts` |
| 24 | Trend analysis and commentary | `buildTrends` in `report/build/aggregate.ts` |
| 25 | Base year and recalculation policy | `report/sections/Credibility.tsx` |
| 26 | Exclusion register | `buildExclusions` in `report/build/quality.ts` |
| 27 | Data quality assessment | `buildDataQuality` |
| 28 | Uncertainty assessment | `buildUncertainty` |
| 29 | QA/QC checks | `runQaQc` |
| 30 | Internal verification and readiness | `assessReadiness`, `report/sections/Credibility.tsx` |
| 31 | GHG reduction measures | `report/sections/ActionAndAnnexures.tsx` |
| 32 | GHG targets, gap and required annual reduction | `buildReport.ts`, `ActionAndAnnexures.tsx` |
| 34 | GHG dashboard | `report/sections/FrontMatter.tsx` |
| 35 | Annexures A–O | `buildAnnexures` in `report/build/registers.ts` |
| 36–37 | Calculation workbook and architecture | XLSX export, `ghgService.exportXlsx` |
| 40 | Standards referenced | `buildReport.ts` |
| 41 | Inventory / inventory report / verification package | `assessReadiness` |

## Folder layout

```
frontend/src/report/
  model/
    types.ts         One type per report part, in report order
    reportMeta.ts    Facts the inventory does not hold (document control,
                     facilities, base year, production output, targets)
  build/
    aggregate.ts     Scope totals, category blocks, Scope 3 assessment,
                     intensity, trends
    registers.ts     Source, evidence and factor registers; annexure index
    quality.ts       Data quality, uncertainty, QA/QC, exclusions, readiness
    buildReport.ts   Assembles the whole report object
  sections/          One component per group of report parts
  ReportDocument.tsx Page order and print layout
  ReportSettings.tsx The form for the metadata a verifier needs
```

## The QA/QC checks (Part 29)

Run automatically over the recorded inventory every time the report is built:

| ID | Check |
|---|---|
| QC-01 | Every reported figure traces to a source document |
| QC-02 | Activity data present and positive |
| QC-03 | Units recorded on every record |
| QC-04 | Emission factors current for the reporting year (within three years) |
| QC-05 | Every factor cites its source |
| QC-06 | Manual factor overrides justified |
| QC-07 | No duplicated activity records |
| QC-08 | Engine warnings resolved |
| QC-09 | Fuel reconciliation: opening + purchases − closing ≈ consumption |
| QC-10 | Energy data reconciled with finance records |
| QC-11 | Reporting period defined |
| QC-12 | GWP basis stated |

QC-09 and QC-10 report **"cannot check"** rather than "pass": the portal does not
hold stock movements or invoice values, so the check is impossible with the data
held. Saying so is the honest outcome, and it tells the user what to collect.

## Readiness score (Parts 30, 41)

```
evidence coverage   40 points   share of sources with an attached document
QA/QC results       30 points   checks passed, out of those that can be checked
Scope 3 screening   20 points   categories with a documented decision, out of 15
report metadata     10 points   document control, period, GWP, base year, output
```

- **Below 50** — *Inventory*: it answers "how much did we emit?"
- **50–84** — *Inventory report*: it also answers "where from, and how calculated?"
- **85+ with no blockers** — *Verification ready*: an independent party can obtain
  sufficient evidence.

The report never claims to be a verified GHG statement. That requires a verifier's
opinion under ISO 14064-3.

## Checking the report without signing in

`frontend/dev-report-preview.html` renders the document with sample entries at
`http://localhost:5173/dev-report-preview.html` while the dev server runs. It is
not part of the production build (Vite builds `index.html` only) and the app does
not import it.

## What is not built yet

- **Part 21, monthly analysis.** Entries carry no month, so seasonality and data
  gaps cannot be shown. Needs a period field per record.
- **Part 13, refrigerant register.** Fugitive emissions are reported as entries;
  the charge / recharge / recovery register is not modelled yet.
- **Part 36, the workbook.** The XLSX export is a flat audit trail rather than the
  numbered sheets described in the report.
- **Facilities, targets, mitigations and prior years** are in the data model and
  render in the report, but only the core metadata has a form. The rest needs an
  editor before a user can enter them.
