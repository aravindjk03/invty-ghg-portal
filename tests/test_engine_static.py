"""The engine's fixed answers, written as static files, equal what it serves.

The browser reads the factor map, unit choices, methods list and GWP sets from
files so it does not wait for Python to start. A file that drifted from the
engine would show one factor and calculate with another, so each is written
here afresh and compared with the live handler.
"""
import json
import sys
from pathlib import Path

import pytest

pytest.importorskip("pydantic")

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from export_engine_static import STATIC, export  # noqa: E402
from service.browser_api import handle  # noqa: E402


def test_every_static_answer_equals_the_engine(tmp_path):
    export(tmp_path)
    for name, path in STATIC.items():
        served = json.loads(handle("GET", path))
        assert served["status"] == 200
        assert json.loads((tmp_path / name).read_text(encoding="utf-8")) == served["body"], name


def test_only_fixed_answers_are_static():
    # Nothing that depends on the visitor's inputs may ever be a file.
    assert all(path.startswith("/v1/") and "calculate" not in path for path in STATIC.values())
