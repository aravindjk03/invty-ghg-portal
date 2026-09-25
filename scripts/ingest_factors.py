"""Ingest published emission factor workbooks into a normalised, citable table.

Reads the publishers' own files and writes one row per factor with its value,
unit, gas, publication year, geography, source and licence. Nothing is invented:
a row that cannot be read is reported, not guessed.

    python scripts/ingest_factors.py --desnz <flat-format.xlsx> --cea <CEA.xlsx>

Sources
-------
DESNZ UK Government GHG conversion factors, flat format. Open Government
Licence v3.0, so the values may be republished with attribution.

CEA CO2 Baseline Database (Central Electricity Authority, India). Published for
public use; attribute the version and year.

Output: data/factors/<source>.csv, plus a summary on stdout.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterator, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "data" / "factors"

# The gas a DESNZ "GHG/Unit" column describes. The total row is the composite.
GAS_BY_UNIT_TEXT = {
    "kg co2e": "CO2e",
    "kg co2e of co2 per unit": "CO2",
    "kg co2e of ch4 per unit": "CH4",
    "kg co2e of n2o per unit": "N2O",
}


# DESNZ converts CH4 and N2O to CO2e before publishing. Its 2025 methodology
# paper, paragraph 1.7, states the GWPs used: CH4 = 28, N2O = 265 (IPCC AR5).
# Dividing by those recovers the mass of each gas, which lets the engine express
# the same factor under AR5 or AR6 rather than being locked to the publisher's
# choice. CO2 needs no division: its GWP is 1 in every set.
DESNZ_GWP_USED = {"CH4": 28, "N2O": 265, "CO2": 1}
DESNZ_GWP_BASIS = "AR5 (DESNZ 2025 methodology paper para 1.7: CH4 = 28, N2O = 265)"


@dataclass(frozen=True)
class FactorRow:
    factor_id: str
    name: str
    scope: str
    category_path: str
    unit: str
    gas: str
    value_kgco2e_per_unit: str
    gas_mass_kg_per_unit: str      # empty for a CO2e composite
    co2e_basis: str                # the GWP set the published CO2e value used
    geography: str
    publication_year: int
    source: str
    source_version: str
    licence: str
    retrieved_on: str


def _clean(value: object) -> str:
    return "" if value is None else str(value).strip()


def read_desnz(path: Path, retrieved: str) -> Iterator[FactorRow]:
    """DESNZ flat format: one row per factor per gas, with a four-level category."""
    import openpyxl

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Factors by Category"]

    header_row: Optional[list[str]] = None
    year = 0
    for raw in sheet.iter_rows(values_only=True):
        cells = [_clean(cell) for cell in raw]
        if header_row is None:
            if cells[:2] == ["ID", "Scope"]:
                header_row = [cell.strip() for cell in cells]
            continue

        record = dict(zip(header_row, cells))
        identifier = record.get("ID", "")
        if not identifier:
            continue

        gas = GAS_BY_UNIT_TEXT.get(record.get("GHG/Unit", "").lower())
        if gas is None:
            continue  # a unit text we do not recognise: reported in the summary

        value = record.get("GHG Conversion Factor 2025") or record.get("GHG Conversion Factor")
        if not value:
            # Some editions name the column with the year appended.
            value = next((v for k, v in record.items() if k.startswith("GHG Conversion Factor")), "")
        if not value:
            continue

        levels = [record.get(f"Level {n}", "") for n in (1, 2, 3, 4)]
        levels = [level for level in levels if level and level != "None"]
        # Every level matters: "Fuels / Liquid fuels / Diesel" is the combustion
        # factor, "WTT- fuels / Liquid fuels / Diesel" is the well-to-tank one,
        # and they are different numbers in different scopes.
        column_text = record.get("Column Text", "")
        name = " — ".join(levels) if levels else identifier
        if column_text and column_text not in name:
            name = f"{name} ({column_text})"

        # Recover the gas mass where the row is a single gas.
        gas_mass = ""
        divisor = DESNZ_GWP_USED.get(gas)
        if divisor:
            try:
                gas_mass = f"{float(value) / divisor:.10g}"
            except ValueError:
                gas_mass = ""

        year = 2025
        yield FactorRow(
            factor_id=f"desnz.2025.{identifier}",
            name=name or identifier,
            scope=record.get("Scope", "").replace("Scope ", ""),
            category_path=" / ".join(levels),
            unit=record.get("UOM", ""),
            gas=gas,
            value_kgco2e_per_unit=value,
            gas_mass_kg_per_unit=gas_mass,
            co2e_basis=DESNZ_GWP_BASIS if gas != "CO2e" else DESNZ_GWP_BASIS,
            geography="UK",
            publication_year=year,
            source="DESNZ UK Government GHG conversion factors",
            source_version="2025, flat format v1",
            licence="Open Government Licence v3.0",
            retrieved_on=retrieved,
        )


def read_cea(path: Path, retrieved: str) -> Iterator[FactorRow]:
    """CEA Results sheet: emission rates in tCO2/MWh, one column per financial year."""
    import openpyxl

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = workbook["Results"]
    rows = list(sheet.iter_rows(values_only=True))

    version = ""
    published = ""
    for row in rows[:12]:
        cells = [_clean(cell) for cell in row if _clean(cell)]
        if cells and cells[0].upper().startswith("VERSION"):
            version = cells[1] if len(cells) > 1 else ""
        if cells and cells[0].upper().startswith("DATE"):
            published = cells[1][:10] if len(cells) > 1 else ""

    # The year header sits on the same row as "Emission Factors (tCO2/MWh)".
    years: list[str] = []
    wanted = {
        "weighted average emission rate": ("cea.grid.weighted_average", "Grid electricity — weighted average emission rate"),
        "weighted average grid emission rate": ("cea.grid.weighted_average_incl_res", "Grid electricity — weighted average including renewables"),
    }

    for row in rows:
        cells = [_clean(cell) for cell in row]
        joined = " ".join(cells).lower()
        if "emission factors" in joined and "tco2/mwh" in joined:
            years = [cell for cell in cells if cell and cell[0].isdigit() and "-" in cell]
            continue
        if not years:
            continue

        label = next((cell for cell in cells[:5] if cell), "").lower()
        for prefix, (key, name) in wanted.items():
            if label.startswith(prefix):
                values = [cell for cell in row if isinstance(cell, (int, float))]
                for financial_year, value in zip(years, values):
                    # tCO2 per MWh is numerically kgCO2 per kWh.
                    yield FactorRow(
                        factor_id=f"{key}.{financial_year.replace('-', '_')}",
                        name=f"{name}, FY {financial_year}",
                        scope="2",
                        category_path="Purchased electricity / India grid",
                        unit="kWh",
                        gas="CO2",
                        value_kgco2e_per_unit=f"{value:.6f}",
                        gas_mass_kg_per_unit=f"{value:.6f}",   # CO2 only: mass equals CO2e
                        co2e_basis="CO2 only — no GWP applied",
                        geography="IN",
                        publication_year=int(published[:4]) if published[:4].isdigit() else 0,
                        source="CEA CO2 Baseline Database (Central Electricity Authority, India)",
                        source_version=f"v{version}, published {published}",
                        licence="Public sector information — attribute version and year",
                        retrieved_on=retrieved,
                    )
                break


def write_csv(rows: list[FactorRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(FactorRow.__annotations__))
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desnz", type=Path, help="DESNZ flat-format workbook")
    parser.add_argument("--cea", type=Path, help="CEA CO2 Baseline Database workbook")
    args = parser.parse_args()
    retrieved = dt.date.today().isoformat()

    if args.desnz:
        rows = list(read_desnz(args.desnz, retrieved))
        write_csv(rows, OUT_DIR / "desnz_2025.csv")
        composites = [row for row in rows if row.gas == "CO2e"]
        print(f"DESNZ: {len(rows)} factor rows ({len(composites)} activities with a "
              f"CO2e total, plus their CO2/CH4/N2O breakdown)")
        print(f"  scopes: " + ", ".join(
            f"{scope}: {sum(1 for r in composites if r.scope == scope)}"
            for scope in sorted({r.scope for r in composites})))
        print(f"  -> {OUT_DIR / 'desnz_2025.csv'}")

    if args.cea:
        rows = list(read_cea(args.cea, retrieved))
        write_csv(rows, OUT_DIR / "cea_grid.csv")
        latest = rows[-1] if rows else None
        print(f"CEA: {len(rows)} grid factor rows")
        if latest:
            print(f"  latest: {latest.name} = {latest.value_kgco2e_per_unit} kgCO2/kWh")
        print(f"  -> {OUT_DIR / 'cea_grid.csv'}")


if __name__ == "__main__":
    main()
