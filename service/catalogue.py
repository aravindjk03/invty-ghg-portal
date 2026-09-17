"""The product carbon catalogue: which materials and routes IINVTY will hold
verified factors for. The AI may only map a line onto a key listed here."""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .config import REPO_ROOT

CATALOGUE_PATH = REPO_ROOT / "data" / "product_carbon_catalogue.csv"


@dataclass(frozen=True)
class CatalogueEntry:
    material_key: str
    display_name: str
    family: str
    production_route: str
    declared_unit: str
    tier_target: str


class Catalogue:
    def __init__(self, entries: list[CatalogueEntry]):
        self._by_key = {e.material_key: e for e in entries}

    @staticmethod
    def load(path: Path = CATALOGUE_PATH) -> "Catalogue":
        with path.open(encoding="utf-8", newline="") as f:
            rows = list(csv.DictReader(f))
        return Catalogue([
            CatalogueEntry(material_key=r["material_key"], display_name=r["display_name"],
                           family=r["family"], production_route=r["production_route"],
                           declared_unit=r["declared_unit"], tier_target=r["tier_target"])
            for r in rows])

    def __len__(self) -> int:
        return len(self._by_key)

    def get(self, key: str) -> CatalogueEntry | None:
        return self._by_key.get(key)

    def matches(self, key: str, route: str) -> bool:
        """A mapping counts only if the key exists AND the route agrees with it.
        A hallucinated key, or a real key with the wrong route, is ignored."""
        entry = self._by_key.get(key)
        return entry is not None and entry.production_route == route

    def restricted_to(self, keys) -> "Catalogue":
        """Only the entries whose key is in `keys`. Used to list, in the AI prompt,
        just the materials that actually have verified factors: listing the whole
        catalogue costs thousands of tokens per request and changes nothing when
        no factor exists to replace the AI's estimate."""
        wanted = set(keys)
        return Catalogue([e for k, e in self._by_key.items() if k in wanted])

    def prompt_listing(self) -> str:
        """Tier A material rows only, one per line, for the model's reference."""
        return "\n".join(
            f"{e.material_key} | route={e.production_route} | per {e.declared_unit} | {e.display_name}"
            for e in self._by_key.values() if e.tier_target == "A")
