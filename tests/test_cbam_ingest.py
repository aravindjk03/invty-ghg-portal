"""The CBAM data is the Commission's, unchanged, and every parameter is cited."""
import csv
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CBAM = ROOT / "data" / "cbam"


def rows(name):
    with (CBAM / name).open(encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def test_ingest_is_reproducible(tmp_path):
    before = {p.name: p.read_bytes() for p in CBAM.glob("*.csv")}
    subprocess.run([sys.executable, str(ROOT / "scripts" / "ingest_cbam.py")], check=True, capture_output=True)
    after = {p.name: p.read_bytes() for p in CBAM.glob("*.csv")}
    assert before == after, "data/cbam is out of date: run python scripts/ingest_cbam.py"


def test_default_values_match_the_commission_file():
    dv = {(r["country"], r["cn"]): r for r in rows("default_values.csv")}
    # Spot checks read by eye from the Commission's workbook (India and Albania sheets).
    assert dv[("India", "2523100090")]["direct"] == "1.390"
    assert dv[("India", "2523100090")]["indirect"] == "0.050"
    assert dv[("India", "2523100090")]["total"] == "1.440"
    assert dv[("India", "2523100090")]["route"] == "(A)"
    assert dv[("India", "7601")]["total"] == "1.870"
    assert dv[("India", "28041000")]["total"] == "14.030"
    assert dv[("India", "72142000")]["total"] == "4.270"
    assert dv[("Albania", "2507008080")]["status"] == "not_published"
    assert dv[("Albania", "2507008080")]["total"] == ""


def test_every_row_is_a_value_or_says_why_not():
    for r in rows("default_values.csv"):
        if r["status"] == "value":
            assert r["total"], r
        else:
            assert r["status"] in {"not_published", "see_below", "empty"}, r
            assert r["total"] == "", r


def test_annex_iv_and_benchmarks():
    iv = {r["cn"]: r for r in rows("annex_iv.csv")}
    assert iv["7201"]["highestTotal"] == "7.920"
    assert iv["2507008080"]["highestTotal"] == "0.320"
    bm = [r for r in rows("benchmarks.csv") if r["cn"] == "72071111"]
    # Guidance No. 4, Table 2-3 reproduces these exact values.
    got = {(r["column"], r["indicator"]): r["value"] for r in bm}
    assert got == {("A", "(C)"): "0.188", ("B", "(C)"): "1.364", ("A", "(D)"): "0.065",
                   ("B", "(D)"): "0.475", ("A", "(E)"): "0.065", ("B", "(E)"): "0.066"}
    assert {r["value"] for r in rows("benchmarks.csv") if r["cn"] == "26011200"} == {"0.086"}


def test_parameters_are_cited():
    params = json.loads((CBAM / "parameters.json").read_text())
    for key in ("markUp", "cbamFactor", "cscf", "deMinimis", "indirectCounted", "obligation", "freeAllocation"):
        src = params[key]["source"]
        assert src["doc"] and src["pdfPage"] and src["quotes"], key
    assert params["cbamFactor"]["byYear"]["2026"] == "0.975"
    assert params["markUp"]["fertilisers"] == "0.01"
    assert params["cscf"]["status"] == "preliminary"
    prices = {p["quarter"]: p["eurPerCertificate"] for p in params["certificatePrice"]["quarterly2026"]}
    assert prices["Q1 2026"] == "75.36" and prices["Q3 2026"] == "82.32"


def test_bundle_matches_register():
    bundle = json.loads((ROOT / "frontend" / "src" / "cbam" / "data" / "cbamData.json").read_text())
    assert len(bundle["defaultValues"]["India"]) == sum(1 for r in rows("default_values.csv") if r["country"] == "India")
    assert "Other Countries and Territories" in bundle["defaultValues"]
    assert "India" in bundle["countries"]
