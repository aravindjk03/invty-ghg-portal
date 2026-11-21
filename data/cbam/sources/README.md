# CBAM sources

Every value in the CBAM calculator comes from these official European
Commission files. `scripts/ingest_cbam.py` reads them and writes `data/cbam/*`
and `frontend/src/cbam/data/cbamData.json`. Fetched on 21 November 2026.

| File in this folder | What it is | Where it came from | SHA-256 |
|---|---|---|---|
| `default_values_IR_2026-1740.xlsx` | Default values: Annex I (per country) and Annex IV (highest values, for precursors of unknown origin) of Implementing Regulation (EU) 2025/2621 as corrected by (EU) 2026/1740. The Commission's file, version 2, 6 Aug 2026 | taxation-customs.ec.europa.eu, "CBAM legislation and guidance", *Default values definitive period (Excel format)* | `900583811c7e1194799eb9bdbad2d6d7e1100f5a7d80a664c1584a8fce6f9f35` |
| `benchmarks_IR_2025-2620.xlsx` | CBAM benchmarks (Columns A and B) of Implementing Regulation (EU) 2025/2620 | same page, *Benchmarks definitive period (Excel format)* | `b79108b025e697822f0f59de477fa68066c1c05c228fae2270cd230af84e8a7b` |
| `price_of_cbam_certificates_2026-11-21.html` | The Commission's published quarterly 2026 certificate prices | taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en | `a417b20ea3e9cd7d02e486d669a46932e9592b872af864b300d0565b9c75e4e5` |
| `guidance1_extract.txt` | Text of *Guidance No. 1 – Introduction to CBAM concepts* (de minimis, certificate formula) | same legislation page (PDF, SHA-256 `9d9e4590fa80cced70023d99b89d74294276b402fe84c8b25c0d412779eac0e7`) | – |
| `guidance3_extract.txt` | Text of *Guidance No. 3 – CBAM methods for the calculation of emissions embedded in goods* (method, mark-ups, indirect emissions, default value rules) | same page (PDF SHA-256 `162ed275717671f05b88355a9b161726e7a1396f6ce1fc8f72a2f287d204a0d6`) | – |
| `guidance4_extract.txt` | Text of *Guidance No. 4 – free allocation adjustment* (CBAM factor, CSCF, SEFA equations) | same page (PDF SHA-256 `6854641617e77c18f7c752283e56871b180cb8790806cfde9cbd6ef6f62f8698`) | – |

The guidance PDFs are not committed (they are large and public); their text is
kept so the script can check every parameter's quoted wording.

## Not included, and why

- **Annex II (grid emission factors) and Annex III (electricity as a good)** of
  Regulation 2025/2621 are not in the Commission's spreadsheet, and EUR-Lex
  refuses automated access. Their data is also IEA-licensed for non-commercial
  use only. The calculator asks for the electricity emission factor and its
  source instead.
- **Final cross-sectoral correction factor (CSCF) 2026–2030** is in
  Implementing Decision (EU) 2026/1862 on EUR-Lex. The calculator uses the
  value 1.0 that Guidance No. 4 lists as preliminary, labels it so, and lets the
  user change it.
- **Q4 2026 certificate price** is published by the Commission in January 2027.

## Updating

Download the new files, replace them here, update the table above, and run
`python scripts/ingest_cbam.py` then `pytest tests/test_cbam_ingest.py`.
