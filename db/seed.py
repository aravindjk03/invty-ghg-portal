"""Database seeding scripts.

Loads the activity catalogue from data/emission_source_catalogue.csv.
CRITICAL REQUIREMENT: Do NOT insert any emission factor values.
The emission_factor table MUST remain completely empty until the ingestion pipeline runs.
"""
from __future__ import annotations

import csv
import json
from decimal import Decimal
from pathlib import Path
from typing import Optional
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ActivityCatalogue, EmissionFactor, GwpSet, GwpValue


def seed_activity_catalogue(
    session: Session,
    csv_path: Optional[str | Path] = None
) -> int:
    """Seed the activity_catalogue table from emission_source_catalogue.csv.
    
    Hard requirement:
    Leaves emission_factor completely empty.
    Returns the count of activity catalogue entries seeded.
    """
    path = Path(csv_path or Path(__file__).resolve().parent.parent / "data" / "emission_source_catalogue.csv")
    if not path.exists():
        raise FileNotFoundError(f"Catalogue CSV not found at: {path}")

    # Guard: ensure emission_factor is not touched
    initial_factor_count = session.scalar(select(EmissionFactor).limit(1))
    if initial_factor_count is not None:
        # Table had factors before; ensure we don't add more here
        pass

    count = 0
    with open(path, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            activity_key = row["activity_key"].strip()
            display_name = row["display_name"].strip()
            group_name = row["group"].strip()
            scope = row["scope"].strip()
            ghg_category = row["ghg_category"].strip()
            category_name = row["category_name"].strip()
            default_unit = row["default_unit"].strip()
            allowed_units = row["allowed_units"].strip()
            gases = row["gases"].strip()
            factor_source = row["factor_source"].strip()
            notes = row.get("notes", "").strip() or None

            existing = session.get(ActivityCatalogue, activity_key)
            if existing is None:
                item = ActivityCatalogue(
                    activity_key=activity_key,
                    display_name=display_name,
                    group_name=group_name,
                    scope=scope,
                    ghg_category=ghg_category,
                    category_name=category_name,
                    default_unit=default_unit,
                    allowed_units=allowed_units,
                    gases=gases,
                    factor_source=factor_source,
                    notes=notes,
                )
                session.add(item)
            else:
                existing.display_name = display_name
                existing.group_name = group_name
                existing.scope = scope
                existing.ghg_category = ghg_category
                existing.category_name = category_name
                existing.default_unit = default_unit
                existing.allowed_units = allowed_units
                existing.gases = gases
                existing.factor_source = factor_source
                existing.notes = notes
            count += 1

    session.flush()

    # Assert emission_factor table was NOT populated by catalogue seeding
    factors_after = session.scalar(select(EmissionFactor).limit(1))
    if initial_factor_count is None and factors_after is not None:
        raise RuntimeError("Violation: emission_factor table was modified during catalogue seeding!")

    session.commit()
    return count


def seed_gwp_from_json(
    session: Session,
    json_path: str | Path
) -> GwpSet:
    """Load and persist a GwpSet and its constituent GwpValues from a JSON file."""
    path = Path(json_path)
    if not path.exists():
        raise FileNotFoundError(f"GWP JSON file not found at: {path}")

    data = json.loads(path.read_text(encoding="utf-8"))
    name = data["name"]
    horizon_years = data["horizon_years"]
    source_name = data["source_name"]
    source_url = data["source_url"]
    values = data["values"]

    gwp_set = session.get(GwpSet, name)
    if gwp_set is None:
        gwp_set = GwpSet(
            name=name,
            horizon_years=horizon_years,
            source_name=source_name,
            source_url=source_url,
        )
        session.add(gwp_set)
        session.flush()

    for gas, val in values.items():
        if val is not None:
            num_val = Decimal(str(val))
            existing_val = session.query(GwpValue).filter_by(gwp_set_name=name, gas=gas).one_or_none()
            if existing_val is None:
                gv = GwpValue(gwp_set_name=name, gas=gas, value=num_val)
                session.add(gv)
            else:
                existing_val.value = num_val

    session.commit()
    return gwp_set


if __name__ == "__main__":
    from .base import create_db_engine, create_session_factory, init_db

    engine = create_db_engine()
    init_db(engine)
    SessionFactory = create_session_factory(engine)
    with SessionFactory() as s:
        seeded = seed_activity_catalogue(s)
        print(f"Successfully seeded {seeded} activity catalogue records into database.")
