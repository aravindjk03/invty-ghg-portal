"""Turn the European Commission's CBAM files into the data the calculator uses.

    python scripts/ingest_cbam.py

Reads only the official files kept in data/cbam/sources/ (see the README
there for where each came from and its checksum):

  default_values_IR_2026-1740.xlsx  Annex I (per country) and Annex IV of
                                    Implementing Regulation (EU) 2025/2621 as
                                    corrected by (EU) 2026/1740
  benchmarks_IR_2025-2620.xlsx      Annex point 5 of Implementing Regulation
                                    (EU) 2025/2620 (free allocation adjustment)
  price_of_cbam_certificates_*.html the Commission's published certificate prices
  guidance{1,3,4}_extract.txt       text of Commission Guidance Nos. 1, 3 and 4,
                                    the source of every parameter below

Writes data/cbam/*.csv, data/cbam/parameters.json and the browser bundle
frontend/src/cbam/data/cbamData.json.

Nothing is typed in from memory. A cell the Commission left as "-" stays
empty with the reason, and the calculator says there is no published default.
Each parameter in PARAMETERS is checked against the guidance text it cites:
if the quoted wording is not found there, the script stops.
"""
from __future__ import annotations

import csv
import hashlib
import html
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "cbam" / "sources"
OUT = ROOT / "data" / "cbam"
BUNDLE = ROOT / "frontend" / "src" / "cbam" / "data" / "cbamData.json"

DV_FILE = SRC / "default_values_IR_2026-1740.xlsx"
BM_FILE = SRC / "benchmarks_IR_2025-2620.xlsx"

DV_ACT = "Implementing Regulation (EU) 2025/2621, Annex I, as corrected by Implementing Regulation (EU) 2026/1740"
ANNEX_IV_ACT = "Implementing Regulation (EU) 2025/2621, Annex IV, as corrected by Implementing Regulation (EU) 2026/1740"
BM_ACT = "Implementing Regulation (EU) 2025/2620, Annex point 5"

SECTORS = {
    "Cement": "cement",
    "Fertilisers": "fertilisers",
    "Aluminium": "aluminium",
    "Hydrogen": "hydrogen",
    "Iron and steel": "iron_steel",
    "Iron & Steel": "iron_steel",
    "Iron and Steel": "iron_steel",
    "Electricity": "electricity",
}

G1 = "European Commission, Guidance No. 1 - Introduction to CBAM concepts"
G3 = "European Commission, Guidance No. 3 - CBAM methods for the calculation of emissions embedded in goods"
G4 = ("European Commission, Guidance No. 4 - CBAM calculation of the free allocation adjustment "
      "to the number of CBAM certificates to be surrendered")

# Every parameter carries the exact words it rests on; check_quotes() confirms
# each quote is present in the cited guidance text before anything is written.
PARAMETERS = {
    "markUp": {
        "byYear": {"2026": "0.10", "2027": "0.20", "2028": "0.30"},
        "fromYear2028": "0.30",
        "fertilisers": "0.01",
        "appliesTo": "total default value (direct + indirect where indirect counts), Annex I and Annex IV",
        "source": {"doc": G3, "file": "guidance3_extract.txt", "pdfPage": 115,
                   "quotes": ["10% in 2026", "20% in 2027, and", "30% from 2028 onwards.",
                              "A lower mark-up applies to the fertiliser sector.",
                              "This mark-up is 1% from 2026 onwards."]},
    },
    "cbamFactor": {
        "byYear": {"2026": "0.975", "2027": "0.950", "2028": "0.900", "2029": "0.775", "2030": "0.515",
                   "2031": "0.390", "2032": "0.265", "2033": "0.140", "2034": "0.000"},
        "source": {"doc": G4, "file": "guidance4_extract.txt", "pdfPage": 13, "table": "Table 2-1",
                   "quotes": ["2026          97,5%", "2027          95,0%", "2028          90,0%",
                              "2029          77,5%", "2030          51,5%", "2031          39,0%",
                              "2032          26,5%", "2033          14,0%", "2034           0,0%"]},
    },
    "cscf": {
        "byYear": {"2026": "1.0", "2027": "1.0", "2028": "1.0", "2029": "1.0", "2030": "1.0"},
        "status": "preliminary",
        "note": ("Guidance No. 4 lists these as preliminary. The final values for 2026-2030 are in Commission "
                 "Implementing Decision (EU) 2026/1862, which could not be retrieved (EUR-Lex refuses automated "
                 "access). Check that decision and change the value in the calculator if it differs."),
        "source": {"doc": G4, "file": "guidance4_extract.txt", "pdfPage": 13, "table": "Table 2-1",
                   "quotes": ["(partly preliminary) CSCF values", "Commission Implementing Decision",
                              "(EU) 2026/1862"]},
    },
    "deMinimis": {
        "tonnesPerYear": "50",
        "excludedSectors": ["electricity", "hydrogen"],
        "source": {"doc": G1, "file": "guidance1_extract.txt", "pdfPage": 23,
                   "quotes": ["The current threshold is set at 50 tonnes of net mass",
                              "does not apply to imports of electricity or hydrogen"]},
    },
    "indirectCounted": {
        "sectors": ["cement", "fertilisers"],
        "source": {"doc": G3, "file": "guidance3_extract.txt", "pdfPage": 19,
                   "quotes": ["indirect emissions are relevant for:", "Goods from the cement sector;",
                              "Goods from the fertiliser sector;"]},
    },
    "defaultValueRules": {
        "otherCountries": ("Where the good is not listed for the country of production in Annex I, or the field "
                           "shows '-', use the table 'Other countries and territories'."),
        "annexIV": "Precursors whose country of production is unknown use Annex IV (highest default value).",
        "source": {"doc": G3, "file": "guidance3_extract.txt", "pdfPage": 114,
                   "quotes": ["Other countries and territories", "Operators using precursors of unknown country of origin"]},
    },
    "obligation": {
        "formula": "max[0; SEE - SEFA - SECPP / RP_CBAM] x M",
        "source": {"doc": G1, "file": "guidance1_extract.txt", "pdfPage": 15,
                   "quotes": ["ensures that any result of the formula which is below zero would",
                              "RPCBAM is the reference price of a CBAM certificate"]},
    },
    "freeAllocation": {
        "processSFA": "SFA = CBAM_y x CSCF_y x BM_A (Column A)",
        "complexSEFA": "SEFA = SFA + sum(m_i x SEFA_i); EU-origin precursors count as zero",
        "defaultSEFA": "SEFA = CBAM_y x CSCF_y x BM_B (Column B), route from Annex I / Annex IV",
        "electricity": "Free allocation adjustment for electricity (CN 2716 00 00) is zero.",
        "source": {"doc": G4, "file": "guidance4_extract.txt", "pdfPage": 11,
                   "quotes": ["Equation (2)", "Equation (4)", "Equation (6)",
                              "the specific free allocation of any precursor",
                              "electrical energy (CN code 2716 00 00), as it is zero"]},
    },
}

GROUND_RULE = ("Values are copied from the Commission's files without change; '-' in the source means no "
               "default was published for that good and country.")


def norm_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def check_quotes() -> None:
    for key, param in PARAMETERS.items():
        src = param["source"]
        text = (SRC / src["file"]).read_text(encoding="utf-8")
        flat = norm_ws(text)
        for q in src["quotes"]:
            if q not in text and norm_ws(q) not in flat:
                raise SystemExit(f"[ingest_cbam] {key}: quote not found in {src['file']}: {q!r}")


def number(cell) -> str | None:
    """'0,870' -> '0.870'. Keeps the published digits; never rounds."""
    if cell is None:
        return None
    if isinstance(cell, (int, float)):
        return repr(cell) if isinstance(cell, float) else str(cell)
    s = str(cell).strip()
    if re.fullmatch(r"-?\d+(,\d+)?", s):
        return s.replace(",", ".")
    if re.fullmatch(r"-?\d+(\.\d+)?", s):
        return s
    return None


def cn_digits(code) -> str:
    return re.sub(r"\D", "", str(code))


def read_default_values():
    wb = openpyxl.load_workbook(DV_FILE, read_only=True, data_only=True)
    countries = {}
    goods = {}
    annex_iv = []
    for ws in wb.worksheets:
        if ws.title in ("Overview", "Version History"):
            continue
        rows = list(ws.iter_rows(values_only=True))
        is_annex_iv = ws.title == "Annex IV"
        name = "Annex IV" if is_annex_iv else str(rows[0][0]).strip()
        sector = None
        entries = []
        for r in rows[2:]:
            if not r or r[0] in (None, ""):
                continue
            first = str(r[0]).strip()
            if first in SECTORS and all(c in (None, "") for c in r[1:]):
                sector = SECTORS[first]
                continue
            code = cn_digits(first)
            if not code:
                continue
            desc = (r[1] or "").strip()
            if is_annex_iv:
                total_raw = r[2]
                route = (r[3] or "").strip() if len(r) > 3 and r[3] else ""
                annex_iv.append({"cn": code, "description": desc, "sector": sector,
                                 "highestTotal": number(total_raw),
                                 "status": status_of(total_raw), "route": route})
            else:
                d, i, t = r[2], r[3], r[4]
                route = (r[5] or "").strip() if len(r) > 5 and r[5] else ""
                entries.append({"cn": code, "description": desc, "sector": sector,
                                "direct": number(d), "indirect": number(i), "total": number(t),
                                "indirectNA": str(i).strip() == "N/A",
                                "status": status_of(t), "route": route})
            goods.setdefault(code, {"cn": code, "description": desc, "sector": sector})
        if not is_annex_iv:
            countries[name] = entries
    return countries, annex_iv, goods


def status_of(cell) -> str:
    if number(cell) is not None:
        return "value"
    s = str(cell or "").strip()
    if s == "see below":
        return "see_below"
    if s == "-":
        return "not_published"
    return "empty"


def read_benchmarks():
    wb = openpyxl.load_workbook(BM_FILE, read_only=True, data_only=True)
    rows = list(wb["Benchmarks"].iter_rows(values_only=True))
    out = []
    current = None
    sector = None
    for r in rows[1:]:
        a, desc, va, ia, vb, ib = (list(r) + [None] * 6)[:6]
        if isinstance(a, str) and a.strip() in SECTORS and va is None and vb is None:
            sector = SECTORS[a.strip()]
            continue
        if a not in (None, ""):
            current = {"cn": cn_digits(a), "description": (desc or "").strip(), "sector": sector}
        if current is None:
            continue
        if va is not None:
            out.append({**current, "column": "A", "value": number(va), "indicator": (ia or "").strip()})
        if vb is not None:
            out.append({**current, "column": "B", "value": number(vb), "indicator": (ib or "").strip()})
    return out


def read_prices():
    page = next(SRC.glob("price_of_cbam_certificates_*.html"))
    text = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<script.*?</script>", "", page.read_text(), flags=re.S)))
    text = norm_ws(text)
    fetched = re.search(r"(\d{4}-\d{2}-\d{2})", page.name).group(1)
    prices = []
    for q in ("Q1", "Q2", "Q3", "Q4"):
        m = re.search(rf"{q} 2026 (\d{{1,2}} \w+ \d{{4}})(?: (\d+\.\d+))?", text)
        if not m:
            raise SystemExit(f"[ingest_cbam] price table row {q} 2026 not found")
        prices.append({"quarter": f"{q} 2026", "published": m.group(1), "eurPerCertificate": m.group(2)})
    return {
        "quarterly2026": prices,
        "rule": ("2026: one price per calendar quarter, applying to goods imported in that quarter. "
                 "From 2027: weekly prices."),
        "source": {"doc": "European Commission, Price of CBAM certificates (taxation-customs.ec.europa.eu)",
                   "url": "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/price-cbam-certificates_en",
                   "fetched": fetched, "file": page.name},
    }


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=header, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow(row)


def main() -> None:
    check_quotes()
    countries, annex_iv, goods = read_default_values()
    benchmarks = read_benchmarks()
    prices = read_prices()

    for b in benchmarks:
        goods.setdefault(b["cn"], {"cn": b["cn"], "description": b["description"], "sector": b["sector"]})
    goods["27160000"] = {"cn": "27160000", "description": "Electrical energy", "sector": "electricity"}

    sources = {
        "defaultValues": {"act": DV_ACT, "annexIV": ANNEX_IV_ACT, "file": DV_FILE.name, "sha256": sha256(DV_FILE),
                          "url": "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en",
                          "fileVersion": "Version 2, 6 August 2026",
                          "notIncluded": ("Annex II (country grid emission factors) and Annex III (electricity as a good) are "
                                          "not in the Commission's file and could not be retrieved from EUR-Lex; their data is "
                                          "also IEA-licensed for non-commercial use only. Electricity emission factors are "
                                          "therefore entered by the user with their source.")},
        "benchmarks": {"act": BM_ACT, "file": BM_FILE.name, "sha256": sha256(BM_FILE),
                       "url": "https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism/cbam-legislation-and-guidance_en",
                       "fileVersion": "Version 1"},
    }

    params = {"groundRule": GROUND_RULE, "sources": sources, "certificatePrice": prices, **PARAMETERS}

    # ── data/cbam: the register of record ───────────────────────────────
    goods_rows = []
    for g in sorted(goods.values(), key=lambda g: g["cn"]):
        goods_rows.append({**g, "indirectCounted": g["sector"] in PARAMETERS["indirectCounted"]["sectors"]})
    write_csv(OUT / "goods.csv", ["cn", "description", "sector", "indirectCounted"], goods_rows)

    # The act each row comes from is in parameters.json (sources.defaultValues).
    dv_rows = [{"country": c, **e} for c, entries in sorted(countries.items()) for e in entries]
    write_csv(OUT / "default_values.csv",
              ["country", "cn", "description", "sector", "direct", "indirect", "total", "route", "status"], dv_rows)
    write_csv(OUT / "annex_iv.csv", ["cn", "description", "sector", "highestTotal", "route", "status"], annex_iv)
    write_csv(OUT / "benchmarks.csv", ["cn", "description", "sector", "column", "value", "indicator"], benchmarks)
    (OUT / "parameters.json").write_text(json.dumps(params, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # ── browser bundle: compact, same values ────────────────────────────
    def dv_compact(e):
        return [e["cn"], e["direct"], e["indirect"], e["total"], e["route"], e["status"]]

    bundle = {
        "generatedBy": "scripts/ingest_cbam.py",
        "parameters": params,
        "goods": [[g["cn"], g["description"], g["sector"]] for g in goods_rows],
        "countries": sorted(c for c in countries if c != "Other Countries and Territories"),
        "defaultValues": {c: [dv_compact(e) for e in entries] for c, entries in sorted(countries.items())},
        "annexIV": [[e["cn"], e["highestTotal"], e["route"], e["status"]] for e in annex_iv],
        "benchmarks": [[b["cn"], b["column"], b["value"], b["indicator"]] for b in benchmarks],
    }
    BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE.write_text(json.dumps(bundle, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")

    n_dv = sum(len(v) for v in countries.values())
    print(f"[ingest_cbam] {len(goods_rows)} goods, {len(countries)} country tables ({n_dv} rows), "
          f"{len(annex_iv)} Annex IV rows, {len(benchmarks)} benchmark values, "
          f"prices: {[p['eurPerCertificate'] for p in prices['quarterly2026']]}")


if __name__ == "__main__":
    main()
