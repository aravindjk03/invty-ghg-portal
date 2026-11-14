"""Write the engine's fixed answers as static files for the browser.

    python scripts/export_engine_static.py <out_dir>

The factor map, the unit choices, the methods list and the GWP sets never
change between requests: they are read from the ingested tables. Waiting for
Python to start in the browser before showing them made every screen that
names a factor wait several seconds for data that could be a file. These are
written with the engine's own handler (service.browser_api.handle), byte for
byte what the engine would answer, and tests/test_engine_static.py holds them
to it.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from service.browser_api import handle  # noqa: E402

#: Static file name -> the GET path it answers.
STATIC = {
    "catalogue-map.json": "/v1/inventory/catalogue-map",
    "unit-choices.json": "/v1/inventory/unit-choices",
    "methods.json": "/v1/methods",
    "gwp-sets.json": "/v1/inventory/gwp-sets",
}


def export(out_dir: Path) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written = {}
    for name, path in STATIC.items():
        reply = json.loads(handle("GET", path))
        if reply["status"] != 200:
            raise SystemExit(f"REFUSED: {path} answered {reply['status']}")
        text = json.dumps(reply["body"], separators=(",", ":"), ensure_ascii=False)
        (out_dir / name).write_text(text, encoding="utf-8")
        written[name] = path
    return written


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "frontend" / "public" / "engine" / "static"
    for name, path in export(target).items():
        print(f"[engine-static] {name} <- {path}")
