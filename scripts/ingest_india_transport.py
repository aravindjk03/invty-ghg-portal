"""Ingest the India GHG Program road transport emission factors.

    python scripts/ingest_india_transport.py --road "Road Transport Technical Paper.pdf"

Why this matters: the DESNZ transport factors in the library are UK vehicles on
UK duty cycles. For Indian operations these are the factors to use, published by
the India GHG Program (WRI India, CII and TERI).

Why the table is written out below rather than parsed: the paper's rows do not
share a layout — some put the engine size on its own line, some inline, and two
categories differ only by "<3000 CC" against ">3000 CC". A regex over that text
produced factors attached to the WRONG vehicle, which is invisible once it
reaches a report. So the table is transcribed, and every single value is then
checked against the PDF: a value that does not appear in the source is refused,
and so is a row whose uplift is not the paper's ~8-10%.

The paper gives a base factor and one "with uplift factor", a real-world driving
allowance. Both are ingested and named, so the choice shows up in the report.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT = REPO_ROOT / "data" / "factors" / "india_transport.csv"

SOURCE = "India GHG Program (WRI India, CII, TERI) — India Specific Road Transport Emission Factors"
SOURCE_URL = "https://indiaghgp.org/transport-emission-factors"

# (group, vehicle, engine, fuel, base kgCO2/km, with uplift). None = no uplift published.
ROAD: list[tuple[str, str, str, str, float, float | None]] = [
    # Two-wheelers
    ("two_wheeler", "Scooter", "<110 CC", "Petrol", 0.0334, 0.0368),
    ("two_wheeler", "Scooter", "<150 CC", "Petrol", 0.0351, 0.0387),
    ("two_wheeler", "Motorcycle", "<100 CC", "Petrol", 0.0325, 0.0358),
    ("two_wheeler", "Motorcycle", "<125 CC", "Petrol", 0.0290, 0.0319),
    ("two_wheeler", "Motorcycle", "<135 CC", "Petrol", 0.0324, 0.0356),
    ("two_wheeler", "Motorcycle", "<200 CC", "Petrol", 0.0417, 0.0458),
    ("two_wheeler", "Motorcycle", "<300 CC", "Petrol", 0.0540, 0.0595),
    ("two_wheeler", "Motorcycle", "<500 CC", "Petrol", 0.0542, 0.0597),
    # Three-wheelers
    ("three_wheeler", "Three-wheeler", "", "Petrol", 0.1135, None),
    ("three_wheeler", "Three-wheeler", "", "Diesel", 0.1322, None),
    ("three_wheeler", "Three-wheeler", "", "CNG", 0.10768, None),
    # Passenger cars - petrol, CNG, LPG
    ("car", "Small", "<800 CC", "Gasoline", 0.103, 0.111),
    ("car", "Small", "<800 CC", "CNG", 0.063, 0.068),
    ("car", "Small", "<800 CC", "LPG", 0.138, 0.149),
    ("car", "Hatchback", "<1000 CC", "Gasoline", 0.117, 0.127),
    ("car", "Hatchback", "<1400 CC", "Gasoline", 0.130, 0.140),
    ("car", "Premium Hatchback", "<1600 CC", "Gasoline", 0.150, 0.162),
    ("car", "Compact SUV", "<1600 CC", "Gasoline", 0.153, 0.166),
    ("car", "Gypsy", "1298 CC", "Gasoline", 0.189, 0.204),
    ("car", "Sedan", "<1400 CC", "Gasoline", 0.142, 0.153),
    ("car", "Sedan", "<1600 CC", "Gasoline", 0.142, 0.153),
    ("car", "Sedan", "<2000 CC", "Gasoline", 0.149, 0.161),
    ("car", "Sedan", "<2500 CC", "Gasoline", 0.163, 0.176),
    ("car", "SUV", "<3000 CC", "Gasoline", 0.197, 0.213),
    ("car", "MUV", "<2000 CC", "Gasoline", 0.213, 0.230),
    ("car", "Premium SUV", "<2000 CC", "Gasoline", 0.193, 0.208),
    ("car", "Premium SUV", "<3000 CC", "Gasoline", 0.258, 0.279),
    ("car", "Premium SUV", ">3000 CC", "Gasoline", 0.267, 0.289),
    ("car", "Premium Sedan", "<2000 CC", "Gasoline", 0.191, 0.207),
    ("car", "Premium Sedan", "<3000 CC", "Gasoline", 0.194, 0.209),
    ("car", "Premium Sedan", ">3000 CC", "Gasoline", 0.250, 0.270),
    ("car", "Hybrid", "<2000 CC", "Gasoline", 0.095, 0.103),
    # Passenger cars - diesel
    ("car", "Hatchback", "<1000 CC", "Diesel", 0.105, 0.113),
    ("car", "Hatchback", "<1400 CC", "Diesel", 0.117, 0.126),
    ("car", "Hatchback", "<1600 CC", "Diesel", 0.136, 0.147),
    ("car", "Sedan", "<1400 CC", "Diesel", 0.121, 0.131),
    ("car", "Sedan", "<1600 CC", "Diesel", 0.131, 0.141),
    ("car", "Sedan", "<2000 CC", "Diesel", 0.148, 0.160),
    ("car", "Premium Sedan", "<2000 CC", "Diesel", 0.164, 0.177),
    ("car", "Premium Sedan", "<2500 CC", "Diesel", 0.151, 0.163),
    ("car", "Premium Sedan", "<3000 CC", "Diesel", 0.230, 0.248),
    ("car", "MUV", "<1400 CC", "Diesel", 0.145, 0.157),
    ("car", "MUV", "<2500 CC", "Diesel", 0.200, 0.216),
    ("car", "Maxi Van", "", "Diesel", 0.209, 0.226),
    ("car", "SUV", "<2000 CC", "Diesel", 0.186, 0.201),
    ("car", "SUV", "<2500 CC", "Diesel", 0.195, 0.210),
    ("car", "SUV", "<3000 CC", "Diesel", 0.203, 0.220),
    ("car", "Premium SUV", "<2000 CC", "Diesel", 0.167, 0.180),
    ("car", "Premium SUV", "<2500 CC", "Diesel", 0.199, 0.215),
    ("car", "Premium SUV", "<3000 CC", "Diesel", 0.222, 0.240),
    ("car", "Premium SUV", ">3000 CC", "Diesel", 0.269, 0.290),
    # Freight
    ("freight", "LDV", "<3.5 t", "Diesel", 0.3070, None),
    ("freight", "MDV", "<12 t", "Diesel", 0.5928, None),
    ("freight", "HDV", ">12 t", "Diesel", 0.7375, None),
]

# Reported per passenger-kilometre, and explicitly not for BRTS or intercity.
BUS = ("bus", "Bus", "intracity", "Diesel", 0.015161, None)


def key_for(group: str, vehicle: str, engine: str, fuel: str) -> str:
    label = f"{vehicle} {engine} {fuel}".replace("<", "under ").replace(">", "over ")
    slug = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return f"indiaghgp.road.{group}.{slug}"


def verify(pdf_path: Path) -> list[str]:
    """Check every transcribed value against the PDF. Returns the problems found."""
    import pymupdf

    doc = pymupdf.open(pdf_path)
    text = "\n".join(doc[page].get_text() for page in range(doc.page_count))
    problems: list[str] = []

    for group, vehicle, engine, fuel, base, uplift in [*ROAD, BUS]:
        name = f"{vehicle} {engine} {fuel}".strip()
        for label, value in (("base", base), ("uplifted", uplift)):
            if value is None:
                continue
            # The paper prints 0.103, 0.0334, 0.10768 - match the number as written.
            printed = f"{value:g}"
            variants = {printed, f"{value:.3f}", f"{value:.4f}", f"{value:.5f}"}
            if not any(re.search(rf"(?<![\d.]){re.escape(v)}(?![\d])", text) for v in variants):
                problems.append(f"{name} ({label}): {printed} does not appear in the paper")

        if uplift is not None:
            ratio = uplift / base
            if not (1.05 <= ratio <= 1.12):
                problems.append(f"{name}: uplift is {ratio:.3f}x base, outside the paper's ~1.08")

    keys = [key_for(*row[:4]) for row in [*ROAD, BUS]]
    duplicates = {key for key in keys if keys.count(key) > 1}
    problems.extend(f"duplicate key {key}" for key in sorted(duplicates))
    return problems


def write(retrieved: str) -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    fields = ["factor_id", "name", "scope", "category_path", "unit", "gas",
              "value_kgco2e_per_unit", "gas_mass_kg_per_unit", "co2e_basis", "geography",
              "publication_year", "source", "source_version", "licence", "retrieved_on"]
    written = 0
    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for group, vehicle, engine, fuel, base, uplift in [*ROAD, BUS]:
            unit = "passenger.km" if group == "bus" else "km"
            label = " ".join(part for part in (vehicle, engine, fuel) if part)
            for suffix, value, note in (
                ("", base, ""),
                (".uplifted", uplift, " (with the paper's real-world uplift)"),
            ):
                if value is None:
                    continue
                writer.writerow({
                    "factor_id": key_for(group, vehicle, engine, fuel) + suffix,
                    "name": f"India road — {label}{note}",
                    "scope": "1",
                    "category_path": "Mobile combustion / India road transport",
                    "unit": unit,
                    "gas": "CO2",
                    "value_kgco2e_per_unit": f"{value:g}",
                    "gas_mass_kg_per_unit": f"{value:g}",
                    "co2e_basis": "CO2 only — the paper publishes CO2, not CO2e",
                    "geography": "IN",
                    "publication_year": 2015,
                    "source": SOURCE,
                    "source_version": f"India Specific Road Transport Emission Factors ({SOURCE_URL})",
                    "licence": "Published for public use — attribute the India GHG Program",
                    "retrieved_on": retrieved,
                })
                written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--road", type=Path, required=True)
    args = parser.parse_args()

    problems = verify(args.road)
    if problems:
        print(f"REFUSED: {len(problems)} transcription problem(s); nothing written")
        for problem in problems:
            print(f"  {problem}")
        raise SystemExit(1)

    written = write(dt.date.today().isoformat())
    print(f"India road transport: {len(ROAD) + 1} categories, {written} factor rows")
    print("  every value verified against the paper, uplift ratios within 1.05-1.12")
    print(f"  -> {OUT}")


if __name__ == "__main__":
    main()
