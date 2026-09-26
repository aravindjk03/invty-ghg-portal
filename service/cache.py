"""Cache of AI decompositions, so a repeated search costs nothing.

What is cached is the AI's OUTPUT (the lifecycle lines), not the computed
response. Every hit still runs through the verified-factor lookup and
ghg_core, so once real factors are ingested, cached estimates upgrade without
a new AI call.

The key covers everything that could change the AI's answer: model, the prompt
and schema fingerprint, and the normalised product, region and details. Edit
the prompt and every old entry misses.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from pathlib import Path
from typing import Optional

from .schemas import Decomposition, EstimateRequest


def _normalise(text: str) -> str:
    return " ".join(text.lower().split())


def cache_key(model: str, prompt_fingerprint: str, request: EstimateRequest) -> str:
    payload = json.dumps([model, prompt_fingerprint, _normalise(request.product),
                          request.region, _normalise(request.details)])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class DecompositionCache:
    def __init__(self, path: Path, ttl_seconds: int, clock=time.time):
        self.path, self.ttl_seconds, self._clock = path, ttl_seconds, clock
        if self.enabled:
            path.parent.mkdir(parents=True, exist_ok=True)
            with self._connect() as db:
                db.execute("CREATE TABLE IF NOT EXISTS decompositions ("
                           " key TEXT PRIMARY KEY, created_at REAL NOT NULL,"
                           " model TEXT NOT NULL, payload TEXT NOT NULL)")

    @property
    def enabled(self) -> bool:
        return self.ttl_seconds > 0

    def _connect(self) -> sqlite3.Connection:
        # A connection per call keeps this safe under FastAPI's threadpool.
        return sqlite3.connect(self.path, timeout=5)

    def get(self, key: str) -> Optional[Decomposition]:
        hit = self.lookup(key)
        return None if hit is None else hit[0]

    def lookup(self, key: str) -> Optional[tuple[Decomposition, str]]:
        """(decomposition, model that produced it), or None."""
        if not self.enabled:
            return None
        with self._connect() as db:
            row = db.execute("SELECT created_at, payload, model FROM decompositions WHERE key = ?",
                             (key,)).fetchone()
        if row is None or self._clock() - row[0] > self.ttl_seconds:
            return None
        return Decomposition.model_validate_json(row[1]), row[2]

    def put(self, key: str, model: str, decomposition: Decomposition) -> None:
        if not self.enabled:
            return
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO decompositions VALUES (?, ?, ?, ?)",
                       (key, self._clock(), model, decomposition.model_dump_json()))
